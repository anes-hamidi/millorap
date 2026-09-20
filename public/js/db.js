// ==========================================
// CLIENT-SIDE DATABASE INITIALIZATION (INDEXEDDB VIA DEXIE.JS)
// ==========================================
(function () {
  if (typeof Dexie === 'undefined') {
    console.error('Dexie.js is not loaded! Please include Dexie before db.js.');
    return;
  }

  // Create clean database instance
  const db = new Dexie('FlexiPOS_DB_v3');

  // Register blocked listener to prevent tab deadlocks
  db.on('blocked', () => {
    console.warn('IndexedDB database open is blocked by another connection/tab.');
  });

  // Target schema setup
  db.version(1).stores({
    products: '++id, &barcode, name, category, currentStock, lowStockThreshold, costPrice, sellingPrice',
    sales: '++id, &orderRef, timestamp, paymentMethod, totalAmount, netProfit',
    saleItems: '++id, saleId, productId',
    stockLogs: '++id, productId, timestamp, type',
    customers: '++id, name, phone, debtLimit, status, createdAt',
    debts: '++id, customerId, saleId, status, createdAt',
    debtPayments: '++id, debtId, paidAt',
    categories: '++id, &name, icon, createdAt'
  });

  const DEFAULT_SEED_CATEGORIES = [
    { name: 'Beverage', icon: '☕', createdAt: new Date().toISOString() },
    { name: 'Bakery', icon: '🥐', createdAt: new Date().toISOString() },
    { name: 'Printing', icon: '📄', createdAt: new Date().toISOString() },
    { name: 'Electronics', icon: '🎧', createdAt: new Date().toISOString() },
    { name: 'Supplies', icon: '📜', createdAt: new Date().toISOString() },
    { name: 'Other', icon: '📦', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_SEED_PRODUCTS = [
    {
      barcode: '890123456001',
      name: 'Café Espresso',
      category: 'Beverage',
      costPrice: 60,
      sellingPrice: 150,
      currentStock: 99,
      lowStockThreshold: 15,
      icon: '☕',
      createdAt: new Date().toISOString()
    }
  ];

  let dbInitPromise = null;
async function initDatabase() {
  try {
    if (!db.isOpen()) {
      await db.open();
    }
  } catch (err) {
    console.error('IndexedDB engine failed or blocked:', err);
    
    // Auto-heal corrupted browser IndexedDB storage
    if (err.name === 'UnknownError' || err.name === 'DatabaseClosedError') {
      console.warn('Attempting IndexedDB auto-recovery/reset...');
      await db.delete();
      await db.open();
      console.log('IndexedDB successfully re-initialized.');
    }
  }
}

  // Exposed FlexiDB global interface
  window.FlexiDB = {
    db: db,
    init: initDatabase,
    getAllCategories: async function() {
    if (!db.isOpen()) await db.open();
    const products = await db.products.toArray();
    const categories = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(categories);
  },
    DEFAULT_SEED_PRODUCTS: DEFAULT_SEED_PRODUCTS,
    DEFAULT_SEED_CATEGORIES: DEFAULT_SEED_CATEGORIES
  };

  // Eagerly initialize on script load
  initDatabase().catch(e => console.error('Eager DB init failed:', e));
})();