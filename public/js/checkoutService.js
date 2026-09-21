// ==========================================
// CLIENT-SIDE CHECKOUT SERVICE (ATOMIC INDEXEDDB TRANSACTIONS)
// ==========================================
(function() {
  /**
   * Process an atomic checkout transaction.
   * Runs in an isolated Read-Write transaction across all 4 stores:
   * products, sales, saleItems, stockLogs.
   *
   * @param {Object} orderData
   * @param {Array} orderData.items - Array of { id, qty, customDiscount }
   * @param {number} orderData.discountPercent - Order-wide discount percent (0-100)
   * @param {string} orderData.paymentMethod - 'cash' | 'card' | 'qr'
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

    // Generate unique human-readable Order Reference
    const orderRef = 'DZ-' + Date.now().toString().slice(-6) + '-' + Math.floor(100 + Math.random() * 900);
    const timestamp = new Date().toISOString();

    // Execute atomic IndexedDB transaction across all 4 stores
    return await db.transaction('rw', db.products, db.sales, db.saleItems, db.stockLogs, async () => {
      // 1. Fetch fresh state of all products in cart & lock/validate stock
      const productIds = items.map(i => parseInt(i.id, 10) || i.id);
      const freshProducts = await db.products.where('id').anyOf(productIds).toArray();
      const productMap = new Map(freshProducts.map(p => [p.id, p]));

      let subtotal = 0;
      let totalCost = 0;
      const validatedLineItems = [];

      for (const item of items) {
        const pId = parseInt(item.id, 10) || item.id;
        const product = productMap.get(pId);

        if (!product) {
          throw new Error('Product with ID ' + item.id + ' was not found in inventory.');
        }

        const requestedQty = parseInt(item.qty, 10) || 1;
        if (requestedQty <= 0) {
          throw new Error('Invalid quantity for ' + product.name + ': ' + requestedQty);
        }

        // Strict stock validation
        if (product.currentStock < requestedQty) {
          throw new Error(
            'Insufficient stock for "' + product.name + '". Available: ' + product.currentStock + ', Requested: ' + requestedQty
          );
        }

        const sellingPrice = Number(product.sellingPrice) || 0;
        const costPrice = Number(product.costPrice) || 0;
        const lineTotal = sellingPrice * requestedQty;
        const lineCost = costPrice * requestedQty;
        const lineProfit = lineTotal - lineCost;

        subtotal += lineTotal;
        totalCost += lineCost;

        validatedLineItems.push({
          product,
          productId: product.id,
          productName: product.name,
          barcode: product.barcode || '',
          quantity: requestedQty,
          unitCostPrice: costPrice,
          unitSellingPrice: sellingPrice,
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

      // 2. Decrement stock & record audit logs for each product
      for (const line of validatedLineItems) {
        const prevStock = line.product.currentStock;
        const newStock = prevStock - line.quantity;

        // Decrement product currentStock in IndexedDB
        await db.products.update(line.productId, {
          currentStock: newStock,
          updatedAt: timestamp
        });

        // Insert stock movement log
        await db.stockLogs.add({
          productId: line.productId,
          timestamp,
          type: 'SALE',
          quantityChange: -line.quantity,
          previousStock: prevStock,
          newStock: newStock,
          referenceId: orderRef,
          note: 'Sale ' + orderRef + ' (' + paymentMethod.toUpperCase() + ')'
        });
      }

      // 3. Insert primary Sale record
      const lineItemsSnapshot = validatedLineItems.map(l => ({
        name: l.productName,
        qty: l.quantity,
        price: l.unitSellingPrice,
        total: l.lineTotal
      }));

      const saleId = await db.sales.add({
        orderRef,
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
          quantity: line.quantity,
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
          quantity: i.qty || 1
        }));
      }

      // Restock products & add RESTOCK logs
      for (const line of lineItems) {
        if (!line.productId) continue;
        const product = await db.products.get(line.productId);
        if (product) {
          const prevStock = Number(product.currentStock) || 0;
          const returnQty = Number(line.quantity) || 1;
          const newStock = prevStock + returnQty;

          await db.products.update(product.id, {
            currentStock: newStock,
            updatedAt: timestamp
          });

          await db.stockLogs.add({
            productId: product.id,
            timestamp,
            type: 'RESTOCK',
            quantityChange: returnQty,
            previousStock: prevStock,
            newStock: newStock,
            referenceId: `REFUND_${orderRef}`,
            note: `Retour commande #${orderRef} (${reason})`
          });
        }
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
