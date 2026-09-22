// ==============================================================================
// CLIENT-SIDE SUPPLIER & PURCHASE ORDER / DELIVERY SERVICE (TASK 5)
// ==============================================================================
(function () {
  function db() {
    return window.FlexiDB && window.FlexiDB.db;
  }

  // Robust ID-tolerant lookup helpers for IndexedDB (handles number vs string key types)
  async function findSupplier(id) {
    const d = db();
    if (!d || id === undefined || id === null) return null;
    let s = await d.suppliers.get(id);
    if (!s && !isNaN(Number(id))) s = await d.suppliers.get(Number(id));
    if (!s && typeof id === 'number') s = await d.suppliers.get(String(id));
    return s;
  }

  async function findPurchaseOrder(id) {
    const d = db();
    if (!d || id === undefined || id === null) return null;
    let po = await d.purchaseOrders.get(id);
    if (!po && !isNaN(Number(id))) po = await d.purchaseOrders.get(Number(id));
    if (!po && typeof id === 'number') po = await d.purchaseOrders.get(String(id));
    return po;
  }

  async function findProduct(id) {
    const d = db();
    if (!d || id === undefined || id === null) return null;
    let p = await d.products.get(id);
    if (!p && !isNaN(Number(id))) p = await d.products.get(Number(id));
    if (!p && typeof id === 'number') p = await d.products.get(String(id));
    return p;
  }

  // ── SUPPLIER MANAGEMENT (CRUD) ──────────────────────────────────────────────

  /**
   * Create a new supplier
   */
  async function createSupplier({ name, phone = '' }) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const cleanName = (name || '').trim();
    const cleanPhone = (phone || '').trim();
    if (!cleanName) throw new Error('Le nom du fournisseur est obligatoire');

    const all = await d.suppliers.toArray();
    const existing = all.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      throw new Error(`Un fournisseur nommé "${cleanName}" existe déjà`);
    }

    const id = await d.suppliers.add({
      name: cleanName,
      phone: cleanPhone || null,
      createdAt: new Date().toISOString()
    });
    return await findSupplier(id);
  }

  /**
   * Update an existing supplier
   */
  async function updateSupplier(id, { name, phone }) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const existing = await findSupplier(id);
    if (!existing) throw new Error('Fournisseur introuvable');

    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Le nom du fournisseur est obligatoire');

    await d.suppliers.update(existing.id, {
      name: cleanName,
      phone: (phone || '').trim() || null
    });
    return await findSupplier(existing.id);
  }

  /**
   * Delete a supplier (if no pending purchase orders)
   */
  async function deleteSupplier(id) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const existing = await findSupplier(id);
    if (!existing) throw new Error('Fournisseur introuvable');
    
    const targetId = existing.id;
    const pendingOrders = await d.purchaseOrders
      .filter(po => (po.supplierId === targetId || String(po.supplierId) === String(targetId)) && (po.status === 'pending' || po.status === 'partial'))
      .toArray();

    if (pendingOrders.length > 0) {
      throw new Error(`Impossible de supprimer: ce fournisseur a ${pendingOrders.length} commande(s) en cours.`);
    }

    await d.suppliers.delete(targetId);
    return true;
  }

  /**
   * Get all suppliers enriched with purchase order count
   */
  async function getAllSuppliers() {
    const d = db();
    if (!d || !d.suppliers) return [];

    const [suppliers, orders] = await Promise.all([
      d.suppliers.toArray(),
      d.purchaseOrders.toArray()
    ]);

    return suppliers.map(s => {
      const sOrders = orders.filter(o => o.supplierId === s.id || String(o.supplierId) === String(s.id));
      const pendingCount = sOrders.filter(o => o.status === 'pending' || o.status === 'partial').length;
      return {
        ...s,
        ordersCount: sOrders.length,
        pendingOrdersCount: pendingCount
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── PURCHASE ORDER FLOW ─────────────────────────────────────────────────────

  /**
   * Create a new purchase order with line items
   *
   * @param {Object} poData
   * @param {string|number} poData.supplierId
   * @param {string} poData.expectedDate
   * @param {Array} poData.items - Array of { productId, quantityOrdered, unitCost, expiryDate }
   */
  async function createPurchaseOrder({ supplierId, expectedDate = null, items = [] }) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    if (!supplierId) throw new Error('Veuillez sélectionner un fournisseur');
    if (!items || items.length === 0) throw new Error('Veuillez ajouter au moins un article');

    const supplier = await findSupplier(supplierId);
    if (!supplier) throw new Error('Fournisseur introuvable');

    const now = new Date().toISOString();
    const orderRef = 'DZ-PO-' + Date.now().toString().slice(-6);

    // Pre-resolve product IDs before transaction to keep transaction scope clean
    const resolvedItems = [];
    for (const item of items) {
      const prod = await findProduct(item.productId);
      const actualProdId = prod ? prod.id : item.productId;
      const qty = Math.max(1, Number(item.quantityOrdered || item.quantity || item.qty) || 1);
      const cost = Math.max(0, Number(item.unitCost || item.cost) || 0);

      resolvedItems.push({
        productId: actualProdId,
        quantityOrdered: qty,
        unitCost: cost
      });
    }

    const poId = await d.transaction('rw', [d.purchaseOrders, d.purchaseOrderItems], async () => {
      const insertedPoId = await d.purchaseOrders.add({
        orderRef,
        supplierId: supplier.id,
        status: 'pending', // 'pending' | 'partial' | 'received' | 'cancelled'
        expectedDate: expectedDate || null,
        createdAt: now
      });

      for (const item of resolvedItems) {
        await d.purchaseOrderItems.add({
          purchaseOrderId: insertedPoId,
          productId: item.productId,
          quantityOrdered: item.quantityOrdered,
          quantityReceived: 0,
          unitCost: item.unitCost
        });
      }

      return insertedPoId;
    });

    return await getPurchaseOrderById(poId);
  }

  /**
   * Get PO by ID with line items and product details
   */
  async function getPurchaseOrderById(poId) {
    const d = db();
    if (!d) return null;

    const po = await findPurchaseOrder(poId);
    if (!po) return null;

    const [supplier, allOrderItems] = await Promise.all([
      findSupplier(po.supplierId),
      d.purchaseOrderItems.toArray()
    ]);

    const items = allOrderItems.filter(i => i.purchaseOrderId === po.id || String(i.purchaseOrderId) === String(po.id));

    const products = await d.products.toArray();
    const prodMap = new Map(products.map(p => [String(p.id), p]));

    const enrichedItems = items.map(i => {
      const p = prodMap.get(String(i.productId)) || {};
      return {
        ...i,
        productName: p.name || 'Article',
        barcode: p.barcode || '',
        currentStock: p.currentStock || 0,
        sellingPrice: p.sellingPrice || p.price || 0,
        icon: p.icon || '📦'
      };
    });

    const poObj = {
      ...po,
      orderRef: po.orderRef || `DZ-PO-${String(po.id).slice(-4)}`,
      supplierName: supplier ? supplier.name : 'Fournisseur Inconnu',
      supplierPhone: supplier ? supplier.phone : '',
      items: enrichedItems,
      itemCount: enrichedItems.length,
      itemsCount: enrichedItems.length
    };
    poObj.order = poObj;
    return poObj;
  }

  /**
   * Get all Purchase Orders with supplier names
   */
  async function getAllPurchaseOrders() {
    const d = db();
    if (!d || !d.purchaseOrders) return [];

    const [orders, suppliers, orderItems] = await Promise.all([
      d.purchaseOrders.toArray(),
      d.suppliers.toArray(),
      d.purchaseOrderItems.toArray()
    ]);

    const supMap = new Map(suppliers.map(s => [String(s.id), s]));

    return orders.map(o => {
      const s = supMap.get(String(o.supplierId));
      const items = orderItems.filter(i => i.purchaseOrderId === o.id || String(i.purchaseOrderId) === String(o.id));
      const totalOrdered = items.reduce((sum, i) => sum + (Number(i.quantityOrdered) || 0), 0);
      const totalReceived = items.reduce((sum, i) => sum + (Number(i.quantityReceived) || 0), 0);
      const totalAmount = items.reduce((sum, i) => sum + ((Number(i.quantityOrdered) || 0) * (Number(i.unitCost) || 0)), 0);

      return {
        ...o,
        orderRef: o.orderRef || `DZ-PO-${String(o.id).slice(-4)}`,
        supplierName: s ? s.name : 'Fournisseur Inconnu',
        itemsCount: items.length,
        itemCount: items.length,
        totalOrdered,
        totalReceived,
        totalAmount,
        totalEstimatedAmount: totalAmount
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Cancel a Purchase Order
   */
  async function cancelPurchaseOrder(poId) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const po = await findPurchaseOrder(poId);
    if (!po) throw new Error('Bon de commande introuvable');
    if (po.status === 'received') throw new Error('Impossible d\'annuler une commande déjà réceptionnée');

    await d.purchaseOrders.update(po.id, {
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    });
    return true;
  }

  /**
   * Receive Delivery against an existing PO (Task 5 delivery-note flow)
   * Relative stock increment via .modify() + price updates + stockLogs RESTOCK entry + batches creation if perishable.
   *
   * @param {string|number} poId
   * @param {Object} data - { items: Array of { itemId, productId, quantityReceived, unitCost, sellingPrice, expiryDate, batchNumber } }
   */
  async function receiveDelivery(poId, { items = [] } = {}) {
    const d = db();
    if (!d) throw new Error('Database not ready');

    const po = await findPurchaseOrder(poId);
    if (!po) throw new Error('Bon de commande introuvable');
    if (po.status === 'received') throw new Error('Ce bon de commande a déjà été totalement réceptionné');

    const supplier = await findSupplier(po.supplierId);
    const supplierName = supplier ? supplier.name : 'Fournisseur';
    const now = new Date().toISOString();

    const txStores = [d.purchaseOrders, d.purchaseOrderItems, d.products, d.stockLogs];
    if (d.batches) txStores.push(d.batches);

    return await d.transaction('rw', txStores, async () => {
      const allOrderItems = await d.purchaseOrderItems.toArray();
      const currentItems = allOrderItems.filter(i => i.purchaseOrderId === po.id || String(i.purchaseOrderId) === String(po.id));
      const itemMap = new Map(currentItems.map(i => [String(i.id), i]));

      for (const rec of items) {
        // Resolve target order item by itemId or productId
        let item = itemMap.get(String(rec.itemId));
        if (!item && rec.productId) {
          item = currentItems.find(i => String(i.productId) === String(rec.productId));
        }
        if (!item) continue;

        const newReceivedNow = Math.max(0, Number(rec.quantityReceived || rec.receivedQuantity || rec.qty) || 0);
        if (newReceivedNow <= 0) continue;

        const cumulativeReceived = (Number(item.quantityReceived) || 0) + newReceivedNow;
        const newCost = Number(rec.unitCost) > 0 ? Number(rec.unitCost) : Number(item.unitCost) || 0;

        // Update purchase order item row
        await d.purchaseOrderItems.update(item.id, {
          quantityReceived: cumulativeReceived,
          unitCost: newCost
        });

        // 1. Relative stock increment via .modify() + update cost/selling prices if changed
        const prod = await findProduct(item.productId);
        const prevStock = prod ? (Number(prod.currentStock) || 0) : 0;
        const newSellingPrice = Number(rec.sellingPrice) > 0 ? Number(rec.sellingPrice) : null;

        if (prod) {
          await d.products.where('id').equals(prod.id).modify(p => {
            p.currentStock = (Number(p.currentStock) || 0) + newReceivedNow;
            if (newCost > 0) {
              p.costPrice = newCost;
            }
            if (newSellingPrice !== null && newSellingPrice > 0) {
              p.sellingPrice = newSellingPrice;
            }
            p.updatedAt = now;
          });
        }

        // 2. Add RESTOCK entry in stockLogs for complete audit trail
        await d.stockLogs.add({
          productId: prod ? prod.id : item.productId,
          timestamp: now,
          type: 'RESTOCK',
          quantityChange: newReceivedNow,
          previousStock: prevStock,
          newStock: prevStock + newReceivedNow,
          referenceId: `PO_${po.id}`,
          note: `Réception BC #${po.orderRef || po.id} (${supplierName})`
        });

        // 3. If expiry date is specified, create batch record in db.batches
        if (rec.expiryDate && d.batches) {
          await d.batches.add({
            productId: prod ? prod.id : item.productId,
            batchNumber: rec.batchNumber || `LOT-${Date.now().toString().slice(-4)}`,
            expiryDate: rec.expiryDate,
            initialQty: newReceivedNow,
            remainingQty: newReceivedNow,
            poId: po.id,
            receivedAt: now
          });
        }
      }

      // Re-query order items to determine overall PO status accurately
      const refreshedAllOrderItems = await d.purchaseOrderItems.toArray();
      const updatedPoItems = refreshedAllOrderItems.filter(i => i.purchaseOrderId === po.id || String(i.purchaseOrderId) === String(po.id));

      const totalOrdered = updatedPoItems.reduce((sum, i) => sum + (Number(i.quantityOrdered) || 0), 0);
      const totalReceived = updatedPoItems.reduce((sum, i) => sum + (Number(i.quantityReceived) || 0), 0);

      let newStatus = 'partial';
      if (totalReceived >= totalOrdered && totalOrdered > 0) {
        newStatus = 'received';
      } else if (totalReceived === 0) {
        newStatus = 'pending';
      }

      // Update PO status & timestamp
      await d.purchaseOrders.update(po.id, {
        status: newStatus,
        lastReceivedAt: now,
        updatedAt: now
      });

      return {
        success: true,
        poId: po.id,
        status: newStatus,
        totalOrdered,
        totalReceived,
        receivedAt: now
      };
    });
  }

  // Exposed SupplierService global interface
  window.SupplierService = {
    createSupplier,
    updateSupplier,
    deleteSupplier,
    getAllSuppliers,
    createPurchaseOrder,
    getPurchaseOrderById,
    getAllPurchaseOrders,
    cancelPurchaseOrder,
    receiveDelivery,
    receivePurchaseOrderDelivery: receiveDelivery
  };
})();
