const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const Database = require('better-sqlite3');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'millora.db');
const PRODUCTS_FILE = path.join(DATA_DIR, 'pos_products.json');
const SALES_FILE = path.join(DATA_DIR, 'sales_history.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database with WAL mode for concurrent access
const sqliteDb = new Database(DB_FILE);
sqliteDb.pragma('journal_mode = WAL');

// Create tables mirroring JSON data shapes
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    price REAL,
    stock REAL,
    icon TEXT,
    image TEXT,
    barcode TEXT
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    timestamp TEXT,
    items_json TEXT,
    subtotal REAL,
    discount REAL,
    total REAL,
    payment_method TEXT
  );
`);

// Fallback products catalog if pos_products.json doesn't exist
const SEED_PRODUCTS = [
  { id: 'p1', name: 'Café Espresso', category: 'Beverage', price: 150, stock: 99, icon: '☕', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&auto=format&fit=crop&q=80', barcode: '890123456001' },
  { id: 'p2', name: 'Thé Vert Naturel', category: 'Beverage', price: 100, stock: 50, icon: '🍵', image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=80', barcode: '890123456002' },
  { id: 'p3', name: 'Croissant Frais', category: 'Bakery', price: 120, stock: 35, icon: '🥐', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80', barcode: '890123456003' },
  { id: 'p4', name: 'Muffin Chocolat', category: 'Bakery', price: 180, stock: 25, icon: '🧁', image: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=400&auto=format&fit=crop&q=80', barcode: '890123456004' },
  { id: 'p5', name: 'Impression Document (Couleur)', category: 'Printing', price: 25, stock: 999, icon: '📄', image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&auto=format&fit=crop&q=80', barcode: '890123456005' },
  { id: 'p6', name: 'Tirage Photo A4', category: 'Printing', price: 200, stock: 150, icon: '🖼️', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400&auto=format&fit=crop&q=80', barcode: '890123456006' },
  { id: 'p7', name: 'Écouteurs Sans Fil', category: 'Electronics', price: 2800, stock: 15, icon: '🎧', image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80', barcode: '890123456007' },
  { id: 'p8', name: 'Câble USB-C Rapide', category: 'Electronics', price: 650, stock: 40, icon: '🔌', image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=400&auto=format&fit=crop&q=80', barcode: '890123456008' },
  { id: 'p9', name: 'Rouleaux Papier Thermique (x5)', category: 'Supplies', price: 900, stock: 30, icon: '📜', image: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&auto=format&fit=crop&q=80', barcode: '890123456009' }
];

// One-time initial migration from flat JSON files if SQLite tables are empty
(function initMigration() {
  try {
    const prodCount = sqliteDb.prepare('SELECT COUNT(*) AS count FROM products').get().count;
    if (prodCount === 0) {
      let initialProducts = SEED_PRODUCTS;
      if (fs.existsSync(PRODUCTS_FILE)) {
        try {
          const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            initialProducts = parsed;
          }
        } catch (err) {
          console.warn('[SQLite Init] Error reading pos_products.json:', err.message);
        }
      }

      const insertProd = sqliteDb.prepare(`
        INSERT OR REPLACE INTO products (id, name, category, price, stock, icon, image, barcode)
        VALUES (@id, @name, @category, @price, @stock, @icon, @image, @barcode)
      `);

      const insertManyProds = sqliteDb.transaction(prods => {
        for (const p of prods) {
          const pid = p.id || p.barcode || ('p_' + Math.random().toString(36).substr(2, 9));
          insertProd.run({
            id: String(pid),
            name: p.name || 'Produit',
            category: p.category || 'Général',
            price: Number(p.price || p.sellingPrice || 0),
            stock: Number(p.stock != null ? p.stock : (p.currentStock != null ? p.currentStock : 0)),
            icon: p.icon || '📦',
            image: p.image || null,
            barcode: p.barcode ? String(p.barcode) : null
          });
        }
      });
      insertManyProds(initialProducts);
    }

    const salesCount = sqliteDb.prepare('SELECT COUNT(*) AS count FROM sales').get().count;
    if (salesCount === 0 && fs.existsSync(SALES_FILE)) {
      try {
        const rawSales = fs.readFileSync(SALES_FILE, 'utf8');
        const parsedSales = JSON.parse(rawSales);
        if (Array.isArray(parsedSales) && parsedSales.length > 0) {
          const insertSale = sqliteDb.prepare(`
            INSERT OR REPLACE INTO sales (id, timestamp, items_json, subtotal, discount, total, payment_method)
            VALUES (@id, @timestamp, @items_json, @subtotal, @discount, @total, @payment_method)
          `);
          const insertManySales = sqliteDb.transaction(sales => {
            for (const s of sales) {
              insertSale.run({
                id: String(s.id),
                timestamp: s.timestamp || new Date().toISOString(),
                items_json: typeof s.items === 'string' ? s.items : JSON.stringify(s.items || []),
                subtotal: parseFloat(s.subtotal || 0),
                discount: parseFloat(s.discount || 0),
                total: parseFloat(s.total || 0),
                payment_method: s.paymentMethod || s.payment_method || 'cash'
              });
            }
          });
          insertManySales(parsedSales);
        }
      } catch (err) {
        console.warn('[SQLite Init] Error reading sales_history.json:', err.message);
      }
    }
  } catch (err) {
    console.error('[SQLite Init] Migration error:', err.message);
  }
})();

async function getProducts() {
  try {
    const rows = sqliteDb.prepare('SELECT id, name, category, price, stock, icon, image, barcode FROM products').all();
    return rows;
  } catch (e) {
    console.error('Error reading products from SQLite:', e);
    return SEED_PRODUCTS;
  }
}

async function getSalesHistory() {
  try {
    const rows = sqliteDb.prepare('SELECT id, timestamp, items_json, subtotal, discount, total, payment_method FROM sales ORDER BY datetime(timestamp) DESC, rowid DESC').all();
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      items: typeof r.items_json === 'string' ? JSON.parse(r.items_json) : (r.items_json || []),
      subtotal: r.subtotal,
      discount: r.discount,
      total: r.total,
      paymentMethod: r.payment_method
    }));
  } catch (e) {
    console.error('Error reading sales history from SQLite:', e);
    return [];
  }
}

async function saveSalesHistory(history) {
  try {
    const insertSale = sqliteDb.prepare(`
      INSERT OR REPLACE INTO sales (id, timestamp, items_json, subtotal, discount, total, payment_method)
      VALUES (@id, @timestamp, @items_json, @subtotal, @discount, @total, @payment_method)
    `);

    const insertTx = sqliteDb.transaction(items => {
      for (const s of items) {
        insertSale.run({
          id: String(s.id),
          timestamp: s.timestamp || new Date().toISOString(),
          items_json: typeof s.items === 'string' ? s.items : JSON.stringify(s.items || []),
          subtotal: parseFloat(s.subtotal || 0),
          discount: parseFloat(s.discount || 0),
          total: parseFloat(s.total || 0),
          payment_method: s.paymentMethod || s.payment_method || 'cash'
        });
      }
    });

    insertTx(history);
  } catch (e) {
    console.error('Error saving sales history to SQLite:', e);
  }
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    const isVirtual = name.toLowerCase().includes('virtual') || 
                      name.toLowerCase().includes('vbox') || 
                      name.toLowerCase().includes('vmware') ||
                      name.toLowerCase().includes('vethernet');

    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.56.') || iface.address.startsWith('169.254.')) {
          continue;
        }

        if (!isVirtual) {
          candidates.unshift(iface.address);
        } else {
          candidates.push(iface.address);
        }
      }
    }
  }

  return candidates[0] || '127.0.0.1';
}

// API: Get POS Products Inventory
router.get('/products', async (req, res) => {
  try {
    const products = await getProducts();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Process POS Checkout Transaction
router.post('/checkout', async (req, res) => {
  try {
    const { items, subtotal, discount, total, paymentMethod } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    const transactionId = 'DZ-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const timestamp = new Date().toISOString();

    const saleRecord = {
      id: transactionId,
      timestamp,
      items,
      subtotal: parseFloat(subtotal || 0),
      discount: parseFloat(discount || 0),
      total: parseFloat(total || 0),
      paymentMethod: paymentMethod || 'cash'
    };

    // Save transaction record to local history store (async)
    const salesHistory = await getSalesHistory();
    salesHistory.unshift(saleRecord);
    await saveSalesHistory(salesHistory);

    // Format receipt layout
    const formattedReceiptHtml = `
      <div style="font-family: 'Courier New', monospace; width: 300px; padding: 15px; margin: 0 auto; border: 1px solid #ddd; background: #fff; color: #111;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 18px; letter-spacing: 1px;">MILLORA STORE DZ</h2>
          <p style="margin: 2px 0; font-size: 11px;">Alger, Algérie</p>
          <p style="margin: 2px 0; font-size: 11px;">Tél: +213 (0) 550-FLEXI</p>
        </div>
        <div style="font-size: 11px; margin-bottom: 10px;">
          <p style="margin: 2px 0;"><strong>N° Ticket:</strong> ${transactionId}</p>
          <p style="margin: 2px 0;"><strong>Date:</strong> ${new Date(timestamp).toLocaleString()}</p>
          <p style="margin: 2px 0;"><strong>Paiement:</strong> ${paymentMethod.toUpperCase()}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th>Article</th>
              <th style="text-align: center;">Qté</th>
              <th style="text-align: right;">Total (DA)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td style="padding: 3px 0;">${item.name}</td>
                <td style="text-align: center;">${item.qty}</td>
                <td style="text-align: right;">${(item.price * item.qty).toFixed(2)} DA</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="border-top: 1px dashed #000; margin-top: 10px; padding-top: 5px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between;"><span>Sous-total:</span><span>${parseFloat(subtotal).toFixed(2)} DA</span></div>
          ${discount > 0 ? `<div style="display: flex; justify-content: space-between; color: #16a34a;"><span>Remise:</span><span>-${parseFloat(discount).toFixed(2)} DA</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 6px; border-top: 1px solid #000; padding-top: 6px;">
            <span>TOTAL À PAYER:</span><span>${parseFloat(total).toFixed(2)} DA</span>
          </div>
        </div>
        <div style="text-align: center; margin-top: 15px; font-size: 10px; color: #555;">
          <p style="margin: 2px 0; font-weight: bold;">Merci pour votre visite !</p>
          <p style="margin: 2px 0;">Conservez ce ticket</p>
        </div>
      </div>
    `;

    res.json({
      success: true,
      message: 'Checkout completed successfully!',
      transaction: saleRecord,
      receiptHtml: formattedReceiptHtml
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get POS Sales History
router.get('/history', async (req, res) => {
  try {
    const history = await getSalesHistory();
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get Server Host Info for Mobile Scanning
router.get(['/info', '/lan-ip'], (req, res) => {
  const ip = getLocalIp();
  const port = process.env.PORT || 3000;
  // If PUBLIC_URL is set (e.g. Cloudflare Tunnel), use it for QR codes
  const baseUrl = process.env.PUBLIC_URL
    ? process.env.PUBLIC_URL.replace(/\/$/, '')
    : `http://${ip}:${port}`;
  res.json({ success: true, ip, port, baseUrl });
});

module.exports = router;
module.exports.getLocalIp = getLocalIp;
