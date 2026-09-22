// ==============================================================================
// CLIENT-SIDE DATA BACKUP & RECOVERY SERVICE (JSON / CSV)
// ==============================================================================
(function() {
  const BACKUP_REMINDER_KEY = 'pos_last_backup_time';
  const REMINDER_INTERVAL_DAYS = 7;

  /**
   * Check if a backup reminder is due
   */
  function isBackupReminderDue() {
    const lastBackup = localStorage.getItem(BACKUP_REMINDER_KEY);
    if (!lastBackup) return true;
    const daysSince = (Date.now() - parseInt(lastBackup, 10)) / (1000 * 60 * 60 * 24);
    return daysSince >= REMINDER_INTERVAL_DAYS;
  }

  function markBackupCompleted() {
    localStorage.setItem(BACKUP_REMINDER_KEY, Date.now().toString());
  }

  /**
   * Full Database Export to JSON File
   */
  async function exportDatabaseToJson() {
    if (!window.FlexiDB || !window.FlexiDB.db) {
      throw new Error('Database is not initialized.');
    }
    const db = window.FlexiDB.db;

    const [
      products, sales, saleItems, stockLogs,
      customers, debts, debtPayments, categories,
      batches, suppliers, purchaseOrders, purchaseOrderItems
    ] = await Promise.all([
      db.products.toArray(),
      db.sales.toArray(),
      db.saleItems.toArray(),
      db.stockLogs.toArray(),
      db.customers ? db.customers.toArray().catch(() => []) : Promise.resolve([]),
      db.debts ? db.debts.toArray().catch(() => []) : Promise.resolve([]),
      db.debtPayments ? db.debtPayments.toArray().catch(() => []) : Promise.resolve([]),
      db.categories ? db.categories.toArray().catch(() => []) : Promise.resolve([]),
      db.batches ? db.batches.toArray().catch(() => []) : Promise.resolve([]),
      db.suppliers ? db.suppliers.toArray().catch(() => []) : Promise.resolve([]),
      db.purchaseOrders ? db.purchaseOrders.toArray().catch(() => []) : Promise.resolve([]),
      db.purchaseOrderItems ? db.purchaseOrderItems.toArray().catch(() => []) : Promise.resolve([])
    ]);

    const backupData = {
      app: 'FlexiPOS',
      version: 3,
      exportedAt: new Date().toISOString(),
      terminalId: localStorage.getItem('pos_terminal_id') || 'T1',
      counts: {
        products: products.length,
        sales: sales.length,
        saleItems: saleItems.length,
        stockLogs: stockLogs.length,
        customers: (customers || []).length,
        debts: (debts || []).length,
        debtPayments: (debtPayments || []).length,
        categories: (categories || []).length,
        batches: (batches || []).length,
        suppliers: (suppliers || []).length,
        purchaseOrders: (purchaseOrders || []).length,
        purchaseOrderItems: (purchaseOrderItems || []).length
      },
      data: {
        products,
        sales,
        saleItems,
        stockLogs,
        customers: customers || [],
        debts: debts || [],
        debtPayments: debtPayments || [],
        categories: categories || [],
        batches: batches || [],
        suppliers: suppliers || [],
        purchaseOrders: purchaseOrders || [],
        purchaseOrderItems: purchaseOrderItems || []
      }
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'pos_backup_' + nowStr + '.json';

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    markBackupCompleted();
    return { success: true, filename, counts: backupData.counts };
  }

  /**
   * Import & Restore Database from JSON File
   * @param {File|Blob} file
   */
  async function importDatabaseFromJson(file) {
    if (!window.FlexiDB || !window.FlexiDB.db) {
      throw new Error('Database is not initialized.');
    }
    const db = window.FlexiDB.db;

    const fileText = await file.text();
    let json;
    try {
      json = JSON.parse(fileText);
    } catch (e) {
      throw new Error('Invalid JSON format in uploaded backup file.');
    }

    if (!json.data || !Array.isArray(json.data.products)) {
      throw new Error('Incompatible backup file format: Missing products store.');
    }

    const storesToLock = [db.products, db.sales, db.saleItems, db.stockLogs];
    if (db.customers) storesToLock.push(db.customers);
    if (db.debts) storesToLock.push(db.debts);
    if (db.debtPayments) storesToLock.push(db.debtPayments);
    if (db.categories) storesToLock.push(db.categories);
    if (db.batches) storesToLock.push(db.batches);
    if (db.suppliers) storesToLock.push(db.suppliers);
    if (db.purchaseOrders) storesToLock.push(db.purchaseOrders);
    if (db.purchaseOrderItems) storesToLock.push(db.purchaseOrderItems);

    // Atomic transaction replacing database records
    return await db.transaction('rw', storesToLock, async () => {
      // Clear existing records
      const clearPromises = [
        db.products.clear(),
        db.sales.clear(),
        db.saleItems.clear(),
        db.stockLogs.clear()
      ];
      if (db.customers) clearPromises.push(db.customers.clear());
      if (db.debts) clearPromises.push(db.debts.clear());
      if (db.debtPayments) clearPromises.push(db.debtPayments.clear());
      if (db.categories) clearPromises.push(db.categories.clear());
      if (db.batches) clearPromises.push(db.batches.clear());
      if (db.suppliers) clearPromises.push(db.suppliers.clear());
      if (db.purchaseOrders) clearPromises.push(db.purchaseOrders.clear());
      if (db.purchaseOrderItems) clearPromises.push(db.purchaseOrderItems.clear());
      await Promise.all(clearPromises);

      // Bulk add restored data
      if (json.data.products && json.data.products.length > 0) {
        await db.products.bulkAdd(json.data.products);
      }
      if (json.data.sales && json.data.sales.length > 0) {
        await db.sales.bulkAdd(json.data.sales);
      }
      if (json.data.saleItems && json.data.saleItems.length > 0) {
        await db.saleItems.bulkAdd(json.data.saleItems);
      }
      if (json.data.stockLogs && json.data.stockLogs.length > 0) {
        await db.stockLogs.bulkAdd(json.data.stockLogs);
      }
      if (db.customers && json.data.customers && json.data.customers.length > 0) {
        await db.customers.bulkAdd(json.data.customers);
      }
      if (db.debts && json.data.debts && json.data.debts.length > 0) {
        await db.debts.bulkAdd(json.data.debts);
      }
      if (db.debtPayments && json.data.debtPayments && json.data.debtPayments.length > 0) {
        await db.debtPayments.bulkAdd(json.data.debtPayments);
      }
      if (db.categories && json.data.categories && json.data.categories.length > 0) {
        await db.categories.bulkAdd(json.data.categories);
      }
      if (db.batches && json.data.batches && json.data.batches.length > 0) {
        await db.batches.bulkAdd(json.data.batches);
      }
      if (db.suppliers && json.data.suppliers && json.data.suppliers.length > 0) {
        await db.suppliers.bulkAdd(json.data.suppliers);
      }
      if (db.purchaseOrders && json.data.purchaseOrders && json.data.purchaseOrders.length > 0) {
        await db.purchaseOrders.bulkAdd(json.data.purchaseOrders);
      }
      if (db.purchaseOrderItems && json.data.purchaseOrderItems && json.data.purchaseOrderItems.length > 0) {
        await db.purchaseOrderItems.bulkAdd(json.data.purchaseOrderItems);
      }

      markBackupCompleted();
      return {
        success: true,
        restored: {
          products: (json.data.products || []).length,
          sales: (json.data.sales || []).length,
          saleItems: (json.data.saleItems || []).length,
          stockLogs: (json.data.stockLogs || []).length,
          customers: (json.data.customers || []).length,
          debts: (json.data.debts || []).length,
          debtPayments: (json.data.debtPayments || []).length,
          categories: (json.data.categories || []).length,
          batches: (json.data.batches || []).length,
          suppliers: (json.data.suppliers || []).length,
          purchaseOrders: (json.data.purchaseOrders || []).length,
          purchaseOrderItems: (json.data.purchaseOrderItems || []).length
        }
      };
    });
  }

  /**
   * Export Inventory to CSV
   */
  async function exportInventoryToCsv() {
    if (!window.FlexiDB || !window.FlexiDB.db) throw new Error('Database not ready');
    const products = await window.FlexiDB.db.products.toArray();

    const headers = ['ID', 'Barcode', 'Name', 'Category', 'Cost Price (DA)', 'Selling Price (DA)', 'Units Per Pack', 'Pack Unit', 'Pack Price (DA)', 'Current Stock', 'Low Stock Threshold', 'Total Inventory Value (DA)'];
    const rows = products.map(p => {
      const cost = Number(p.costPrice) || 0;
      const stock = Number(p.currentStock) || 0;
      const totalVal = cost * stock;
      return [
        p.id,
        '"' + (p.barcode || '').replace(/"/g, '""') + '"',
        '"' + (p.name || '').replace(/"/g, '""') + '"',
        '"' + (p.category || '').replace(/"/g, '""') + '"',
        cost.toFixed(2),
        (Number(p.sellingPrice) || 0).toFixed(2),
        p.unitsPerPack || 1,
        '"' + (p.packUnitLabel || '').replace(/"/g, '""') + '"',
        p.packPrice != null ? Number(p.packPrice).toFixed(2) : '',
        stock,
        p.lowStockThreshold || 10,
        totalVal.toFixed(2)
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlob(csvContent, 'inventory_report_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv;charset=utf-8;');
  }

  /**
   * Export Sales Register to CSV
   */
  async function exportSalesRegisterToCsv() {
    if (!window.FlexiDB || !window.FlexiDB.db) throw new Error('Database not ready');
    const sales = await window.FlexiDB.db.sales.toArray();

    const headers = ['Sale ID', 'Terminal', 'Order Reference', 'Date', 'Time', 'Payment Method', 'Item Count', 'Subtotal (DA)', 'Discount (DA)', 'Total Amount (DA)', 'Total Cost (DA)', 'Net Profit (DA)'];
    const rows = sales.map(s => {
      const d = new Date(s.timestamp);
      return [
        s.id,
        s.terminalId || 'T1',
        '"' + (s.orderRef || '') + '"',
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        (s.paymentMethod || 'cash').toUpperCase(),
        s.itemCount || 0,
        (Number(s.subtotal) || 0).toFixed(2),
        (Number(s.discountAmount) || 0).toFixed(2),
        (Number(s.totalAmount) || 0).toFixed(2),
        (Number(s.totalCost) || 0).toFixed(2),
        (Number(s.netProfit) || 0).toFixed(2)
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlob(csvContent, 'sales_register_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv;charset=utf-8;');
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.BackupService = {
    exportDatabaseToJson,
    importDatabaseFromJson,
    exportInventoryToCsv,
    exportSalesRegisterToCsv,
    exportDebtsToCsv: () => window.DebtService?.exportDebtsToCsv(),
    exportDebtPaymentsToCsv: () => window.DebtService?.exportDebtPaymentsToCsv(),
    isBackupReminderDue
  };
})();
