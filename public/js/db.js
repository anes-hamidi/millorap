// ==========================================
// CLIENT-SIDE DATABASE INITIALIZATION (INDEXEDDB VIA DEXIE.JS)
// ==========================================
(function() {
  if (typeof Dexie === 'undefined') {
    console.error('Dexie.js is not loaded! Please include Dexie before db.js.');
    return;
  }

  const db = new Dexie('FlexiPOS_DB');

  // Schema definition:
  // products: id (auto), barcode (unique), name, category, currentStock, lowStockThreshold, costPrice, sellingPrice
  // sales: id (auto), orderRef, timestamp, paymentMethod, totalAmount, netProfit
  // saleItems: id (auto), saleId, productId
  // stockLogs: id (auto), productId, timestamp, type
  db.version(1).stores({
    products: '++id, &barcode, name, category, currentStock, lowStockThreshold, costPrice, sellingPrice',
    sales: '++id, &orderRef, timestamp, paymentMethod, totalAmount, netProfit',
    saleItems: '++id, saleId, productId',
    stockLogs: '++id, productId, timestamp, type'
  });

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
      image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456002',
      name: 'Thé Vert Naturel',
      category: 'Beverage',
      costPrice: 40,
      sellingPrice: 100,
      currentStock: 50,
      lowStockThreshold: 10,
      icon: '🍵',
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456003',
      name: 'Croissant Frais',
      category: 'Bakery',
      costPrice: 50,
      sellingPrice: 120,
      currentStock: 35,
      lowStockThreshold: 10,
      icon: '🥐',
      image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456004',
      name: 'Muffin Chocolat',
      category: 'Bakery',
      costPrice: 80,
      sellingPrice: 180,
      currentStock: 25,
      lowStockThreshold: 8,
      icon: '🧁',
      image: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456005',
      name: 'Impression Document (Couleur)',
      category: 'Printing',
      costPrice: 8,
      sellingPrice: 25,
      currentStock: 999,
      lowStockThreshold: 50,
      icon: '📄',
      image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456006',
      name: 'Tirage Photo A4',
      category: 'Printing',
      costPrice: 70,
      sellingPrice: 200,
      currentStock: 150,
      lowStockThreshold: 20,
      icon: '🖼️',
      image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456007',
      name: 'Écouteurs Sans Fil',
      category: 'Electronics',
      costPrice: 1600,
      sellingPrice: 2800,
      currentStock: 15,
      lowStockThreshold: 5,
      icon: '🎧',
      image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456008',
      name: 'Câble USB-C Rapide',
      category: 'Electronics',
      costPrice: 280,
      sellingPrice: 650,
      currentStock: 40,
      lowStockThreshold: 10,
      icon: '🔌',
      image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    },
    {
      barcode: '890123456009',
      name: 'Rouleaux Papier Thermique (x5)',
      category: 'Supplies',
      costPrice: 500,
      sellingPrice: 900,
      currentStock: 30,
      lowStockThreshold: 10,
      icon: '📜',
      image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString()
    }
  ];

  async function initDatabase() {
    try {
      await db.open();
      const productCount = await db.products.count();
      if (productCount === 0) {
        console.log('FlexiPOS_DB is empty. Seeding initial catalog...');
        await db.transaction('rw', db.products, db.stockLogs, async () => {
          for (const product of DEFAULT_SEED_PRODUCTS) {
            const id = await db.products.add(product);
            await db.stockLogs.add({
              productId: id,
              timestamp: new Date().toISOString(),
              type: 'RESTOCK',
              quantityChange: product.currentStock,
              previousStock: 0,
              newStock: product.currentStock,
              referenceId: 'INITIAL_SEED',
              note: 'Initial catalog setup'
            });
          }
        });
        console.log('Seeded initial products into IndexedDB.');
      }
      return db;
    } catch (err) {
      console.error('Failed to open or initialize FlexiPOS_DB:', err);
      throw err;
    }
  }

  window.FlexiDB = {
    db: db,
    init: initDatabase
  };
})();
