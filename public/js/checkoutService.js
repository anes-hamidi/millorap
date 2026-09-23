// ==============================================================================
// CLIENT-SIDE CHECKOUT SERVICE (ATOMIC INDEXEDDB TRANSACTIONS & MULTI-REGISTER)
// ==============================================================================
(function() {
  /**
   * Process an atomic checkout transaction.
   * Runs in an isolated Read-Write transaction across all stores:
   * products, sales, saleItems, stockLogs.
   *
   * @param {Object} orderData
   * @param {Array} orderData.items - Array of { id, qty, saleUnit: 'unit'|'pack' }
   * @param {number} orderData.discountPercent - Order-wide discount percent (0-100)
   * @param {string} orderData.paymentMethod - 'cash' | 'card' | 'qr' | 'credit'
   * @returns {Promise<Object>} Completed sale receipt and audit summary
   */
  async function processCheckout({ items, discountPercent = 0, paymentMethod = 'cash' }) {
    if (window.FlexiDB && window.FlexiDB.init) {
      await window.FlexiDB.init();
    }
    
    if (!window.FlexiDB || !window.FlexiDB.db) {
      throw new Error('Database is not initialized. Please refresh the page.');
    }
    const db = window.FlexiDB.db;

    // Terminal-scoped unique human-readable Order Reference
    const terminalId = localStorage.getItem('pos_terminal_id') || 'T1';
    const orderRef = 'DZ-' + terminalId + '-' + Date.now().toString(36) + '-' + Math.floor(100 + Math.random() * 900);
    const timestamp = new Date().toISOString();

    // Stores participating in atomic transaction
    const txStores = [db.products, db.sales, db.saleItems, db.stockLogs];
    if (db.batches) txStores.push(db.batches);

    // Execute atomic IndexedDB transaction across all stores
    return await db.transaction('rw', txStores, async () => {
      // 1. Fetch fresh state of all products in cart & lock/validate stock
      const productIds = items.map(i => {
        const num = Number(i.id);
        return isNaN(num) ? i.id : num;
      });
      const freshProducts = await db.products.where('id').anyOf(productIds).toArray();
      const productMap = new Map();
      freshProducts.forEach(p => {
        productMap.set(p.id, p);
        productMap.set(String(p.id), p);
      });

      let subtotal = 0;
      let totalCost = 0;
      const validatedLineItems = [];

      for (const item of items) {
        const product = productMap.get(item.id) || productMap.get(Number(item.id));

        if (!product) {
          throw new Error('Product with ID ' + item.id + ' was not found in inventory.');
        }

        const requestedQty = parseInt(item.qty, 10) || 1;
        if (requestedQty <= 0) {
          throw new Error('Invalid quantity for ' + product.name + ': ' + requestedQty);
        }

        // Unit vs Pack selling logic (Task 2)
        const unitsPerPack = Math.max(1, parseInt(product.unitsPerPack, 10) || 1);
        const isPack = item.saleUnit === 'pack' && unitsPerPack > 1;
        const multiplier = isPack ? unitsPerPack : 1;
        const baseQuantity = requestedQty * multiplier;

        // Strict stock validation against base inventory units
        if (product.currentStock < baseQuantity) {
          const unitMsg = isPack ? ` (${requestedQty} ${product.packUnitLabel || 'packs'} = ${baseQuantity} unités)` : '';
          throw new Error(
            'Insufficient stock for "' + product.name + '". Available: ' + product.currentStock + ', Requested: ' + baseQuantity + unitMsg
          );
        }

        const baseSellingPrice = Number(product.sellingPrice) || 0;
        const baseCostPrice = Number(product.costPrice) || 0;

        let unitSellingPrice;
        let unitCostPrice;

        if (isPack) {
          unitSellingPrice = (product.packPrice != null && Number(product.packPrice) > 0)
            ? Number(product.packPrice)
            : (baseSellingPrice * multiplier);
          unitCostPrice = baseCostPrice * multiplier;
        } else {
          unitSellingPrice = baseSellingPrice;
          unitCostPrice = baseCostPrice;
        }

        const lineTotal = unitSellingPrice * requestedQty;
        const lineCost = unitCostPrice * requestedQty;
        const lineProfit = lineTotal - lineCost;

        subtotal += lineTotal;
        totalCost += lineCost;

        validatedLineItems.push({
          product,
          productId: product.id,
          productName: product.name,
          barcode: product.barcode || '',
          saleUnit: isPack ? 'pack' : 'unit',
          packUnitLabel: product.packUnitLabel || '',
          unitMultiplier: multiplier,
          quantity: requestedQty,
          baseQuantity: baseQuantity,
          unitCostPrice: unitCostPrice,
          unitSellingPrice: unitSellingPrice,
          lineTotal,
          lineCost,
          lineProfit
        });
      }

      // Calculate order-wide discount & financial aggregates
      const discountPct = Math.min(100, Math.max(0, parseFloat(discountPercent) || 0));
      const discountAmount = subtotal * (discountPct / 100);
      const totalAmount = Math.max(0, subtotal - discountAmount);

      // Proportionally adjust cost / net profit with discount
      const netProfit = totalAmount - totalCost;

      // 2. Relative stock decrement & FIFO batch depletion & audit log creation
      for (const line of validatedLineItems) {
        const prevStock = line.product.currentStock;
        const newStock = prevStock - line.baseQuantity;
        const numericProdId = Number(line.productId);
        const targetProdId = isNaN(numericProdId) ? line.productId : numericProdId;

        // Multi-register race-condition safe relative stock decrement
        await db.products.where('id').equals(targetProdId).modify(p => {
          p.currentStock = (Number(p.currentStock) || 0) - line.baseQuantity;
          p.updatedAt = timestamp;
        });

        // FIFO Depletion of perishable batches (if batches store exists)
        if (db.batches) {
          let qtyToDeplete = line.baseQuantity;
          const allBatches = await db.batches.toArray();
          const productBatches = allBatches.filter(b => 
            b.productId === targetProdId || String(b.productId) === String(targetProdId)
          );

          // Sort batches by expiryDate ascending (soonest expiring first)
          productBatches.sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

          for (const batch of productBatches) {
            if (qtyToDeplete <= 0) break;
            const currentBatchQty = Number(batch.remainingQty != null ? batch.remainingQty : (batch.quantity != null ? batch.quantity : 0));
            if (currentBatchQty <= 0) continue;

            const deduct = Math.min(currentBatchQty, qtyToDeplete);
            const updatedQty = currentBatchQty - deduct;
            qtyToDeplete -= deduct;

            await db.batches.update(batch.id, {
              remainingQty: updatedQty,
              quantity: updatedQty,
              updatedAt: timestamp
            });
          }
        }

        // Insert stock movement log
        await db.stockLogs.add({
          productId: targetProdId,
          timestamp,
          type: 'SALE',
          quantityChange: -line.baseQuantity,
          previousStock: prevStock,
          newStock: newStock,
          referenceId: orderRef,
          note: `Sale ${orderRef} (${paymentMethod.toUpperCase()}) - ${line.quantity} ${line.saleUnit === 'pack' ? (line.packUnitLabel || 'pack') : 'unité(s)'}`
        });
      }

      // 3. Insert primary Sale record
      const lineItemsSnapshot = validatedLineItems.map(l => ({
        id: l.productId,
        name: l.productName,
        qty: l.quantity,
        saleUnit: l.saleUnit,
        unitMultiplier: l.unitMultiplier,
        price: l.unitSellingPrice,
        total: l.lineTotal
      }));

      const saleId = await db.sales.add({
        orderRef,
        terminalId,
        timestamp,
        paymentMethod: paymentMethod.toLowerCase(),
        subtotal,
        discountAmount,
        discountPercent: discountPct,
        totalAmount,
        totalCost,
        netProfit,
        itemCount: validatedLineItems.reduce((acc, l) => acc + l.quantity, 0),
        items: lineItemsSnapshot
      });

      // 4. Insert Line Items snapshots linked to saleId
      for (const line of validatedLineItems) {
        await db.saleItems.add({
          saleId,
          productId: line.productId,
          productName: line.productName,
          barcode: line.barcode,
          saleUnit: line.saleUnit,
          packUnitLabel: line.packUnitLabel,
          unitMultiplier: line.unitMultiplier,
          quantity: line.quantity,
          baseQuantity: line.baseQuantity,
          unitCostPrice: line.unitCostPrice,
          unitSellingPrice: line.unitSellingPrice,
          lineTotal: line.lineTotal,
          lineProfit: line.lineProfit
        });
      }

      // Return complete sale payload
      return {
        success: true,
        saleId,
        orderRef,
        terminalId,
        timestamp,
        paymentMethod,
        subtotal,
        discountAmount,
        discountPercent: discountPct,
        totalAmount,
        totalCost,
        netProfit,
        items: validatedLineItems.map(l => ({
          id: l.productId,
          name: l.productName,
          barcode: l.barcode,
          saleUnit: l.saleUnit,
          packUnitLabel: l.packUnitLabel,
          unitMultiplier: l.unitMultiplier,
          qty: l.quantity,
          price: l.unitSellingPrice,
          cost: l.unitCostPrice,
          total: l.lineTotal
        }))
      };
    });
  }

  /**
   * Process an order return / refund transaction.
   * Restores product stock, creates RESTOCK logs, and marks sale as refunded.
   */
  async function processRefund(orderRef, reason = 'Client return') {
    if (window.FlexiDB && window.FlexiDB.init) {
      await window.FlexiDB.init();
    }
    if (!window.FlexiDB || !window.FlexiDB.db) {
      throw new Error('Database is not initialized.');
    }
    const db = window.FlexiDB.db;
    const timestamp = new Date().toISOString();

    return await db.transaction('rw', db.products, db.sales, db.saleItems, db.stockLogs, db.debts, async () => {
      const sale = await db.sales.where('orderRef').equals(orderRef).first();
      if (!sale) throw new Error('Commande introuvable.');
      if (sale.status === 'refunded') throw new Error('Cette commande a déjà été remboursée.');

      let lineItems = await db.saleItems.where('saleId').equals(sale.id).toArray();
      if ((!lineItems || lineItems.length === 0) && sale.items && sale.items.length > 0) {
        lineItems = sale.items.map(i => ({
          productId: i.id,
          productName: i.name,
          quantity: i.qty || 1,
          unitMultiplier: i.unitMultiplier || 1,
          baseQuantity: (i.qty || 1) * (i.unitMultiplier || 1)
        }));
      }

      // Restock products & add RESTOCK logs using relative .modify()
      for (const line of lineItems) {
        if (!line.productId) continue;
        const returnQty = line.baseQuantity || ((line.quantity || 1) * (line.unitMultiplier || 1));
        
        let prevStock = 0;
        const product = await db.products.get(line.productId);
        if (product) prevStock = Number(product.currentStock) || 0;

        await db.products.where('id').equals(line.productId).modify(p => {
          p.currentStock = (Number(p.currentStock) || 0) + returnQty;
          p.updatedAt = timestamp;
        });

        await db.stockLogs.add({
          productId: line.productId,
          timestamp,
          type: 'RESTOCK',
          quantityChange: returnQty,
          previousStock: prevStock,
          newStock: prevStock + returnQty,
          referenceId: `REFUND_${orderRef}`,
          note: `Retour commande #${orderRef} (${reason})`
        });
      }

      // If this was a credit sale, close or mark debt as refunded
      if (db.debts) {
        const debt = await db.debts.where('saleId').equals(sale.id).first();
        if (debt) {
          await db.debts.update(debt.id, {
            status: 'refunded',
            remainingAmount: 0,
            note: (debt.note || '') + ' [VENTE REMBOURSÉE/ANNULÉE]'
          });
        }
      }

      // Update sale record
      await db.sales.update(sale.id, {
        status: 'refunded',
        refundedAt: timestamp,
        refundReason: reason
      });

      return {
        success: true,
        orderRef,
        refundedAmount: sale.totalAmount,
        itemsCount: lineItems.length
      };
    });
  }

  window.CheckoutService = {
    processCheckout,
    processRefund
  };
})();
