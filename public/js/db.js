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
    { barcode: '890123456001', name: 'Café Espresso', category: 'Beverage', costPrice: 60, sellingPrice: 150, currentStock: 99, lowStockThreshold: 15, icon: '☕', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456002', name: 'Thé Vert Naturel', category: 'Beverage', costPrice: 40, sellingPrice: 100, currentStock: 50, lowStockThreshold: 10, icon: '🍵', image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456003', name: 'Croissant Frais', category: 'Bakery', costPrice: 50, sellingPrice: 120, currentStock: 35, lowStockThreshold: 10, icon: '🥐', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456004', name: 'Muffin Chocolat', category: 'Bakery', costPrice: 80, sellingPrice: 180, currentStock: 25, lowStockThreshold: 8, icon: '🧁', image: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456005', name: 'Impression Document (Couleur)', category: 'Printing', costPrice: 8, sellingPrice: 25, currentStock: 999, lowStockThreshold: 50, icon: '📄', image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456006', name: 'Tirage Photo A4', category: 'Printing', costPrice: 70, sellingPrice: 200, currentStock: 150, lowStockThreshold: 20, icon: '🖼️', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456007', name: 'Écouteurs Sans Fil', category: 'Electronics', costPrice: 1600, sellingPrice: 2800, currentStock: 15, lowStockThreshold: 5, icon: '🎧', image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456008', name: 'Câble USB-C Rapide', category: 'Electronics', costPrice: 280, sellingPrice: 650, currentStock: 40, lowStockThreshold: 10, icon: '🔌', image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() },
    { barcode: '890123456009', name: 'Rouleaux Papier Thermique (x5)', category: 'Supplies', costPrice: 500, sellingPrice: 900, currentStock: 30, lowStockThreshold: 10, icon: '📜', image: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&auto=format&fit=crop&q=80', createdAt: new Date().toISOString() }
  ];

  const DEFAULT_SEED_CUSTOMERS = [
    { name: 'Ahmed Benali', phone: '0550123456', debtLimit: 10000, status: 'active', notes: 'Client fidèle', createdAt: new Date(Date.now() - 86400000 * 10).toISOString() },
    { name: 'Karim Ziani', phone: '0770987654', debtLimit: 5000, status: 'active', notes: 'Paiement hebdomadaire', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
    { name: 'Sara Mansouri', phone: '0661223344', debtLimit: 8000, status: 'active', notes: 'Bureau voisin', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() }
  ];

  async function initDatabase() {
    try {
      if (!db.isOpen()) {
        await db.open();
      }

      // Auto-seed default products if empty
      const prodCount = await db.products.count();
      if (prodCount === 0) {
        await db.products.bulkAdd(DEFAULT_SEED_PRODUCTS);
      }

      // Auto-seed default categories if empty
      const catCount = await db.categories.count();
      if (catCount === 0) {
        await db.categories.bulkAdd(DEFAULT_SEED_CATEGORIES);
      }

      // Auto-seed default customers & debts if empty
      const custCount = await db.customers.count();
      if (custCount === 0) {
        const c1 = await db.customers.add(DEFAULT_SEED_CUSTOMERS[0]);
        const c2 = await db.customers.add(DEFAULT_SEED_CUSTOMERS[1]);
        const c3 = await db.customers.add(DEFAULT_SEED_CUSTOMERS[2]);

        // Sample debts
        await db.debts.bulkAdd([
          {
            customerId: c1,
            orderRef: 'DZ-1788519227578-123',
            amount: 2800,
            amountPaidNow: 1000,
            remainingAmount: 1800,
            status: 'open',
            note: 'Achat Écouteurs Sans Fil - Solde restant',
            createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
          },
          {
            customerId: c2,
            orderRef: 'DZ-1788277982113-206',
            amount: 1200,
            amountPaidNow: 0,
            remainingAmount: 1200,
            status: 'open',
            note: 'Impression documents + Reliure',
            createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
          }
        ]);
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

  // --- Complete Category CRUD operations ---
  async function getAllCategories() {
    if (!db.isOpen()) await db.open();
    let storedCategories = [];
    try {
      storedCategories = await db.categories.toArray();
    } catch (e) {
      console.warn('Error fetching categories from Dexie:', e);
    }

    // Also check if any products have custom categories not yet in db.categories
    let productCategories = [];
    try {
      const products = await db.products.toArray();
      productCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
    } catch (e) {}

    // Combine them ensuring every object has { id, name, icon }
    const catMap = new Map();
    for (const cat of storedCategories) {
      if (cat && cat.name) {
        catMap.set(cat.name, {
          id: cat.id,
          name: cat.name,
          icon: cat.icon || '🏷️',
          createdAt: cat.createdAt || new Date().toISOString()
        });
      }
    }

    for (const pCat of productCategories) {
      if (!catMap.has(pCat)) {
        try {
          const newId = await db.categories.add({
            name: pCat,
            icon: '🏷️',
            createdAt: new Date().toISOString()
          });
          catMap.set(pCat, { id: newId, name: pCat, icon: '🏷️' });
        } catch (e) {
          catMap.set(pCat, { id: null, name: pCat, icon: '🏷️' });
        }
      }
    }

    return Array.from(catMap.values());
  }

  async function addCategory(name, icon = '🏷️') {
    if (!db.isOpen()) await db.open();
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Le nom de la catégorie est obligatoire.');

    const existing = await db.categories.where('name').equalsIgnoreCase(cleanName).first();
    if (existing) {
      throw new Error(`La catégorie "${cleanName}" existe déjà.`);
    }

    const id = await db.categories.add({
      name: cleanName,
      icon: (icon || '').trim() || '🏷️',
      createdAt: new Date().toISOString()
    });

    return { id, name: cleanName, icon: icon || '🏷️' };
  }

  async function updateCategory(id, newName, newIcon) {
    if (!db.isOpen()) await db.open();
    const cleanName = (newName || '').trim();
    if (!cleanName) throw new Error('Le nom de la catégorie est obligatoire.');

    let category = null;
    if (id) {
      category = await db.categories.get(Number(id) || id);
    }
    if (!category) {
      category = await db.categories.where('name').equalsIgnoreCase(cleanName).first();
    }
    if (!category) {
      throw new Error('Catégorie introuvable.');
    }

    const oldName = category.name;
    const cleanIcon = (newIcon || '').trim() || category.icon || '🏷️';

    // Check for name duplicate with other categories
    if (cleanName.toLowerCase() !== oldName.toLowerCase()) {
      const duplicate = await db.categories.where('name').equalsIgnoreCase(cleanName).first();
      if (duplicate && duplicate.id !== category.id) {
        throw new Error(`Une catégorie nommée "${cleanName}" existe déjà.`);
      }
    }

    await db.categories.update(category.id, {
      name: cleanName,
      icon: cleanIcon,
      updatedAt: new Date().toISOString()
    });

    // Cascade rename to associated products if the name changed
    if (cleanName !== oldName) {
      const matchingProducts = await db.products.where('category').equals(oldName).toArray();
      for (const p of matchingProducts) {
        await db.products.update(p.id, { category: cleanName });
      }
    }

    return { id: category.id, name: cleanName, icon: cleanIcon };
  }

  async function deleteCategory(id, fallbackCategory = 'General') {
    if (!db.isOpen()) await db.open();
    let category = null;
    if (id) {
      category = await db.categories.get(Number(id) || id);
    }
    if (!category) {
      throw new Error('Catégorie introuvable.');
    }

    const oldName = category.name;

    // Delete category
    await db.categories.delete(category.id);

    // Reclassify products referencing this category to fallbackCategory
    const matchingProducts = await db.products.where('category').equals(oldName).toArray();
    for (const p of matchingProducts) {
      await db.products.update(p.id, { category: fallbackCategory });
    }

    // Ensure fallbackCategory exists in categories store
    const fallbackExists = await db.categories.where('name').equalsIgnoreCase(fallbackCategory).first();
    if (!fallbackExists && matchingProducts.length > 0) {
      try {
        await db.categories.add({
          name: fallbackCategory,
          icon: '📦',
          createdAt: new Date().toISOString()
        });
      } catch (e) {}
    }

    return true;
  }

  // Exposed FlexiDB global interface
  window.FlexiDB = {
    db: db,
    init: initDatabase,
    getAllCategories: getAllCategories,
    addCategory: addCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,
    DEFAULT_SEED_PRODUCTS: DEFAULT_SEED_PRODUCTS,
    DEFAULT_SEED_CATEGORIES: DEFAULT_SEED_CATEGORIES,
    DEFAULT_SEED_CUSTOMERS: DEFAULT_SEED_CUSTOMERS
  };

  // Eagerly initialize on script load
  initDatabase().catch(e => console.error('Eager DB init failed:', e));
})();