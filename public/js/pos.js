// ==========================================
// POINT OF SALE (POS) - 100% STANDALONE OFFLINE INDEXEDDB CONTROLLER
// ==========================================
(function() {
  let posProducts = [];
  let productMap = new Map();
  let barcodeMap = new Map();
  let posCart = [];
  let posActiveCategory = 'all';
  let posDiscountPercent = 0;
  let posPaymentMethod = 'cash';
  let posQrCode = null;
  let cameraStream = null;
  let cameraScanningActive = false;

  // Scanner Hardware Configuration
  let scannerConfig = JSON.parse(localStorage.getItem('pos_scanner_config') || JSON.stringify({
    thresholdMs: 50,
    minLen: 4,
    suffix: 'Enter',
    soundEnabled: true
  }));

  // Hardware Scanner Keyboard Wedge Buffer
  let scanBuffer = '';
  let lastKeyTime = 0;

  let posInitializing = false;
  async function initPos() {
    if (posInitializing) return;
    posInitializing = true;
    try {
      if (window.FlexiDB && window.FlexiDB.init) {
        await window.FlexiDB.init();
      }
      await loadPosProducts();
      await renderPosSalesHistory();
      setupPosEventListeners();
      initHardwareScannerListener();
      checkBackupReminder();
    } catch (e) {
      console.error('POS initialization error:', e);
      showToast('Error loading POS database: ' + (e.message || e), 'error');
    } finally {
      posInitializing = false;
    }
  }

  // --- Load Products from IndexedDB ---
  async function loadPosProducts() {
    if (!window.FlexiDB || !window.FlexiDB.db) return;
    try {
      posProducts = await window.FlexiDB.db.products.toArray();
      // Build O(1) in-memory lookup maps
      productMap.clear();
      barcodeMap.clear();
      for (let i = 0; i < posProducts.length; i++) {
        const p = posProducts[i];
        productMap.set(p.id, p);
        if (p.barcode) {
          barcodeMap.set(p.barcode.toLowerCase(), p);
        }
      }
      renderPosProducts();
      updateLowStockBadge();
    } catch (e) {
      console.error('Error fetching products from IndexedDB:', e);
    }
  }

  function updateLowStockBadge() {
    const badge = document.getElementById('low-stock-alert-badge');
    if (!badge) return;
    const lowCount = posProducts.filter(p => {
      const threshold = Number(p.lowStockThreshold != null ? p.lowStockThreshold : 10);
      return Number(p.currentStock) <= threshold;
    }).length;

    if (lowCount > 0) {
      badge.classList.remove('hidden');
      badge.innerText = lowCount + ' Low Stock';
    } else {
      badge.classList.add('hidden');
    }
  }

  function renderPosProducts() {
    const grid = document.getElementById('pos-product-grid');
    if (!grid) return;

    const searchTerm = (document.getElementById('pos-search-input')?.value || '').toLowerCase().trim();

    const filtered = posProducts.filter(p => {
      const matchesCat = posActiveCategory === 'all' || p.category === posActiveCategory;
      const matchesSearch = !searchTerm || 
        p.name.toLowerCase().includes(searchTerm) || 
        p.category.toLowerCase().includes(searchTerm) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchTerm));
      return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="text-slate-400 text-xs p-8 text-center col-span-full flex flex-col items-center gap-3">
          <span>No products found matching your search.</span>
          <button onclick="openProductModal()" class="btn-gradient text-white px-3 py-1.5 rounded-xl font-bold">➕ Add New Item</button>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const isLowStock = Number(p.currentStock) <= Number(p.lowStockThreshold != null ? p.lowStockThreshold : 10);
      const isOutOfStock = Number(p.currentStock) <= 0;
      const price = Number(p.sellingPrice || p.price || 0);

      return `
      <div id="product-card-${p.id}" class="glass-panel overflow-hidden rounded-2xl border ${isOutOfStock ? 'border-rose-300 dark:border-rose-900 opacity-75' : isLowStock ? 'border-amber-300 dark:border-amber-800' : 'border-slate-200/80 dark:border-slate-800'} shadow-sm hover:border-indigo-500 hover:shadow-lg transition-all flex flex-col justify-between group relative bg-white/70 dark:bg-slate-900/70">
        
        <!-- Product Thumbnail Image Header -->
        <div class="relative w-full h-28 bg-slate-100 dark:bg-slate-800 overflow-hidden">
          ${p.image ? `
            <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden')">
            <div class="hidden w-full h-full flex items-center justify-center text-4xl select-none">${p.icon || '📦'}</div>
          ` : `
            <div class="w-full h-full flex items-center justify-center text-4xl select-none">${p.icon || '📦'}</div>
          `}

          <!-- Stock Badge -->
          <div class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold shadow-sm backdrop-blur-md ${isOutOfStock ? 'bg-rose-500 text-white' : isLowStock ? 'bg-amber-500 text-white' : 'bg-slate-900/80 text-white'}">
            ${isOutOfStock ? 'Out of Stock' : p.currentStock + ' in stock'}
          </div>

          <!-- Quick Edit Icon Button -->
          <button onclick="editProduct(${p.id})" class="absolute top-2 right-2 p-1.5 rounded-xl bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:text-indigo-600 shadow-sm opacity-0 group-hover:opacity-100 transition" title="Edit Product">
            ✏️
          </button>
        </div>

        <!-- Product Details Body -->
        <div class="p-3 flex flex-col flex-1 justify-between gap-2">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">${escapeHtml(p.category)}</span>
              ${p.barcode ? `<span class="text-[9px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">${p.barcode.slice(-4)}</span>` : ''}
            </div>
            <h4 class="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1 mt-0.5">${escapeHtml(p.name)}</h4>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div class="flex flex-col">
              <span class="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">${price.toFixed(2)} DA</span>
              ${p.costPrice ? `<span class="text-[9px] text-slate-400 font-mono">Cost: ${Number(p.costPrice).toFixed(0)} DA</span>` : ''}
            </div>
            <button onclick="addToPosCart(${p.id})" ${isOutOfStock ? 'disabled' : ''} class="${isOutOfStock ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'btn-gradient text-white shadow-sm hover:scale-105 active:scale-95'} px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition">
              <span>+</span> <span>Add</span>
            </button>
          </div>
        </div>

      </div>`;
    }).join('');
  }

  // Web Audio Scanner Beep
  function playScannerBeep() {
    if (!scannerConfig.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // High pitch A6
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
  }

  // --- Hardware Barcode Scanner Listener ---
  let scannerListenerAttached = false;
  function initHardwareScannerListener() {
    if (scannerListenerAttached) return;
    scannerListenerAttached = true;

    document.addEventListener('keydown', (e) => {
      const isSuffix = (scannerConfig.suffix === 'Enter' && e.key === 'Enter') ||
                       (scannerConfig.suffix === 'Tab' && e.key === 'Tab');

      if (isSuffix) {
        if (scanBuffer.length >= scannerConfig.minLen) {
          e.preventDefault();
          const scannedCode = scanBuffer.trim();
          scanBuffer = '';
          handleScannedBarcode(scannedCode);
          return;
        }
        scanBuffer = '';
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = Date.now();
        const timeDiff = now - lastKeyTime;
        lastKeyTime = now;

        if (timeDiff > scannerConfig.thresholdMs) {
          scanBuffer = e.key;
        } else {
          scanBuffer += e.key;
        }
      }
    });
  }

  function handleScannedBarcode(barcode) {
    playScannerBeep();

    const testOutput = document.getElementById('scanner-test-output');
    if (testOutput) {
      testOutput.innerHTML = `✅ Scanned: <span class="text-emerald-600 font-extrabold text-sm">${escapeHtml(barcode)}</span> (${barcode.length} chars)`;
    }

    // Fast O(1) in-memory lookup
    const normalized = barcode.toLowerCase();
    const product = barcodeMap.get(normalized) || productMap.get(Number(barcode)) || productMap.get(barcode);

    if (product) {
      addToPosCart(product.id);
      showToast(`Scanned: ${product.name} (${Number(product.sellingPrice || product.price).toFixed(2)} DA)`);

      const card = document.getElementById(`product-card-${product.id}`);
      if (card) {
        card.classList.add('ring-4', 'ring-indigo-500', 'scale-105');
        setTimeout(() => card.classList.remove('ring-4', 'ring-indigo-500', 'scale-105'), 400);
      }
    } else {
      showToast(`Unrecognized Barcode: ${barcode}`, 'error');
      if (confirm(`Barcode "${barcode}" not found in inventory. Would you like to create a new product for this barcode?`)) {
        openProductModal(null, barcode);
      }
    }
  }

  // --- Product Modal & IndexedDB CRUD ---
  window.openProductModal = (productToEdit = null, prefilledBarcode = '') => {
    const modal = document.getElementById('pos-product-modal');
    const form = document.getElementById('pos-product-form');
    const title = document.getElementById('product-modal-title');
    const deleteBtn = document.getElementById('delete-product-btn');

    if (!modal || !form) return;

    form.reset();
    if (productToEdit) {
      title.innerHTML = `<span>✏️</span> Edit Product`;
      document.getElementById('product-form-id').value = productToEdit.id;
      document.getElementById('product-form-name').value = productToEdit.name;
      document.getElementById('product-form-category').value = productToEdit.category;
      document.getElementById('product-form-price').value = productToEdit.sellingPrice || productToEdit.price;
      const costInput = document.getElementById('product-form-cost');
      if (costInput) costInput.value = productToEdit.costPrice || 0;
      document.getElementById('product-form-stock').value = productToEdit.currentStock != null ? productToEdit.currentStock : 50;
      const threshInput = document.getElementById('product-form-threshold');
      if (threshInput) threshInput.value = productToEdit.lowStockThreshold || 10;
      document.getElementById('product-form-icon').value = productToEdit.icon || '📦';
      document.getElementById('product-form-image').value = productToEdit.image || '';
      document.getElementById('product-form-barcode').value = productToEdit.barcode || '';
      deleteBtn.classList.remove('hidden');
    } else {
      title.innerHTML = `<span>➕</span> Add New Product`;
      document.getElementById('product-form-id').value = '';
      document.getElementById('product-form-icon').value = '📦';
      document.getElementById('product-form-image').value = '';
      document.getElementById('product-form-stock').value = '50';
      const costInput = document.getElementById('product-form-cost');
      if (costInput) costInput.value = '0';
      const threshInput = document.getElementById('product-form-threshold');
      if (threshInput) threshInput.value = '10';
      document.getElementById('product-form-barcode').value = prefilledBarcode || '';
      deleteBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  };

  window.editProduct = (productId) => {
    const product = posProducts.find(p => p.id === productId);
    if (product) openProductModal(product);
  };

  document.getElementById('open-add-product-btn')?.addEventListener('click', () => openProductModal());
  document.getElementById('close-product-modal-btn')?.addEventListener('click', () => {
    document.getElementById('pos-product-modal')?.classList.add('hidden');
  });

  document.getElementById('gen-random-barcode-btn')?.addEventListener('click', () => {
    const randomBarcode = '890' + Math.floor(100000000 + Math.random() * 900000000);
    document.getElementById('product-form-barcode').value = randomBarcode;
  });

  document.getElementById('pos-product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.FlexiDB || !window.FlexiDB.db) return;
    const db = window.FlexiDB.db;

    const idStr = document.getElementById('product-form-id').value;
    const name = document.getElementById('product-form-name').value.trim();
    const category = document.getElementById('product-form-category').value;
    const sellingPrice = parseFloat(document.getElementById('product-form-price').value) || 0;
    const costPrice = parseFloat(document.getElementById('product-form-cost')?.value) || 0;
    const currentStock = parseInt(document.getElementById('product-form-stock').value, 10) || 0;
    const lowStockThreshold = parseInt(document.getElementById('product-form-threshold')?.value, 10) || 10;
    const icon = document.getElementById('product-form-icon').value.trim() || '📦';
    const image = document.getElementById('product-form-image').value.trim();
    const barcode = document.getElementById('product-form-barcode').value.trim();

    if (!name || sellingPrice <= 0) {
      showToast('Please provide a valid product name and selling price', 'error');
      return;
    }

    try {
      if (idStr) {
        const id = parseInt(idStr, 10) || idStr;
        const existing = await db.products.get(id);
        const prevStock = existing ? existing.currentStock : currentStock;

        await db.products.update(id, {
          name, category, sellingPrice, costPrice, currentStock, lowStockThreshold, icon, image, barcode,
          updatedAt: new Date().toISOString()
        });

        if (prevStock !== currentStock) {
          await db.stockLogs.add({
            productId: id,
            timestamp: new Date().toISOString(),
            type: 'ADJUSTMENT',
            quantityChange: currentStock - prevStock,
            previousStock: prevStock,
            newStock: currentStock,
            referenceId: 'MANUAL_EDIT',
            note: 'Manual inventory adjustment'
          });
        }
        showToast(`Updated: ${name}`);
      } else {
        const newId = await db.products.add({
          name, category, sellingPrice, costPrice, currentStock, lowStockThreshold, icon, image, barcode,
          createdAt: new Date().toISOString()
        });
        await db.stockLogs.add({
          productId: newId,
          timestamp: new Date().toISOString(),
          type: 'RESTOCK',
          quantityChange: currentStock,
          previousStock: 0,
          newStock: currentStock,
          referenceId: 'NEW_PRODUCT',
          note: 'Initial inventory creation'
        });
        showToast(`Created product: ${name}`);
      }

      await loadPosProducts();
      document.getElementById('pos-product-modal')?.classList.add('hidden');
    } catch (err) {
      showToast('Database Error: ' + err.message, 'error');
    }
  });

  document.getElementById('delete-product-btn')?.addEventListener('click', async () => {
    const idStr = document.getElementById('product-form-id').value;
    if (!idStr || !window.FlexiDB?.db) return;
    if (confirm('Are you sure you want to remove this product from inventory?')) {
      const id = parseInt(idStr, 10) || idStr;
      await window.FlexiDB.db.products.delete(id);
      showToast('Product removed from inventory');
      await loadPosProducts();
      document.getElementById('pos-product-modal')?.classList.add('hidden');
    }
  });

  // --- Cart Operations ---
  window.addToPosCart = (productId) => {
    const product = productMap.get(productId) || posProducts.find(p => p.id === productId);
    if (!product) return;

    if (product.currentStock <= 0) {
      showToast(`"${product.name}" is out of stock!`, 'error');
      return;
    }

    const existing = posCart.find(item => item.id === productId);
    if (existing) {
      if (existing.qty + 1 > product.currentStock) {
        showToast(`Cannot add more. Only ${product.currentStock} units available in stock.`, 'error');
        return;
      }
      existing.qty += 1;
    } else {
      posCart.push({
        id: product.id,
        name: product.name,
        price: Number(product.sellingPrice || product.price || 0),
        cost: Number(product.costPrice || 0),
        stock: product.currentStock,
        qty: 1
      });
    }

    renderPosCart();
    playScannerBeep();
  };

  window.changeCartQty = (productId, delta) => {
    const item = posCart.find(i => i.id === productId);
    if (!item) return;

    const product = productMap.get(productId);
    const maxStock = product ? product.currentStock : item.stock;

    if (delta > 0 && item.qty + delta > maxStock) {
      showToast(`Only ${maxStock} units available in inventory.`, 'error');
      return;
    }

    item.qty += delta;
    if (item.qty <= 0) {
      posCart = posCart.filter(i => i.id !== productId);
    }
    renderPosCart();
  };

  window.removeFromPosCart = (productId) => {
    posCart = posCart.filter(i => i.id !== productId);
    renderPosCart();
  };

  function renderPosCart() {
    const container = document.getElementById('pos-cart-items');
    const countDisp = document.getElementById('pos-cart-count');
    const subtotalDisp = document.getElementById('pos-subtotal');
    const discountDisp = document.getElementById('pos-discount-val');
    const totalDisp = document.getElementById('pos-total');

    if (!container) return;

    // Single-pass computation for cart metrics
    let totalQty = 0;
    let subtotal = 0;
    for (let i = 0; i < posCart.length; i++) {
      const item = posCart[i];
      totalQty += item.qty;
      subtotal += item.price * item.qty;
    }
    const discountAmount = subtotal * (posDiscountPercent / 100);
    const grandTotal = Math.max(0, subtotal - discountAmount);

    if (countDisp) countDisp.innerText = totalQty;
    if (subtotalDisp) subtotalDisp.innerText = `${subtotal.toFixed(2)} DA`;
    if (discountDisp) discountDisp.innerText = `-${discountAmount.toFixed(2)} DA`;
    if (totalDisp) totalDisp.innerText = `${grandTotal.toFixed(2)} DA`;

    if (posCart.length === 0) {
      container.innerHTML = `<div class="text-slate-400 text-xs py-8 text-center">Cart is empty. Click catalog items or scan barcode.</div>`;
      hidePosPaymentQr();
      return;
    }

    container.innerHTML = posCart.map(item => `
      <div class="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between gap-2">
        <div class="flex flex-col min-w-0 flex-1">
          <span class="font-bold text-slate-800 dark:text-slate-100 text-xs truncate">${escapeHtml(item.name)}</span>
          <span class="text-[10px] text-slate-400 font-mono">${item.price.toFixed(2)} DA x ${item.qty} = ${(item.price * item.qty).toFixed(2)} DA</span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <div class="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
            <button onclick="changeCartQty(${item.id}, -1)" class="px-2 py-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs">-</button>
            <span class="px-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">${item.qty}</span>
            <button onclick="changeCartQty(${item.id}, 1)" class="px-2 py-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs">+</button>
          </div>
          <button onclick="removeFromPosCart(${item.id})" class="p-1 text-rose-500 hover:text-rose-700 text-xs" title="Remove item">✕</button>
        </div>
      </div>
    `).join('');

    if (posPaymentMethod === 'qr') {
      renderPosPaymentQr(grandTotal);
    } else {
      hidePosPaymentQr();
    }
  }

  // --- Dynamic QR Payment Display ---
  function renderPosPaymentQr(totalAmount) {
    const qrBox = document.getElementById('pos-qr-box');
    const qrCanvas = document.getElementById('pos-qr-canvas');
    const amountDisp = document.getElementById('pos-qr-amount-display');

    if (!qrBox || !qrCanvas) return;
    qrBox.classList.remove('hidden');
    if (amountDisp) amountDisp.innerText = `${totalAmount.toFixed(2)} DA`;

    const orderRef = 'DZ-' + Date.now().toString().slice(-6);
    const paymentUrl = `${window.location.origin}/pay?amount=${totalAmount.toFixed(2)}&order=${encodeURIComponent(orderRef)}`;

    qrCanvas.innerHTML = '';
    posQrCode = new QRCodeStyling({
      width: 160,
      height: 160,
      data: paymentUrl,
      dotsOptions: { color: '#059669', type: 'rounded' },
      cornersSquareOptions: { color: '#047857', type: 'extra-rounded' },
      backgroundOptions: { color: '#ffffff' }
    });
    posQrCode.append(qrCanvas);
  }

  function hidePosPaymentQr() {
    const qrBox = document.getElementById('pos-qr-box');
    if (qrBox) qrBox.classList.add('hidden');
  }

  // --- Complete Checkout via CheckoutService ---
  async function completePosCheckout() {
    if (posCart.length === 0) {
      showToast('Order cart is empty!', 'error');
      return;
    }

    showToast('Executing atomic checkout transaction...');

    try {
      const result = await window.CheckoutService.processCheckout({
        items: posCart,
        discountPercent: posDiscountPercent,
        paymentMethod: posPaymentMethod
      });

      showToast(`Checkout complete! Order Ref: ${result.orderRef}`);

      // Generate ESC/POS Thermal Receipt Layout
      const receiptHtml = generateThermalReceipt(result);
      const printArea = document.getElementById('print-area');
      if (printArea) {
        printArea.innerHTML = receiptHtml;
        setTimeout(() => {
          window.print();
        }, 300);
      }

      // Reset cart
      posCart = [];
      posDiscountPercent = 0;
      const discInput = document.getElementById('pos-discount-input');
      if (discInput) discInput.value = 0;

      renderPosCart();
      await loadPosProducts();
      await renderPosSalesHistory();

    } catch (err) {
      console.error('Checkout failed:', err);
      showToast('Checkout Failed: ' + err.message, 'error');
    }
  }

  // --- Thermal ESC/POS Receipt Formatter (Standard 80mm / 58mm) ---
  function generateThermalReceipt(sale) {
    const d = new Date(sale.timestamp);
    return `
      <div style="font-family: 'Courier New', Courier, monospace; width: 72mm; max-width: 100%; padding: 4mm; margin: 0 auto; background: #fff; color: #000; font-size: 11px; line-height: 1.3;">
        <div style="text-align: center; margin-bottom: 8px;">
          <h2 style="font-size: 16px; margin: 0; font-weight: bold; letter-spacing: 1px;">FLEXI STORE POS</h2>
          <p style="margin: 2px 0; font-size: 10px;">Alger Centre, Algérie</p>
          <p style="margin: 2px 0; font-size: 10px;">Tél: +213 (0) 550-000-000</p>
          <div style="border-bottom: 1px dashed #000; margin-top: 6px;"></div>
        </div>

        <div style="font-size: 10px; margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Ticket: <strong>${sale.orderRef}</strong></span>
            <span>ID: #${sale.saleId}</span>
          </div>
          <div>Date: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}</div>
          <div>Paiement: <strong>${sale.paymentMethod.toUpperCase()}</strong></div>
        </div>

        <div style="border-bottom: 1px solid #000; margin-bottom: 4px;"></div>

        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
          <thead>
            <tr style="text-align: left; border-bottom: 1px dashed #666;">
              <th style="padding: 2px 0;">Article</th>
              <th style="text-align: center;">Qté</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${sale.items.map(item => `
              <tr>
                <td style="padding: 2px 0; max-width: 38mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name)}</td>
                <td style="text-align: center;">${item.qty}</td>
                <td style="text-align: right; font-weight: bold;">${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Sous-total:</span>
            <span>${sale.subtotal.toFixed(2)} DA</span>
          </div>
          ${sale.discountAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #444;">
              <span>Remise (${sale.discountPercent}%):</span>
              <span>-${sale.discountAmount.toFixed(2)} DA</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px;">
            <span>TOTAL PAYÉ:</span>
            <span>${sale.totalAmount.toFixed(2)} DA</span>
          </div>
        </div>

        <div style="text-align: center; margin-top: 12px; border-top: 1px dashed #000; padding-top: 6px; font-size: 9px;">
          <p style="margin: 2px 0; font-weight: bold;">MERCI POUR VOTRE VISITE !</p>
          <p style="margin: 2px 0;">Système FlexiPOS 100% Hors-Ligne</p>
        </div>
      </div>
    `;
  }

  // --- Render Sales History from IndexedDB ---
  async function renderPosSalesHistory() {
    const historyContainer = document.getElementById('pos-sales-history');
    if (!historyContainer || !window.FlexiDB?.db) return;

    try {
      const recentSales = await window.FlexiDB.db.sales
        .reverse()
        .limit(20)
        .toArray();

      if (recentSales.length === 0) {
        historyContainer.innerHTML = `<div class="text-slate-400 text-center py-4 text-xs">No recent transactions yet.</div>`;
        return;
      }

      historyContainer.innerHTML = recentSales.map(sale => {
        const timeStr = new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between">
            <div class="flex flex-col min-w-0 pr-2">
              <span class="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs">${escapeHtml(sale.orderRef)}</span>
              <span class="text-[10px] text-slate-400">${timeStr} • ${sale.itemCount || 0} items • ${sale.paymentMethod.toUpperCase()}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">${Number(sale.totalAmount).toFixed(2)} DA</span>
              <span class="text-[9px] text-slate-400 font-mono">Profit: ${Number(sale.netProfit).toFixed(1)} DA</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.warn('Error reading sales history from IndexedDB:', e);
    }
  }

  // --- Backup Reminder Checker ---
  function checkBackupReminder() {
    if (window.BackupService && window.BackupService.isBackupReminderDue()) {
      const banner = document.getElementById('pos-backup-reminder-banner');
      if (banner) banner.classList.remove('hidden');
    }
  }

  // --- Setup POS Listeners ---
  let posEventsInitialized = false;
  function setupPosEventListeners() {
    if (posEventsInitialized) return;
    posEventsInitialized = true;

    // Debounced search input (120ms) to avoid unnecessary DOM reflows
    let searchDebounceTimer = null;
    document.getElementById('pos-search-input')?.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(renderPosProducts, 120);
    });

    // Category pills
    const catContainer = document.getElementById('pos-category-filters');
    catContainer?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pos-cat-btn');
      if (!btn) return;
      document.querySelectorAll('.pos-cat-btn').forEach(b => {
        b.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm', 'font-bold');
        b.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
      });
      btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm', 'font-bold');
      btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');

      posActiveCategory = btn.dataset.category || 'all';
      renderPosProducts();
    });

    // Discount percentage listener
    document.getElementById('pos-discount-input')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      posDiscountPercent = Math.min(100, Math.max(0, val));
      renderPosCart();
    });

    // Clear cart
    document.getElementById('pos-clear-cart')?.addEventListener('click', () => {
      posCart = [];
      renderPosCart();
      showToast('Order cart cleared');
    });

    // Payment methods
    const payBtns = document.querySelectorAll('.pos-pay-btn');
    payBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        payBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        posPaymentMethod = btn.dataset.method || 'cash';
        renderPosCart();
      });
    });

    // Checkout button
    const checkoutBtn = document.getElementById('pos-checkout-btn');
    if (checkoutBtn) checkoutBtn.onclick = completePosCheckout;

    // Analytics Modal Button
    document.getElementById('open-pos-analytics-btn')?.addEventListener('click', openAnalyticsModal);
    document.getElementById('close-pos-analytics-btn')?.addEventListener('click', () => {
      document.getElementById('pos-analytics-modal')?.classList.add('hidden');
    });

    // Backup Modal Button
    document.getElementById('open-pos-backup-btn')?.addEventListener('click', () => {
      document.getElementById('pos-backup-modal')?.classList.remove('hidden');
    });
    document.getElementById('close-pos-backup-btn')?.addEventListener('click', () => {
      document.getElementById('pos-backup-modal')?.classList.add('hidden');
    });

    // Dismiss backup banner
    document.getElementById('dismiss-backup-banner')?.addEventListener('click', () => {
      document.getElementById('pos-backup-reminder-banner')?.classList.add('hidden');
    });

    // JSON Export
    document.getElementById('export-json-btn')?.addEventListener('click', async () => {
      try {
        const res = await window.BackupService.exportDatabaseToJson();
        showToast(`Database exported: ${res.filename}`);
        document.getElementById('pos-backup-reminder-banner')?.classList.add('hidden');
      } catch (err) {
        showToast('Export Error: ' + err.message, 'error');
      }
    });

    // JSON Import
    document.getElementById('import-json-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (confirm('Warning: Restoring backup will overwrite current local inventory and sales history. Continue?')) {
        try {
          const res = await window.BackupService.importDatabaseFromJson(file);
          showToast(`Database Restored! Products: ${res.restored.products}, Sales: ${res.restored.sales}`);
          await loadPosProducts();
          await renderPosSalesHistory();
          document.getElementById('pos-backup-modal')?.classList.add('hidden');
        } catch (err) {
          showToast('Import Error: ' + err.message, 'error');
        }
      }
      e.target.value = '';
    });

    // CSV Exports
    document.getElementById('export-inventory-csv-btn')?.addEventListener('click', async () => {
      try {
        await window.BackupService.exportInventoryToCsv();
        showToast('Inventory CSV downloaded');
      } catch (err) {
        showToast('CSV Error: ' + err.message, 'error');
      }
    });

    document.getElementById('export-sales-csv-btn')?.addEventListener('click', async () => {
      try {
        await window.BackupService.exportSalesRegisterToCsv();
        showToast('Sales Register CSV downloaded');
      } catch (err) {
        showToast('CSV Error: ' + err.message, 'error');
      }
    });
  }

  // --- Analytics Modal Computation ---
  async function openAnalyticsModal() {
    const modal = document.getElementById('pos-analytics-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    try {
      // 1. Revenue Analytics
      const rev = await window.AnalyticsService.getRevenueAnalytics();
      const elRev = document.getElementById('analytics-gross-revenue') || document.getElementById('analytics-total-revenue');
      if (elRev) elRev.innerText = rev.totalRevenue.toFixed(2) + ' DA';

      const elCogs = document.getElementById('analytics-cogs') || document.getElementById('analytics-total-cogs');
      if (elCogs) elCogs.innerText = rev.totalCost.toFixed(2) + ' DA';

      const elProfit = document.getElementById('analytics-net-profit');
      if (elProfit) elProfit.innerText = rev.netProfit.toFixed(2) + ' DA';

      const elMargin = document.getElementById('analytics-margin-percent') || document.getElementById('analytics-profit-margin');
      if (elMargin) elMargin.innerText = rev.marginPercent.toFixed(1) + '% margin';

      const elOrders = document.getElementById('analytics-total-transactions') || document.getElementById('analytics-order-count');
      if (elOrders) elOrders.innerText = rev.orderCount + ' transactions';

      const elBasket = document.getElementById('analytics-avg-basket');
      if (elBasket) elBasket.innerText = rev.avgBasket.toFixed(2) + ' DA';

      // Payment breakdown
      const payBreakdown = document.getElementById('analytics-payment-breakdown');
      if (payBreakdown) {
        const methods = Object.keys(rev.paymentMethods);
        if (methods.length === 0) {
          payBreakdown.innerHTML = '<span class="text-slate-400 text-xs">No payment data yet.</span>';
        } else {
          payBreakdown.innerHTML = methods.map(m => `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
              <span class="font-bold uppercase text-slate-700 dark:text-slate-300">${m}</span>
              <span class="font-mono text-indigo-600 dark:text-indigo-400 font-bold">${rev.paymentMethods[m].total.toFixed(2)} DA (${rev.paymentMethods[m].count} sales)</span>
            </div>
          `).join('');
        }
      }

      // 2. Low Stock Alerts
      const lowStockList = await window.AnalyticsService.getLowStockProducts();
      const lowStockContainer = document.getElementById('analytics-low-stock-list');
      if (lowStockContainer) {
        if (lowStockList.length === 0) {
          lowStockContainer.innerHTML = '<span class="text-emerald-600 text-xs font-semibold">✅ All inventory levels are healthy!</span>';
        } else {
          lowStockContainer.innerHTML = lowStockList.map(p => {
            const isZero = p.currentStock <= 0;
            return `
              <div class="flex items-center justify-between p-2 rounded-xl ${isZero ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800'} text-xs">
                <span class="font-bold ${isZero ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-200'}">${escapeHtml(p.name)}</span>
                <span class="font-mono font-extrabold ${isZero ? 'text-rose-600' : 'text-amber-600'}">${isZero ? 'OUT OF STOCK' : p.currentStock + ' left (min: ' + (p.lowStockThreshold || 10) + ')'}</span>
              </div>
            `;
          }).join('');
        }
      }

      // 3. Top Selling Products
      const topSellers = await window.AnalyticsService.getTopSellingProducts('30days');
      const topContainer = document.getElementById('analytics-top-sellers-list');
      if (topContainer) {
        if (topSellers.length === 0) {
          topContainer.innerHTML = '<span class="text-slate-400 text-xs">No sales recorded yet.</span>';
        } else {
          topContainer.innerHTML = topSellers.slice(0, 8).map((p, idx) => `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
              <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold flex items-center justify-center">#${idx + 1}</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">${escapeHtml(p.name)}</span>
              </div>
              <div class="flex items-center gap-3 font-mono">
                <span class="text-slate-500 text-[11px]">${p.totalQuantity} units</span>
                <span class="text-emerald-600 dark:text-emerald-400 font-extrabold">${p.totalRevenue.toFixed(0)} DA</span>
              </div>
            </div>
          `).join('');
        }
      }

    } catch (err) {
      console.error('Analytics error:', err);
      showToast('Error generating analytics: ' + err.message, 'error');
    }
  }

  window.POS = {
    init: initPos,
    loadProducts: loadPosProducts,
    renderSalesHistory: renderPosSalesHistory
  };
})();