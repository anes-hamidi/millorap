// ==========================================
// CLIENT-SIDE DATA BACKUP & RECOVERY SERVICE (JSON / CSV)
// ==========================================
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

    const [products, sales, saleItems, stockLogs] = await Promise.all([
      db.products.toArray(),
      db.sales.toArray(),
      db.saleItems.toArray(),
      db.stockLogs.toArray()
    ]);

    const backupData = {
      app: 'FlexiPOS',
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        products: products.length,
        sales: sales.length,
        saleItems: saleItems.length,
        stockLogs: stockLogs.length
      },
      data: {
        products,
        sales,
        saleItems,
        stockLogs
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

    // Atomic transaction replacing database records
    return await db.transaction('rw', db.products, db.sales, db.saleItems, db.stockLogs, async () => {
      // Clear existing records
      await Promise.all([
        db.products.clear(),
        db.sales.clear(),
        db.saleItems.clear(),
        db.stockLogs.clear()
      ]);

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

      markBackupCompleted();
      return {
        success: true,
        restored: {
          products: (json.data.products || []).length,
          sales: (json.data.sales || []).length,
          saleItems: (json.data.saleItems || []).length,
          stockLogs: (json.data.stockLogs || []).length
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

    const headers = ['ID', 'Barcode', 'Name', 'Category', 'Cost Price (DA)', 'Selling Price (DA)', 'Current Stock', 'Low Stock Threshold', 'Total Inventory Value (DA)'];
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

    const headers = ['Sale ID', 'Order Reference', 'Date', 'Time', 'Payment Method', 'Item Count', 'Subtotal (DA)', 'Discount (DA)', 'Total Amount (DA)', 'Total Cost (DA)', 'Net Profit (DA)'];
    const rows = sales.map(s => {
      const d = new Date(s.timestamp);
      return [
        s.id,
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
    isBackupReminderDue
  };
})();
