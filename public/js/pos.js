// ==========================================
// POINT OF SALE (POS) - 100% STANDALONE OFFLINE INDEXEDDB CONTROLLER
// ==========================================
(function() {
  function escapeHtml(str) {
    return str ? String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) : '';
  }
  window.escapeHtml = escapeHtml;

  const FALLBACK_SEED_PRODUCTS = [
    { id: 1, barcode: '890123456001', name: 'Café Espresso', category: 'Beverage', costPrice: 60, sellingPrice: 150, currentStock: 99, lowStockThreshold: 15, icon: '☕', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&auto=format&fit=crop&q=80' },
    { id: 2, barcode: '890123456002', name: 'Thé Vert Naturel', category: 'Beverage', costPrice: 40, sellingPrice: 100, currentStock: 50, lowStockThreshold: 10, icon: '🍵', image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=80' },
    { id: 3, barcode: '890123456003', name: 'Croissant Frais', category: 'Bakery', costPrice: 50, sellingPrice: 120, currentStock: 35, lowStockThreshold: 10, icon: '🥐', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80' },
    { id: 4, barcode: '890123456004', name: 'Muffin Chocolat', category: 'Bakery', costPrice: 80, sellingPrice: 180, currentStock: 25, lowStockThreshold: 8, icon: '🧁', image: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=400&auto=format&fit=crop&q=80' },
    { id: 5, barcode: '890123456005', name: 'Impression Document (Couleur)', category: 'Printing', costPrice: 8, sellingPrice: 25, currentStock: 999, lowStockThreshold: 50, icon: '📄', image: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=400&auto=format&fit=crop&q=80' },
    { id: 6, barcode: '890123456006', name: 'Tirage Photo A4', category: 'Printing', costPrice: 70, sellingPrice: 200, currentStock: 150, lowStockThreshold: 20, icon: '🖼️', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400&auto=format&fit=crop&q=80' },
    { id: 7, barcode: '890123456007', name: 'Écouteurs Sans Fil', category: 'Electronics', costPrice: 1600, sellingPrice: 2800, currentStock: 15, lowStockThreshold: 5, icon: '🎧', image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80' },
    { id: 8, barcode: '890123456008', name: 'Câble USB-C Rapide', category: 'Electronics', costPrice: 280, sellingPrice: 650, currentStock: 40, lowStockThreshold: 10, icon: '🔌', image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=400&auto=format&fit=crop&q=80' },
    { id: 9, barcode: '890123456009', name: 'Rouleaux Papier Thermique (x5)', category: 'Supplies', costPrice: 500, sellingPrice: 900, currentStock: 30, lowStockThreshold: 10, icon: '📜', image: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&auto=format&fit=crop&q=80' }
  ];

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
        try {
          await window.FlexiDB.init();
        } catch (dbErr) {
          console.warn('FlexiDB.init warning (non-fatal):', dbErr);
        }
      }
    } catch (e) {
      console.warn('DB check warning:', e);
    }

    try {
      await syncCategoriesUI();
      await loadPosProducts();
    } catch (e) {
      console.error('Error loading POS products:', e);
    }

    try {
      await renderPosSalesHistory();
    } catch (e) {
      console.warn('Error rendering sales history:', e);
    }

    try {
      setupPosEventListeners();
      initHardwareScannerListener();
      updateParkedCartsUI();
      checkBackupReminder();
    } catch (e) {
      console.error('Error setting up POS listeners:', e);
    } finally {
      posInitializing = false;
    }
  }

  // --- Lazy Product Fetching & Pagination Engine ---
  let posCurrentPage = 0;
  const POS_PAGE_SIZE = 36;
  let posHasMore = true;
  let posIsLoading = false;
  let posSentinelObserver = null;

  async function loadPosProducts() {
    await renderPosProducts(true);
    updateLowStockBadge();
    updateExpiryBadge();
    updateStockConflictBadge();
    updateSyncBadge();
  }

  async function updateLowStockBadge() {
    const badge = document.getElementById('low-stock-alert-badge');
    const navBadge = document.getElementById('nav-low-stock-badge');
    if (!window.FlexiDB || !window.FlexiDB.db) return;
    try {
      if (window.FlexiDB.getInventoryStats) {
        const stats = await window.FlexiDB.getInventoryStats();
        const lowCount = stats.lowCount || 0;
        if (badge) {
          badge.classList.toggle('hidden', lowCount === 0);
          badge.innerText = `⚠️ ${lowCount} Low Stock`;
        }
        if (navBadge) {
          navBadge.classList.toggle('hidden', lowCount === 0);
          navBadge.innerText = lowCount;
        }
      }
    } catch (e) {}
  }

  async function updateExpiryBadge() {
    try {
      if (!window.AnalyticsService || !window.AnalyticsService.getExpiringBatches) return;
      const batches = await window.AnalyticsService.getExpiringBatches(7);
      const badge = document.getElementById('expiry-alert-badge');
      const navBadge = document.getElementById('nav-expiry-badge');
      const count = batches.length;
      const hasDanger = batches.some(b => b.severity === 'danger');

      if (badge) {
        if (count > 0) {
          badge.classList.remove('hidden');
          badge.className = `flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${hasDanger ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300 animate-pulse' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300'}`;
          badge.innerHTML = `<span>⏳</span> <span>${count} Lot(s) Périment Bientôt</span>`;
        } else {
          badge.classList.add('hidden');
        }
      }

      if (navBadge) {
        if (count > 0) {
          navBadge.classList.remove('hidden');
          navBadge.innerText = count;
          navBadge.className = `px-1.5 py-0.5 rounded-full text-[10px] font-black ${hasDanger ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`;
        } else {
          navBadge.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('updateExpiryBadge error:', e);
    }
  }
  window.updateExpiryBadge = updateExpiryBadge;

  async function updateStockConflictBadge() {
    try {
      if (!window.AnalyticsService?.getStockConflicts) return;
      const conflicts = await window.AnalyticsService.getStockConflicts('open');
      const count = conflicts.length;
      const badge = document.getElementById('stock-conflict-badge');
      const navBadge = document.getElementById('nav-conflicts-badge');

      if (badge) {
        if (count > 0) {
          badge.classList.remove('hidden');
          badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 animate-pulse cursor-pointer';
          badge.innerHTML = `<span>⚠️</span> <span>${count} Conflit(s) Stock</span>`;
        } else {
          badge.classList.add('hidden');
        }
      }

      if (navBadge) {
        if (count > 0) {
          navBadge.classList.remove('hidden');
          navBadge.innerText = count;
          navBadge.className = 'nav-badge-pill text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white animate-pulse';
        } else {
          navBadge.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('updateStockConflictBadge error:', e);
    }
  }
  window.updateStockConflictBadge = updateStockConflictBadge;

  function updateSyncBadge() {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    const terminalId = localStorage.getItem('pos_terminal_id') || 'REG-01';
    const db = window.FlexiDB?.db;

    if (db && db.cloud && typeof db.cloud.syncState?.subscribe === 'function') {
      try {
        db.cloud.currentUser?.subscribe(user => {
          const isAuthenticated = user && user.isLoggedIn;
          if (isAuthenticated) {
            badge.title = `Dexie Cloud Authenticated: ${user.name || user.email || user.userId} (${terminalId})`;
          } else {
            badge.title = `Dexie Cloud: Authentication Required (${terminalId})`;
          }
        });

        db.cloud.syncState.subscribe(state => {
          if (!state) return;
          const user = db.cloud.currentUser?.value;
          const isAuthenticated = user && user.isLoggedIn;

          if (!isAuthenticated && db.cloud.options?.requireAuth) {
            badge.className = 'flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-pointer';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span> <span>Connexion Requise (${terminalId})</span>`;
            badge.onclick = () => {
              if (typeof db.cloud.login === 'function') {
                db.cloud.login().catch(err => console.warn('Login prompt:', err));
              }
            };
            return;
          }

          if (state.phase === 'in-sync' || state.status === 'online') {
            badge.className = 'flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Cloud Synchronisé (${terminalId})</span>`;
            badge.onclick = null;
          } else if (state.phase === 'connecting' || state.phase === 'syncing') {
            badge.className = 'flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 animate-pulse';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span>Synchro...</span>`;
            badge.onclick = null;
          } else if (state.status === 'offline') {
            badge.className = 'flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span> <span>Hors-ligne (${terminalId})</span>`;
            badge.onclick = null;
          } else if (state.phase === 'error') {
            badge.className = 'flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> <span>Erreur Sync</span>`;
            badge.onclick = null;
          }
        });
        return;
      } catch (e) {}
    }

    // Default standalone / local indicator
    badge.className = 'flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Local (${terminalId})</span>`;
    badge.onclick = null;
  }
  window.updateSyncBadge = updateSyncBadge;

  function buildProductCardHtml(p) {
    const stockVal = Number(p.currentStock != null ? p.currentStock : (p.stock != null ? p.stock : 0));
    const threshVal = Number(p.lowStockThreshold != null ? p.lowStockThreshold : 10);
    const isLowStock = stockVal <= threshVal;
    const isOutOfStock = stockVal <= 0;
    const price = Number(p.sellingPrice || p.price || 0);
    const safeId = escapeHtml(String(p.id));
    const hasPack = p.unitsPerPack && Number(p.unitsPerPack) > 1;
    const packMultiplier = hasPack ? Number(p.unitsPerPack) : 1;
    const packPrice = hasPack ? Number(p.packPrice || (price * packMultiplier)) : 0;
    const packLabel = escapeHtml(p.packUnitLabel || 'Pack');

    return `
      <div id="product-card-${safeId}" class="glass-panel overflow-hidden rounded-2xl border ${isOutOfStock ? 'border-rose-300 dark:border-rose-900 opacity-75' : isLowStock ? 'border-amber-300 dark:border-amber-800' : 'border-slate-200/80 dark:border-slate-800'} shadow-sm hover:border-indigo-500 hover:shadow-lg transition-all flex flex-col justify-between group relative bg-white/70 dark:bg-slate-900/70">
        
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
            ${isOutOfStock ? 'Out of Stock' : stockVal + ' in stock'}
          </div>

          <!-- Quick Edit Icon Button -->
          <button onclick="editProduct('${safeId}')" class="absolute top-2 right-2 p-1.5 rounded-xl bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:text-indigo-600 shadow-sm opacity-0 group-hover:opacity-100 transition" title="Edit Product">
            ✏️
          </button>
        </div>

        <!-- Product Details Body -->
        <div class="p-3 flex flex-col flex-1 justify-between gap-2">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">${escapeHtml(p.category || 'General')}</span>
              ${p.barcode ? `<span class="text-[9px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">${String(p.barcode).slice(-4)}</span>` : ''}
            </div>
            <h4 class="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1 mt-0.5">${escapeHtml(p.name)}</h4>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div class="flex flex-col">
              <span class="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">${price.toFixed(2)} DA</span>
              ${hasPack ? `<span class="text-[10px] text-purple-600 dark:text-purple-400 font-bold font-mono">${packPrice.toFixed(2)} DA <span class="text-[9px] text-slate-400 font-normal">/${packLabel} (×${packMultiplier})</span></span>` : ''}
            </div>
            ${hasPack ? `
              <div class="flex items-center gap-1">
                <button onclick="addToPosCart('${safeId}', 'unit')" ${isOutOfStock ? 'disabled' : ''} class="${isOutOfStock ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800'} px-2 py-1.5 rounded-xl text-[10px] font-bold transition" title="Ajouter une unité">
                  + Unité
                </button>
                <button onclick="addToPosCart('${safeId}', 'pack')" ${stockVal < packMultiplier ? 'disabled' : ''} class="${stockVal < packMultiplier ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'btn-gradient text-white shadow-sm hover:scale-105 active:scale-95'} px-2 py-1.5 rounded-xl text-[10px] font-bold transition" title="Ajouter un ${packLabel}">
                  + ${packLabel}
                </button>
              </div>
            ` : `
              <button onclick="addToPosCart('${safeId}', 'unit')" ${isOutOfStock ? 'disabled' : ''} class="${isOutOfStock ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'btn-gradient text-white shadow-sm hover:scale-105 active:scale-95'} px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition">
                <span>+</span> <span>Add</span>
              </button>
            `}
          </div>
        </div>

      </div>`;
  }

  async function renderPosProducts(reset = false) {
    const grid = document.getElementById('pos-product-grid');
    if (!grid) return;

    if (reset) {
      posCurrentPage = 0;
      posHasMore = true;
      posProducts = [];
      productMap.clear();
      barcodeMap.clear();
    }

    if (posIsLoading || (!posHasMore && !reset)) return;
    posIsLoading = true;

    const sentinel = document.getElementById('pos-scroll-sentinel');
    if (sentinel && !reset) sentinel.classList.remove('hidden');

    const searchTerm = (document.getElementById('pos-search-input')?.value || '').toLowerCase().trim();

    try {
      let pageProducts = [];
      let hasMoreItems = false;

      if (window.SearchEngine && window.SearchEngine.isReady()) {
        const res = await window.SearchEngine.search({
          category: posActiveCategory,
          query: searchTerm,
          page: posCurrentPage,
          pageSize: POS_PAGE_SIZE
        });
        pageProducts = res.products || [];
        hasMoreItems = res.hasMore;
      } else if (window.FlexiDB && window.FlexiDB.getProductsPaged) {
        const res = await window.FlexiDB.getProductsPaged({
          category: posActiveCategory,
          search: searchTerm,
          page: posCurrentPage,
          pageSize: POS_PAGE_SIZE
        });
        pageProducts = res.products || [];
        hasMoreItems = res.hasMore;
      } else if (window.FlexiDB && window.FlexiDB.db) {
        pageProducts = await window.FlexiDB.db.products.offset(posCurrentPage * POS_PAGE_SIZE).limit(POS_PAGE_SIZE).toArray();
        hasMoreItems = pageProducts.length === POS_PAGE_SIZE;
      } else {
        pageProducts = FALLBACK_SEED_PRODUCTS;
      }

      // Populate in-memory quick-lookup maps
      pageProducts.forEach(p => {
        posProducts.push(p);
        productMap.set(p.id, p);
        productMap.set(String(p.id), p);
        if (p.barcode) {
          barcodeMap.set(String(p.barcode).trim().toLowerCase(), p);
        }
      });

      if (reset) {
        if (pageProducts.length === 0) {
          if (searchTerm || posActiveCategory !== 'all') {
            grid.innerHTML = `
              <div class="text-slate-400 text-xs p-8 text-center col-span-full flex flex-col items-center gap-3">
                <span>Aucun produit trouvé pour ces critères.</span>
                <button onclick="openProductModal()" class="btn-gradient text-white px-3 py-1.5 rounded-xl font-bold">➕ Ajouter un produit</button>
              </div>`;
          } else {
            grid.innerHTML = `
              <div class="text-slate-400 text-xs p-8 text-center col-span-full flex flex-col items-center gap-3">
                <span>Catalogue vide ou en cours d'initialisation.</span>
                <div class="flex items-center gap-2">
                  <button onclick="window.POS && window.POS.loadProducts()" class="px-3.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-bold shadow-sm hover:bg-indigo-100 transition">🔄 Recharger</button>
                  <button onclick="openProductModal()" class="btn-gradient text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-sm">➕ Ajouter un produit</button>
                </div>
              </div>`;
          }
        } else {
          grid.innerHTML = pageProducts.map(buildProductCardHtml).join('');
        }
      } else {
        if (pageProducts.length > 0) {
          grid.insertAdjacentHTML('beforeend', pageProducts.map(buildProductCardHtml).join(''));
        }
      }

      posHasMore = hasMoreItems;
      if (posHasMore) {
        posCurrentPage++;
      }

      setupPosInfiniteScrollObserver();
    } catch (err) {
      console.error('Error in renderPosProducts:', err);
    } finally {
      posIsLoading = false;
      if (sentinel) sentinel.classList.add('hidden');
    }
  }

  function setupPosInfiniteScrollObserver() {
    const sentinel = document.getElementById('pos-scroll-sentinel');
    if (!sentinel) return;

    if (posSentinelObserver) {
      posSentinelObserver.disconnect();
    }

    if (!posHasMore) {
      sentinel.classList.add('hidden');
      return;
    }

    posSentinelObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && posHasMore && !posIsLoading) {
        renderPosProducts(false);
      }
    }, { rootMargin: '300px' });

    posSentinelObserver.observe(sentinel);
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

  // --- Hardware Barcode Scanner & Dual-Input Stream Router ---
  let scannerListenerAttached = false;
  function initHardwareScannerListener() {
    if (scannerListenerAttached) return;
    scannerListenerAttached = true;

    document.addEventListener('keydown', (e) => {
      // 1. Change Due HUD dismiss on Enter / Space / Escape
      const changeHud = document.getElementById('pos-change-hud');
      if (changeHud && !changeHud.classList.contains('hidden')) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          dismissChangeDueHUD();
          return;
        }
      }

      // 2. Global Hotkeys (when not actively typing inside form text fields)
      const activeEl = document.activeElement;
      const isTextInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

      if (!isTextInput) {
        // Space or F12: Instant Cash Checkout (Exact)
        if (e.key === ' ' || e.key === 'c') {
          if (posCart.length > 0) {
            e.preventDefault();
            completePosCashCheckout(null);
            return;
          }
        }
        // F9: Open Credit Checkout
        if (e.key === 'F9') {
          e.preventDefault();
          openPosCreditModal();
          return;
        }
      }

      // Ctrl+D: Quick Focus Discount Input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const discInput = document.getElementById('pos-discount-input');
        if (discInput) {
          discInput.focus();
          discInput.select();
        }
        return;
      }

      // Ctrl+E: Cash Drawer Kick Signal
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        kickPosCashDrawer();
        return;
      }

      // 3. Hardware Barcode Wedge Stream Routing
      const isSuffix = (scannerConfig.suffix === 'Enter' && e.key === 'Enter') ||
                       (scannerConfig.suffix === 'Tab' && e.key === 'Tab');

      if (isSuffix) {
        if (scanBuffer.length >= scannerConfig.minLen) {
          e.preventDefault();
          e.stopPropagation();
          const scannedCode = scanBuffer.trim();
          scanBuffer = '';
          handleScannedBarcode(scannedCode);
          return;
        }
        scanBuffer = '';
        return;
      }

      if ((e.key || '').length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = Date.now();
        const timeDiff = now - lastKeyTime;
        lastKeyTime = now;

        // Hardware scanners output rapid character stream (< 50ms per key)
        if (timeDiff > (scannerConfig.thresholdMs || 50)) {
          scanBuffer = e.key;
        } else {
          scanBuffer += e.key;
          const statusPill = document.getElementById('pos-scanner-status');
          if (statusPill) {
            statusPill.classList.add('pos-wedge-active');
            setTimeout(() => statusPill.classList.remove('pos-wedge-active'), 200);
          }
        }
      }
    }, true);
  }

  // Camera Barcode Scanner
  async function startCameraScanner() {
    const modal = document.getElementById('camera-scanner-modal');
    const video = document.getElementById('camera-scanner-video');
    if (!modal || !video) return;

    modal.classList.remove('hidden');
    cameraScanningActive = true;

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      video.srcObject = cameraStream;
      await video.play();

      if ('BarcodeDetector' in window) {
        const barcodeDetector = new BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e']
        });

        const scanFrame = async () => {
          if (!cameraScanningActive) return;
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes && barcodes.length > 0) {
              const detected = barcodes[0].rawValue;
              if (detected) {
                stopCameraScanner();
                handleScannedBarcode(detected);
                return;
              }
            }
          } catch (e) {}
          if (cameraScanningActive) {
            requestAnimationFrame(scanFrame);
          }
        };
        requestAnimationFrame(scanFrame);
      } else {
        showToast('Camera active. (Note: BarcodeDetector API not supported natively on this browser; USB laser gun recommended).', 'info');
      }
    } catch (err) {
      console.warn('Camera error:', err);
      showToast('Camera access denied or unavailable: ' + err.message, 'error');
      stopCameraScanner();
    }
  }

  function stopCameraScanner() {
    cameraScanningActive = false;
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    const video = document.getElementById('camera-scanner-video');
    if (video) video.srcObject = null;
    document.getElementById('camera-scanner-modal')?.classList.add('hidden');
  }

  async function handleScannedBarcode(barcode) {
    playScannerBeep();

    const cleanBarcode = String(barcode).trim();
    const testOutput = document.getElementById('scanner-test-output');
    if (testOutput) {
      testOutput.innerHTML = `✅ Scanned: <span class="text-emerald-600 font-extrabold text-sm">${escapeHtml(cleanBarcode)}</span> (${cleanBarcode.length} chars)`;
    }

    // 1. Fast O(1) in-memory lookup
    const normalized = cleanBarcode.toLowerCase();
    let product = barcodeMap.get(normalized) || productMap.get(Number(cleanBarcode)) || productMap.get(cleanBarcode);

    // 2. Fast IndexedDB fallback if item not loaded in current UI slice
    if (!product && window.FlexiDB && window.FlexiDB.db) {
      try {
        const db = window.FlexiDB.db;
        product = await db.products.where('barcode').equals(cleanBarcode).first();
        if (!product) {
          product = await db.products.where('barcode').equalsIgnoreCase(cleanBarcode).first();
        }
        if (product) {
          // Cache in memory for subsequent hits
          productMap.set(product.id, product);
          productMap.set(String(product.id), product);
          barcodeMap.set(normalized, product);
        }
      } catch (dbErr) {
        console.warn('Barcode DB lookup error:', dbErr);
      }
    }

    if (product) {
      addToPosCart(product.id);
      showToast(`Scanned: ${product.name} (${Number(product.sellingPrice || product.price).toFixed(2)} DA)`);

      const card = document.getElementById(`product-card-${product.id}`);
      if (card) {
        card.classList.add('ring-4', 'ring-indigo-500', 'scale-105');
        setTimeout(() => card.classList.remove('ring-4', 'ring-indigo-500', 'scale-105'), 400);
      }
    } else {
      showToast(`Unrecognized Barcode: ${cleanBarcode}`, 'error');
      if (confirm(`Barcode "${cleanBarcode}" not found in inventory. Would you like to create a new product for this barcode?`)) {
        openProductModal(null, cleanBarcode);
      }
    }
  }
  window.handleScannedBarcode = handleScannedBarcode;

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
      const unitsPerPackInput = document.getElementById('product-form-units-per-pack');
      if (unitsPerPackInput) unitsPerPackInput.value = productToEdit.unitsPerPack || 1;
      const packLabelInput = document.getElementById('product-form-pack-label');
      if (packLabelInput) packLabelInput.value = productToEdit.packUnitLabel || '';
      const packPriceInput = document.getElementById('product-form-pack-price');
      if (packPriceInput) packPriceInput.value = productToEdit.packPrice != null ? productToEdit.packPrice : '';
      const packDefaultCheck = document.getElementById('product-form-pack-default');
      if (packDefaultCheck) packDefaultCheck.checked = Boolean(productToEdit.sellByPackDefault);
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
      const unitsPerPackInput = document.getElementById('product-form-units-per-pack');
      if (unitsPerPackInput) unitsPerPackInput.value = '1';
      const packLabelInput = document.getElementById('product-form-pack-label');
      if (packLabelInput) packLabelInput.value = '';
      const packPriceInput = document.getElementById('product-form-pack-price');
      if (packPriceInput) packPriceInput.value = '';
      const packDefaultCheck = document.getElementById('product-form-pack-default');
      if (packDefaultCheck) packDefaultCheck.checked = false;
      deleteBtn.classList.add('hidden');
    }

    // Dynamically populate all available categories
    const catSelect = document.getElementById('product-form-category');
    if (catSelect && window.FlexiDB && window.FlexiDB.getAllCategories) {
      window.FlexiDB.getAllCategories().then(cats => {
        if (cats && cats.length > 0) {
          const targetCat = productToEdit ? productToEdit.category : catSelect.value;
          catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.name)}">${c.icon ? c.icon + ' ' : ''}${escapeHtml(c.name)}</option>`).join('');
          if (targetCat) {
            if (!cats.some(c => c.name === targetCat)) {
              const opt = document.createElement('option');
              opt.value = targetCat;
              opt.textContent = targetCat;
              catSelect.appendChild(opt);
            }
            catSelect.value = targetCat;
          }
        }
      }).catch(() => {});
    }

    modal.classList.remove('hidden');
  };

  window.editProduct = async (productId) => {
    let product = productMap.get(productId) || productMap.get(Number(productId)) || productMap.get(String(productId)) || posProducts.find(p => p.id === productId || String(p.id) === String(productId));
    if (!product && window.FlexiDB && window.FlexiDB.db) {
      try {
        product = await window.FlexiDB.db.products.get(Number(productId)) || await window.FlexiDB.db.products.get(String(productId)) || await window.FlexiDB.db.products.get(productId);
      } catch (e) {}
    }
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
    const unitsPerPack = parseInt(document.getElementById('product-form-units-per-pack')?.value, 10) || 1;
    const packUnitLabel = document.getElementById('product-form-pack-label')?.value.trim() || 'pack';
    const packPriceVal = document.getElementById('product-form-pack-price')?.value;
    const packPrice = packPriceVal ? parseFloat(packPriceVal) : null;
    const sellByPackDefault = document.getElementById('product-form-pack-default')?.checked || false;

    if (!name || sellingPrice <= 0) {
      showToast('Please provide a valid product name and selling price', 'error');
      return;
    }

    try {
      if (idStr) {
        const numericId = Number(idStr);
        const id = isNaN(numericId) ? idStr : numericId;
        const existing = await db.products.get(id);
        const prevStock = existing ? existing.currentStock : currentStock;

        await db.products.update(id, {
          name, category, sellingPrice, costPrice, currentStock, lowStockThreshold, icon, image, barcode,
          unitsPerPack, packUnitLabel, packPrice, sellByPackDefault,
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
          unitsPerPack, packUnitLabel, packPrice, sellByPackDefault,
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
      if (typeof window.renderInventoryWorkspace === 'function') {
        window.renderInventoryWorkspace();
      }
      document.getElementById('pos-product-modal')?.classList.add('hidden');
    } catch (err) {
      showToast('Database Error: ' + err.message, 'error');
    }
  });

  document.getElementById('delete-product-btn')?.addEventListener('click', async () => {
    const idStr = document.getElementById('product-form-id').value;
    if (!idStr || !window.FlexiDB?.db) return;
    if (confirm('Are you sure you want to remove this product from inventory?')) {
      const numericId = Number(idStr);
      const id = isNaN(numericId) ? idStr : numericId;
      await window.FlexiDB.db.products.delete(id);
      showToast('Product removed from inventory');
      await loadPosProducts();
      if (typeof window.renderInventoryWorkspace === 'function') {
        window.renderInventoryWorkspace();
      }
      document.getElementById('pos-product-modal')?.classList.add('hidden');
    }
  });

  // --- Cart Hold / Park & Resume ---
  let posParkedCarts = JSON.parse(localStorage.getItem('pos_parked_carts') || '[]');

  function updateParkedCartsUI() {
    const bar = document.getElementById('pos-parked-carts-bar');
    const countEl = document.getElementById('pos-parked-carts-count');
    if (bar && countEl) {
      if (posParkedCarts.length > 0) {
        bar.classList.remove('hidden');
        countEl.innerText = posParkedCarts.length;
      } else {
        bar.classList.add('hidden');
      }
    }
  }

  window.parkCurrentPosCart = () => {
    if (posCart.length === 0) {
      showToast('Le panier actuel est vide !', 'error');
      return;
    }
    posParkedCarts.push({
      cart: [...posCart],
      discountPercent: posDiscountPercent,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('pos_parked_carts', JSON.stringify(posParkedCarts));

    posCart = [];
    posDiscountPercent = 0;
    const discInput = document.getElementById('pos-discount-input');
    if (discInput) discInput.value = 0;

    renderPosCart();
    updateParkedCartsUI();
    showToast('Panier mis en attente ⏸️. Vous pouvez servir le client suivant.');
  };

  window.resumeLastParkedCart = () => {
    if (posParkedCarts.length === 0) return;
    if (posCart.length > 0) {
      if (!confirm('Le panier actuel contient des articles. Voulez-vous mettre le panier actuel en attente et reprendre le précédent ?')) {
        return;
      }
      posParkedCarts.push({
        cart: [...posCart],
        discountPercent: posDiscountPercent,
        timestamp: new Date().toISOString()
      });
    }

    const last = posParkedCarts.pop();
    localStorage.setItem('pos_parked_carts', JSON.stringify(posParkedCarts));

    posCart = last.cart || [];
    posDiscountPercent = last.discountPercent || 0;
    const discInput = document.getElementById('pos-discount-input');
    if (discInput) discInput.value = posDiscountPercent;

    renderPosCart();
    updateParkedCartsUI();
    showToast('Panier repris avec succès ↩');
  };

  // --- Cart Operations ---
  window.addToPosCart = async (productId, requestedUnit = null) => {
    let product = productMap.get(productId) || productMap.get(Number(productId)) || productMap.get(String(productId)) || posProducts.find(p => String(p.id) === String(productId));
    if (!product && window.FlexiDB && window.FlexiDB.db) {
      try {
        product = await window.FlexiDB.db.products.get(Number(productId)) || await window.FlexiDB.db.products.get(String(productId)) || await window.FlexiDB.db.products.get(productId);
        if (product) {
          productMap.set(product.id, product);
          productMap.set(String(product.id), product);
        }
      } catch (e) {}
    }
    if (!product) return;

    const currentStock = Number(product.currentStock != null ? product.currentStock : (product.stock != null ? product.stock : 0));
    if (currentStock <= 0) {
      showToast(`"${product.name}" is out of stock!`, 'error');
      return;
    }

    const saleUnit = requestedUnit || ((product.sellByPackDefault && product.unitsPerPack > 1) ? 'pack' : 'unit');
    const hasPack = product.unitsPerPack && Number(product.unitsPerPack) > 1;
    const unitMultiplier = (saleUnit === 'pack' && hasPack) ? Number(product.unitsPerPack) : 1;
    const baseSellingPrice = Number(product.sellingPrice || product.price || 0);
    const linePrice = (saleUnit === 'pack' && hasPack)
      ? Number(product.packPrice || (baseSellingPrice * unitMultiplier))
      : baseSellingPrice;
    const lineCost = Number(product.costPrice || 0) * unitMultiplier;

    // Check total base units currently in cart for this product
    const totalUnitsInCart = posCart
      .filter(item => String(item.id) === String(productId))
      .reduce((sum, item) => sum + (item.qty * (item.unitMultiplier || 1)), 0);

    if (totalUnitsInCart + unitMultiplier > currentStock) {
      showToast(`Quantité max atteinte (${currentStock} unités au total en stock).`, 'error');
      return;
    }

    const existing = posCart.find(item => String(item.id) === String(productId) && (item.saleUnit || 'unit') === saleUnit);
    if (existing) {
      existing.qty += 1;
    } else {
      posCart.push({
        id: product.id,
        name: product.name,
        price: linePrice,
        cost: lineCost,
        stock: currentStock,
        qty: 1,
        saleUnit: saleUnit,
        unitsPerPack: product.unitsPerPack || 1,
        unitMultiplier: unitMultiplier,
        packUnitLabel: product.packUnitLabel || 'pack',
        packPrice: product.packPrice || null
      });
    }

    lastScannedItemId = product.id;
    renderPosCart();
    playScannerBeep();
  };

  window.changeCartQty = (productId, delta, saleUnit = 'unit') => {
    const item = posCart.find(i => String(i.id) === String(productId) && (i.saleUnit || 'unit') === saleUnit);
    if (!item) return;

    const product = productMap.get(productId) || productMap.get(Number(productId)) || productMap.get(String(productId)) || posProducts.find(p => String(p.id) === String(productId));
    const maxStock = product ? Number(product.currentStock != null ? product.currentStock : product.stock) : (item.stock != null ? item.stock : 99);
    const multiplier = item.unitMultiplier || 1;

    if (delta > 0) {
      const totalUnitsInCart = posCart
        .filter(i => String(i.id) === String(productId))
        .reduce((sum, i) => sum + (i.qty * (i.unitMultiplier || 1)), 0);

      if (totalUnitsInCart + (delta * multiplier) > maxStock) {
        showToast(`Stock disponible dépassé (${maxStock} unités max).`, 'error');
        return;
      }
    }

    item.qty += delta;
    lastScannedItemId = productId;
    if (item.qty <= 0) {
      posCart = posCart.filter(i => !(String(i.id) === String(productId) && (i.saleUnit || 'unit') === saleUnit));
    }
    renderPosCart();
  };

  window.removeFromPosCart = (productId, saleUnit = 'unit') => {
    posCart = posCart.filter(i => !(String(i.id) === String(productId) && (i.saleUnit || 'unit') === saleUnit));
    renderPosCart();
  };

  window.toggleCartItemUnit = (productId, currentUnit) => {
    const itemIndex = posCart.findIndex(i => String(i.id) === String(productId) && (i.saleUnit || 'unit') === currentUnit);
    if (itemIndex === -1) return;

    const item = posCart[itemIndex];
    const product = productMap.get(productId) || productMap.get(Number(productId)) || productMap.get(String(productId)) || posProducts.find(p => String(p.id) === String(productId));
    if (!product || !product.unitsPerPack || product.unitsPerPack <= 1) return;

    const newUnit = (currentUnit === 'pack') ? 'unit' : 'pack';
    const newMultiplier = (newUnit === 'pack') ? Number(product.unitsPerPack) : 1;
    const baseSellingPrice = Number(product.sellingPrice || product.price || 0);
    const newPrice = (newUnit === 'pack')
      ? Number(product.packPrice || (baseSellingPrice * newMultiplier))
      : baseSellingPrice;
    const newCost = Number(product.costPrice || 0) * newMultiplier;
    const maxStock = Number(product.currentStock != null ? product.currentStock : 99);

    // Compute total units in cart for this product if we toggle this item
    const otherUnitsInCart = posCart
      .filter((_, idx) => idx !== itemIndex && String(posCart[idx].id) === String(productId))
      .reduce((sum, i) => sum + (i.qty * (i.unitMultiplier || 1)), 0);

    if (otherUnitsInCart + (item.qty * newMultiplier) > maxStock) {
      showToast(`Stock insuffisant pour basculer en ${newUnit} (${maxStock} unités max).`, 'error');
      return;
    }

    // Check if an item with newUnit already exists in cart -> merge
    const existingSameUnit = posCart.find((i, idx) => idx !== itemIndex && String(i.id) === String(productId) && (i.saleUnit || 'unit') === newUnit);
    if (existingSameUnit) {
      existingSameUnit.qty += item.qty;
      posCart.splice(itemIndex, 1);
    } else {
      item.saleUnit = newUnit;
      item.unitMultiplier = newMultiplier;
      item.price = newPrice;
      item.cost = newCost;
    }

    renderPosCart();
  };

  let posCartElements = null;
  function getPosCartElements() {
    if (!posCartElements || !posCartElements.container) {
      posCartElements = {
        container: document.getElementById('pos-cart-items'),
        countDisp: document.getElementById('pos-cart-count'),
        subtotalDisp: document.getElementById('pos-subtotal'),
        discountDisp: document.getElementById('pos-discount-val'),
        totalDisp: document.getElementById('pos-total')
      };
    }
    return posCartElements;
  }

  let lastScannedItemId = null;

  function calculateSmartTenders(total) {
    if (total <= 0) return [];
    const tenders = [];
    tenders.push({ label: 'Exact', value: total, isExact: true });

    const round100 = Math.ceil(total / 100) * 100;
    if (round100 > total) {
      tenders.push({ label: `${round100.toLocaleString('fr-DZ')} DA`, value: round100 });
    }

    const round500 = Math.ceil(total / 500) * 500;
    if (round500 > total && !tenders.some(t => t.value === round500)) {
      tenders.push({ label: `${round500.toLocaleString('fr-DZ')} DA`, value: round500 });
    }

    [1000, 2000, 5000].forEach(denom => {
      if (denom > total && !tenders.some(t => t.value === denom) && tenders.length < 4) {
        tenders.push({ label: `${denom.toLocaleString('fr-DZ')} DA`, value: denom });
      }
    });

    return tenders.slice(0, 4);
  }

  function renderPosCart() {
    const { container, countDisp, subtotalDisp, discountDisp, totalDisp } = getPosCartElements();
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
    if (totalDisp) {
      totalDisp.innerText = `${grandTotal.toFixed(2)} DA`;
      totalDisp.classList.remove('pos-total-updated');
      void totalDisp.offsetWidth; // Trigger reflow for animation restart
      totalDisp.classList.add('pos-total-updated');
    }

    // Dynamic Smart Tender Chips Calculation (Sub-3-Action Checkout)
    const smartTenderContainer = document.getElementById('pos-smart-tender-chips');
    const smartTenderSection = document.getElementById('pos-smart-tender-section');
    if (smartTenderContainer && smartTenderSection) {
      if (posCart.length === 0 || grandTotal <= 0) {
        smartTenderSection.classList.add('hidden');
      } else {
        smartTenderSection.classList.remove('hidden');
        const tenders = calculateSmartTenders(grandTotal);
        smartTenderContainer.innerHTML = tenders.map((t, idx) => `
          <button onclick="window.completePosCashCheckout ? window.completePosCashCheckout(${t.value}) : null" class="smart-tender-chip p-2 rounded-xl ${t.isExact ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700/80'} font-mono font-black text-xs text-center truncate tabular-nums" title="Encaisser ${t.label}">
            ${t.isExact ? '✓ Exact' : t.label}
          </button>
        `).join('');
      }
    }

    if (posCart.length === 0) {
      container.innerHTML = `
        <div class="reg-empty-state">
          <span class="text-4xl mb-2">🏷️</span>
          <span class="text-base font-bold text-slate-200">Prêt à scanner</span>
          <span class="text-xs text-slate-400 max-w-xs">Passez les articles devant le lecteur code-barres pour les ajouter directement au ticket.</span>
        </div>`;
      return;
    }

    container.innerHTML = posCart.map(item => {
      const safeId = escapeHtml(String(item.id));
      const itemUnit = escapeHtml(item.saleUnit || 'unit');
      const isJustAdded = String(item.id) === String(lastScannedItemId);
      const lineTotal = (item.price * item.qty).toFixed(2);
      const isPack = item.saleUnit === 'pack';
      const hasPackOption = item.unitsPerPack && item.unitsPerPack > 1;

      return `
      <div class="reg-cart-row ${isJustAdded ? 'pos-scan-highlight' : ''}">
        <!-- Col 1: Article Name & Pack toggle -->
        <div class="flex flex-col min-w-0 pr-1">
          <span class="font-bold text-slate-100 text-xs truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          ${hasPackOption ? `
            <button onclick="window.toggleCartItemUnit('${safeId}', '${itemUnit}')" class="reg-pack-toggle-btn ${isPack ? 'reg-pack-active' : ''}" title="Cliquer pour basculer Unité / Pack">
              ${isPack ? `📦 ${escapeHtml(item.packUnitLabel || 'Pack')} (×${item.unitsPerPack})` : '🏷️ Unité'} ⇄
            </button>
          ` : ''}
        </div>

        <!-- Col 2: Qté Stepper -->
        <div class="flex items-center justify-center">
          <div class="reg-qty-stepper">
            <button onclick="changeCartQty('${safeId}', -1, '${itemUnit}')" class="reg-qty-btn" title="Diminuer">-</button>
            <span class="reg-qty-val font-mono">${item.qty}</span>
            <button onclick="changeCartQty('${safeId}', 1, '${itemUnit}')" class="reg-qty-btn" title="Augmenter">+</button>
          </div>
        </div>

        <!-- Col 3: Prix Unit. -->
        <div class="text-right font-mono text-slate-300 text-xs font-semibold tabular-nums">
          ${item.price.toFixed(2)} DA
        </div>

        <!-- Col 4: Total & Delete -->
        <div class="flex items-center justify-end gap-1.5 min-w-0">
          <span class="font-mono text-emerald-400 font-black text-xs tabular-nums">${lineTotal} DA</span>
          <button onclick="removeFromPosCart('${safeId}', '${itemUnit}')" class="reg-row-del-btn" title="Supprimer cet article du panier">✕</button>
        </div>
      </div>
    `;
    }).join('');
  }

  // Parameter: Allow / Deny Invoice Auto-Printing after Checkout
  let allowReceiptAutoPrint = localStorage.getItem('pos_auto_print_receipt') !== 'false';

  // Web Audio Cash Register Chime
  function playRegisterChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Note 1: E5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Note 2: B5 (higher chime)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.setValueAtTime(987.77, now + 0.08);
      gain2.gain.setValueAtTime(0.18, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.35);
    } catch (e) {}
  }

  // Change Due HUD State
  let changeHudTimer = null;
  function showChangeDueHUD({ orderRef, totalAmount, tendered, changeDue }) {
    const modal = document.getElementById('pos-change-hud');
    if (!modal) return;

    if (changeHudTimer) clearTimeout(changeHudTimer);

    const refEl = document.getElementById('pos-change-hud-order-ref');
    const totEl = document.getElementById('pos-change-hud-total');
    const tenEl = document.getElementById('pos-change-hud-tendered');
    const chgEl = document.getElementById('pos-change-hud-change');

    if (refEl) refEl.innerText = `Commande #${orderRef}`;
    if (totEl) totEl.innerText = `${Number(totalAmount).toFixed(2)} DA`;
    if (tenEl) tenEl.innerText = `${Number(tendered).toFixed(2)} DA`;
    if (chgEl) chgEl.innerText = `${Number(changeDue).toFixed(2)} DA`;

    const progress = document.getElementById('pos-change-hud-progress');
    if (progress) {
      progress.style.transition = 'none';
      progress.style.width = '100%';
      void progress.offsetWidth; // force reflow
      progress.style.transition = 'width 3500ms linear';
      progress.style.width = '0%';
    }

    modal.classList.remove('hidden');

    changeHudTimer = setTimeout(() => {
      dismissChangeDueHUD();
    }, 3500);
  }

  function dismissChangeDueHUD() {
    if (changeHudTimer) {
      clearTimeout(changeHudTimer);
      changeHudTimer = null;
    }
    document.getElementById('pos-change-hud')?.classList.add('hidden');
    document.getElementById('pos-search-input')?.focus();
  }
  window.dismissChangeDueHUD = dismissChangeDueHUD;

  // --- Complete Checkout via CheckoutService (Sub-3-Action Fast Flow) ---
  async function completePosCashCheckout(tenderedAmount = null) {
    if (posCart.length === 0) {
      showToast('Votre panier est vide !', 'error');
      return;
    }

    let subtotal = 0;
    for (let i = 0; i < posCart.length; i++) {
      subtotal += posCart[i].price * posCart[i].qty;
    }
    const discountAmount = subtotal * (posDiscountPercent / 100);
    const grandTotal = Math.max(0, subtotal - discountAmount);

    const actualTendered = (tenderedAmount != null && tenderedAmount !== 'exact')
      ? Number(tenderedAmount)
      : grandTotal;

    if (actualTendered < grandTotal - 0.001) {
      showToast(`Montant insuffisant (${actualTendered.toFixed(2)} DA < ${grandTotal.toFixed(2)} DA)`, 'error');
      return;
    }

    const changeDue = Math.max(0, actualTendered - grandTotal);

    try {
      const result = await window.CheckoutService.processCheckout({
        items: posCart,
        discountPercent: posDiscountPercent,
        paymentMethod: 'cash'
      });

      result.amountPaidNow = actualTendered;
      result.changeDue = changeDue;

      // Handle Allow / Deny Invoice Auto-Printing Parameter
      if (allowReceiptAutoPrint) {
        const receiptHtml = generateThermalReceipt(result);
        const printArea = document.getElementById('print-area');
        if (printArea) {
          printArea.innerHTML = receiptHtml;
          setTimeout(() => {
            window.print();
          }, 300);
        }
      }

      playRegisterChime();

      // Show Change Due HUD Display with instant visual feedback
      showChangeDueHUD({
        orderRef: result.orderRef,
        totalAmount: grandTotal,
        tendered: actualTendered,
        changeDue: changeDue
      });

      // Reset cart state
      posCart = [];
      posDiscountPercent = 0;
      lastScannedItemId = null;
      const discInput = document.getElementById('pos-discount-input');
      if (discInput) discInput.value = 0;

      renderPosCart();
      await loadPosProducts();
      await renderPosSalesHistory();

    } catch (err) {
      console.error('Checkout failed:', err);
      showToast('Échec de l\'encaissement : ' + err.message, 'error');
    }
  }
  window.completePosCashCheckout = completePosCashCheckout;

  async function completePosCheckout() {
    return await completePosCashCheckout(null);
  }

  // Hardware Peripheral: Cash Drawer Kick (ESC/POS Pulse)
  async function kickPosCashDrawer() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      }
    } catch (e) {}
    showToast('⚡ Tiroir-caisse déclenché (Signal ESC/POS émis)', 'info');
  }
  window.kickPosCashDrawer = kickPosCashDrawer;

  // --- Thermal ESC/POS Receipt Formatter (Standard 80mm / 58mm) ---
  function generateThermalReceipt(sale) {
    const d = new Date(sale.timestamp);
    const items = sale.items || [];
    return `
      <div style="font-family: 'Courier New', Courier, monospace; width: 72mm; max-width: 100%; padding: 4mm; margin: 0 auto; background: #fff; color: #000; font-size: 11px; line-height: 1.3;">
        <div style="text-align: center; margin-bottom: 8px;">
          <h2 style="font-size: 16px; margin: 0; font-weight: bold; letter-spacing: 1px;">MILLORA STORE POS</h2>
          <p style="margin: 2px 0; font-size: 10px;">Système de Vente & Caisse</p>
          <div style="border-bottom: 1px dashed #000; margin-top: 6px;"></div>
        </div>

        <div style="font-size: 10px; margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Ticket: <strong>${escapeHtml(sale.orderRef)}</strong></span>
            <span>ID: #${sale.saleId || sale.id || ''}</span>
          </div>
          <div>Date: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div>Paiement: <strong>${sale.paymentMethod === 'credit' ? 'À CRÉDIT (DETTE CLIENT)' : 'ESPÈCES (CASH)'}</strong></div>
          ${sale.customerName ? `<div>Client: <strong>${escapeHtml(sale.customerName)}</strong>${sale.customerPhone ? ' (' + escapeHtml(sale.customerPhone) + ')' : ''}</div>` : ''}
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
            ${items.map(item => `
              <tr>
                <td style="padding: 2px 0; max-width: 38mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name || item.productName || 'Article')}</td>
                <td style="text-align: center;">${item.qty || item.quantity || 1}</td>
                <td style="text-align: right; font-weight: bold;">${Number(item.total || item.lineTotal || ((item.price || item.unitSellingPrice || 0) * (item.qty || item.quantity || 1))).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Sous-total:</span>
            <span>${Number(sale.subtotal || sale.totalAmount).toFixed(2)} DA</span>
          </div>
          ${sale.discountAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #444;">
              <span>Remise (${sale.discountPercent || 0}%):</span>
              <span>-${Number(sale.discountAmount).toFixed(2)} DA</span>
            </div>
          ` : ''}
          ${sale.paymentMethod === 'credit' ? `
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
              <span>Total Commande:</span>
              <span>${Number(sale.totalAmount).toFixed(2)} DA</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #166534;">
              <span>Acompte Versé (Cash):</span>
              <span>${Number(sale.amountPaidNow || 0).toFixed(2)} DA</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; color: #991b1b;">
              <span>RESTE À PAYER (DETTE):</span>
              <span>${Number(sale.remainingAmount != null ? sale.remainingAmount : (sale.totalAmount - (sale.amountPaidNow || 0))).toFixed(2)} DA</span>
            </div>
          ` : `
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px;">
              <span>TOTAL PAYÉ (CASH):</span>
              <span>${Number(sale.totalAmount).toFixed(2)} DA</span>
            </div>
          `}
        </div>

        <div style="text-align: center; margin-top: 12px; border-top: 1px dashed #000; padding-top: 6px; font-size: 9px;">
          <p style="margin: 2px 0; font-weight: bold;">MERCI POUR VOTRE VISITE !</p>
          <p style="margin: 2px 0;">Millora POS 100% Hors-Ligne</p>
        </div>
      </div>
    `;
  }

  // ── CATEGORY MANAGEMENT & DYNAMIC SYNC ─────────────────────────────────────
  async function syncCategoriesUI() {
    try {
      if (!window.FlexiDB) return;
      const categories = await window.FlexiDB.getAllCategories();

      // 1. Render POS Category Pills
      const pillContainer = document.getElementById('pos-category-filters');
      if (pillContainer) {
        let pillsHtml = `
          <button data-category="all" class="pos-cat-btn ${posActiveCategory === 'all' ? 'active bg-indigo-600 text-white shadow-sm font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'} px-3.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shrink-0">
            All Items
          </button>
        `;
        categories.forEach(cat => {
          const isActive = posActiveCategory === cat.name;
          pillsHtml += `
            <button data-category="${escapeHtml(cat.name)}" class="pos-cat-btn ${isActive ? 'active bg-indigo-600 text-white shadow-sm font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'} px-3.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5 shrink-0">
              <span>${escapeHtml(cat.icon || '🏷️')}</span>
              <span>${escapeHtml(cat.name)}</span>
            </button>
          `;
        });
        pillContainer.innerHTML = pillsHtml;
      }

      // 2. Render Product Modal Category Select Options
      const prodFormCat = document.getElementById('product-form-category');
      if (prodFormCat) {
        const curVal = prodFormCat.value;
        prodFormCat.innerHTML = categories.map(cat => `
          <option value="${escapeHtml(cat.name)}">${escapeHtml(cat.icon || '🏷️')} ${escapeHtml(cat.name)}</option>
        `).join('');
        if (curVal && categories.some(c => c.name === curVal)) {
          prodFormCat.value = curVal;
        }
      }

      // 3. Render Inventory Category Filter Options
      const invCatFilter = document.getElementById('inventory-category-filter');
      if (invCatFilter) {
        const curVal = invCatFilter.value;
        invCatFilter.innerHTML = `
          <option value="all">All Categories</option>
          ${categories.map(cat => `
            <option value="${escapeHtml(cat.name)}">${escapeHtml(cat.icon || '🏷️')} ${escapeHtml(cat.name)}</option>
          `).join('')}
        `;
        if (curVal) invCatFilter.value = curVal;
      }
    } catch (err) {
      console.warn('syncCategoriesUI error:', err);
    }
  }
  window.syncCategoriesUI = syncCategoriesUI;

  window.openCategoryManagerModal = async () => {
    const modal = document.getElementById('pos-category-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    await renderCategoryManagerList();
    document.getElementById('cat-mgr-name-input')?.focus();
  };

  window.closeCategoryManagerModal = () => {
    document.getElementById('pos-category-modal')?.classList.add('hidden');
  };

  async function renderCategoryManagerList() {
    const list = document.getElementById('cat-mgr-list');
    if (!list || !window.FlexiDB) return;
    try {
      const categories = await window.FlexiDB.getAllCategories();
      const db = window.FlexiDB.db;

      const counts = await Promise.all(
        categories.map(async (c) => {
          try {
            if (db && db.isOpen() && db.products) {
              return await db.products.where('category').equals(c.name).count();
            }
          } catch (e) {}
          return posProducts.filter(p => p.category === c.name).length;
        })
      );

      list.innerHTML = categories.map((cat, idx) => {
        const count = counts[idx] || 0;
        const catId = cat.id != null ? cat.id : '';
        const catName = cat.name || '';
        const catIcon = cat.icon || '🏷️';
        return `
          <div class="p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-xs" data-cat-id="${escapeHtml(String(catId))}">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-xl shrink-0">${escapeHtml(catIcon)}</span>
              <div class="flex flex-col min-w-0">
                <span class="font-bold text-slate-800 dark:text-slate-100 truncate text-sm">${escapeHtml(catName)}</span>
                <span class="text-[10px] text-slate-400 font-mono">${count} article(s) associé(s)</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button onclick="handleEditCategory('${escapeHtml(String(catId))}', '${escapeHtml(catName.replace(/'/g, "\\'"))}', '${escapeHtml(catIcon.replace(/'/g, "\\'"))}')" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Renommer">
                ✏️
              </button>
              <button onclick="handleDeleteCategory('${escapeHtml(String(catId))}', '${escapeHtml(catName.replace(/'/g, "\\'"))}', ${count})" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition" title="Supprimer">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('renderCategoryManagerList error:', e);
    }
  }

  window.handleCreateCategory = async () => {
    const nameInput = document.getElementById('cat-mgr-name-input');
    const iconInput = document.getElementById('cat-mgr-icon-input');
    const name = (nameInput?.value || '').trim();
    const icon = (iconInput?.value || '').trim() || '🏷️';

    if (!name) {
      showToast('Veuillez saisir un nom de catégorie', 'error');
      return;
    }

    try {
      await window.FlexiDB.addCategory(name, icon);
      nameInput.value = '';
      showToast(`Catégorie "${name}" créée avec succès !`);
      await renderCategoryManagerList();
      await syncCategoriesUI();
      await loadPosProducts();
      if (typeof window.renderInventoryWorkspace === 'function') {
        window.renderInventoryWorkspace();
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  window.handleEditCategory = async (id, oldName, currentIcon) => {
    const newName = prompt(`Modifier le nom de la catégorie "${oldName}" :`, oldName);
    if (!newName || newName.trim() === '') return;
    const newIcon = prompt(`Emoji / Icône pour "${newName.trim()}" :`, currentIcon || '🏷️') || (currentIcon || '🏷️');

    try {
      await window.FlexiDB.updateCategory(id, newName.trim(), newIcon.trim());
      showToast(`Catégorie mise à jour : ${newName.trim()}`);
      await renderCategoryManagerList();
      await syncCategoriesUI();
      await loadPosProducts();
      if (typeof window.renderInventoryWorkspace === 'function') {
        window.renderInventoryWorkspace();
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  window.handleDeleteCategory = async (id, name, productCount) => {
    const msg = productCount > 0
      ? `Attention : ${productCount} produit(s) sont classés dans "${name}".\nSi vous supprimez cette catégorie, ils seront automatiquement reclassés dans "General".\nConfirmer la suppression ?`
      : `Confirmer la suppression de la catégorie "${name}" ?`;

    if (!confirm(msg)) return;

    try {
      await window.FlexiDB.deleteCategory(id);
      showToast(`Catégorie "${name}" supprimée.`);
      await renderCategoryManagerList();
      await syncCategoriesUI();
      await loadPosProducts();
      if (typeof window.renderInventoryWorkspace === 'function') {
        window.renderInventoryWorkspace();
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // --- Credit Checkout Flow (Enhanced Customer Autocomplete, Debt Limit & Sleep Mode) ---
  let posCreditLoadedCustomers = [];
  let posCreditMatchedCustomer = null;

  async function openPosCreditModal() {
    if (posCart.length === 0) {
      showToast('Votre panier est vide !', 'error');
      return;
    }

    let subtotal = 0;
    for (const item of posCart) {
      subtotal += (item.price || 0) * (item.qty || 1);
    }
    const discountAmount = subtotal * (posDiscountPercent / 100);
    const totalAmount = Math.max(0, subtotal - discountAmount);

    const modal = document.getElementById('pos-credit-modal');
    if (!modal) return;

    const nameInput = document.getElementById('pos-credit-customer-name');
    const phoneInput = document.getElementById('pos-credit-customer-phone');
    const totalDisp = document.getElementById('pos-credit-total-display');
    const paidInput = document.getElementById('pos-credit-paid-now');
    const remainingDisp = document.getElementById('pos-credit-remaining-display');
    const noteInput = document.getElementById('pos-credit-note');
    const statusCard = document.getElementById('pos-credit-customer-status-card');
    const newLimitCont = document.getElementById('pos-credit-new-limit-container');
    const newLimitInput = document.getElementById('pos-credit-new-limit');
    const confirmBtn = document.getElementById('pos-confirm-credit-btn');

    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (noteInput) noteInput.value = '';
    if (newLimitInput) newLimitInput.value = '0';
    if (totalDisp) totalDisp.innerText = totalAmount.toFixed(2) + ' DA';
    if (paidInput) {
      paidInput.value = '0';
      paidInput.max = totalAmount;
    }
    if (remainingDisp) remainingDisp.innerText = totalAmount.toFixed(2) + ' DA';
    if (statusCard) statusCard.classList.add('hidden');
    if (newLimitCont) newLimitCont.classList.add('hidden');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    posCreditMatchedCustomer = null;

    try {
      posCreditLoadedCustomers = await window.DebtService?.getAllCustomers() || [];
      const datalist = document.getElementById('pos-credit-customers-list');
      if (datalist && posCreditLoadedCustomers) {
        datalist.innerHTML = posCreditLoadedCustomers.map(c =>
          `<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone || '')}${c.isSleeping ? ' [⚠️ EN VEILLE - Plafond]' : ''}</option>`
        ).join('');
      }
    } catch (e) {}

    const evaluateCustomerStatus = () => {
      const typed = (nameInput?.value || '').trim().toLowerCase();
      const paid = Math.max(0, parseFloat(paidInput?.value) || 0);
      const remainingForThisSale = Math.max(0, totalAmount - paid);
      if (remainingDisp) remainingDisp.innerText = remainingForThisSale.toFixed(2) + ' DA';

      if (!typed) {
        posCreditMatchedCustomer = null;
        statusCard?.classList.add('hidden');
        newLimitCont?.classList.add('hidden');
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        return;
      }

      const match = posCreditLoadedCustomers.find(c =>
        c.name.toLowerCase() === typed || (c.phone && c.phone.toLowerCase() === typed)
      );

      if (match) {
        posCreditMatchedCustomer = match;
        if (phoneInput && !phoneInput.value) phoneInput.value = match.phone || '';
        statusCard?.classList.remove('hidden');
        newLimitCont?.classList.add('hidden');

        document.getElementById('pos-credit-card-cust-name').innerText = match.name;
        document.getElementById('pos-credit-card-owed').innerText = `${match.totalRemaining.toFixed(2)} DA`;
        const limitStr = match.debtLimit > 0 ? `${match.debtLimit.toFixed(2)} DA` : 'Illimité';
        document.getElementById('pos-credit-card-limit').innerText = limitStr;

        const badge = document.getElementById('pos-credit-card-badge');
        const sleepWarn = document.getElementById('pos-credit-card-sleep-warning');

        // Check if customer is already sleeping or if this transaction will exceed limit
        const projectedRemaining = match.totalRemaining + remainingForThisSale;
        const willExceed = match.debtLimit > 0 && projectedRemaining > match.debtLimit;

        if (match.isSleeping || willExceed) {
          if (badge) {
            badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse';
            badge.innerText = '😴 EN VEILLE';
          }
          if (sleepWarn) {
            sleepWarn.classList.remove('hidden');
            sleepWarn.innerHTML = `<span>😴</span> <span>Client en Mode Veille ! Dette actuelle (${match.totalRemaining.toFixed(0)} DA) + vente (${remainingForThisSale.toFixed(0)} DA) dépasse le plafond (${match.debtLimit.toFixed(0)} DA). Aucun nouveau crédit autorisé.</span>`;
          }
          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
          }
        } else {
          if (badge) {
            badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300';
            badge.innerText = '🟢 Actif';
          }
          if (sleepWarn) sleepWarn.classList.add('hidden');
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        }
      } else {
        // New Customer
        posCreditMatchedCustomer = null;
        statusCard?.classList.add('hidden');
        newLimitCont?.classList.remove('hidden');
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }
    };

    if (nameInput) nameInput.oninput = evaluateCustomerStatus;
    if (paidInput) paidInput.oninput = evaluateCustomerStatus;

    modal.classList.remove('hidden');
    nameInput?.focus();
  }

  async function completePosCreditCheckout() {
    if (posCart.length === 0) {
      showToast('Votre panier est vide !', 'error');
      return;
    }

    const name = (document.getElementById('pos-credit-customer-name')?.value || '').trim();
    const phone = (document.getElementById('pos-credit-customer-phone')?.value || '').trim();
    const paidNow = Math.max(0, parseFloat(document.getElementById('pos-credit-paid-now')?.value) || 0);
    const newLimit = parseFloat(document.getElementById('pos-credit-new-limit')?.value) || 0;
    const note = (document.getElementById('pos-credit-note')?.value || '').trim();

    if (!name) {
      showToast('Le nom du client est obligatoire pour une vente à crédit !', 'error');
      return;
    }

    try {
      // 1. Find or create customer (with debt limit if new)
      const { customer } = await window.DebtService.findOrCreateCustomer(name, phone, newLimit);

      // Pre-check customer status
      if (customer.debtLimit > 0) {
        const debts = await window.FlexiDB.db.debts.where('customerId').equals(customer.id).filter(d => d.status === 'open').toArray();
        const curRemaining = debts.reduce((s, d) => s + (Number(d.remainingAmount) || 0), 0);
        let subtotal = 0;
        for (const item of posCart) subtotal += (item.price || 0) * (item.qty || 1);
        const netSale = Math.max(0, subtotal * (1 - posDiscountPercent / 100)) - paidNow;
        if (curRemaining + netSale > customer.debtLimit + 0.001) {
          showToast(`⚠️ Crédit refusé : Le client est en Mode Veille ou dépassera son plafond (${customer.debtLimit} DA) !`, 'error');
          return;
        }
      }

      // 2. Process standard checkout in Dexie with paymentMethod = 'credit'
      const result = await window.CheckoutService.processCheckout({
        items: posCart,
        discountPercent: posDiscountPercent,
        paymentMethod: 'credit'
      });

      // 3. Record debt linked to this sale
      const debt = await window.DebtService.recordDebt({
        customerId: customer.id,
        saleId: result.saleId,
        orderRef: result.orderRef,
        amount: result.totalAmount,
        amountPaidNow: paidNow,
        discountPercent: posDiscountPercent,
        note: note || `Vente POS #${result.orderRef}`
      });

      // 4. Close credit modal
      document.getElementById('pos-credit-modal')?.classList.add('hidden');

      // 5. Handle receipt printing with credit details
      result.customerName = customer.name;
      result.customerPhone = customer.phone;
      result.amountPaidNow = paidNow;
      result.remainingAmount = debt.remainingAmount;

      if (allowReceiptAutoPrint) {
        const receiptHtml = generateThermalReceipt(result);
        const printArea = document.getElementById('print-area');
        if (printArea) {
          printArea.innerHTML = receiptHtml;
          setTimeout(() => { window.print(); }, 300);
        }
        showToast(`Vente à crédit enregistrée ! Reste dû : ${debt.remainingAmount.toFixed(2)} DA`);
      } else {
        showToast(`Vente à crédit enregistrée pour ${customer.name} (Reste : ${debt.remainingAmount.toFixed(2)} DA)`);
      }

      // 6. Reset cart state
      posCart = [];
      posDiscountPercent = 0;
      const discInput = document.getElementById('pos-discount-input');
      if (discInput) discInput.value = 0;

      renderPosCart();
      await loadPosProducts();
      await renderPosSalesHistory();
      if (window.DebtService?.refreshDebtBadge) {
        await window.DebtService.refreshDebtBadge();
      }

    } catch (err) {
      console.error('Credit checkout failed:', err);
      showToast('Échec de la vente à crédit : ' + err.message, 'error');
    }
  }

  // --- Dedicated Screen / Modal for Order Details ---
  window.openOrderDetailsModal = async function(orderRef) {
    if (!window.FlexiDB?.db) return;
    try {
      const sale = await window.FlexiDB.db.sales.where('orderRef').equals(orderRef).first();
      if (!sale) {
        showToast('Commande introuvable', 'error');
        return;
      }

      // If items array is not embedded in older sale records, query saleItems
      let items = sale.items || [];
      if (!items || items.length === 0) {
        const lineItems = await window.FlexiDB.db.saleItems.where('saleId').equals(sale.id).toArray();
        items = lineItems.map(l => ({
          name: l.productName,
          qty: l.quantity,
          price: l.unitSellingPrice,
          total: l.lineTotal
        }));
      }

      let debt = null;
      let customer = null;
      if (sale.paymentMethod === 'credit' && window.FlexiDB?.db?.debts) {
        try {
          debt = await window.FlexiDB.db.debts.where('saleId').equals(sale.id).first();
          if (debt && window.FlexiDB.db.customers) {
            customer = await window.FlexiDB.db.customers.get(debt.customerId);
          }
        } catch (e) {}
      }

      const modal = document.getElementById('pos-order-modal');
      if (!modal) return;

      const d = new Date(sale.timestamp);
      const dateStr = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      document.getElementById('order-modal-ref').innerText = sale.orderRef;
      document.getElementById('order-modal-date').innerText = dateStr;
      document.getElementById('order-modal-payment').innerText = sale.paymentMethod === 'credit'
        ? `À Crédit (${customer?.name || 'Client'})`
        : 'Espèces (Cash)';
      document.getElementById('order-modal-total').innerText = Number(sale.totalAmount).toFixed(2) + ' DA';
      document.getElementById('order-modal-items-count').innerText = (sale.itemCount || items.reduce((acc, i) => acc + (i.qty || 1), 0)) + ' article(s)';
      document.getElementById('order-modal-subtotal').innerText = Number(sale.subtotal || sale.totalAmount).toFixed(2) + ' DA';

      const discountRow = document.getElementById('order-modal-discount-row');
      const discountVal = document.getElementById('order-modal-discount');
      if (sale.discountAmount && Number(sale.discountAmount) > 0) {
        if (discountRow) discountRow.classList.remove('hidden');
        if (discountVal) discountVal.innerText = `-${Number(sale.discountAmount).toFixed(2)} DA (${sale.discountPercent || 0}%)`;
      } else if (discountRow) {
        discountRow.classList.add('hidden');
      }

      document.getElementById('order-modal-final-total').innerText = Number(sale.totalAmount).toFixed(2) + ' DA';

      // Render line items table
      const tbody = document.getElementById('order-modal-items-body');
      if (tbody) {
        if (items.length === 0) {
          tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-slate-400">Aucun article enregistré.</td></tr>`;
        } else {
          tbody.innerHTML = items.map(it => {
            const unitPrice = Number(it.price || it.unitSellingPrice || 0);
            const lineTotal = Number(it.total || it.lineTotal || (unitPrice * (it.qty || 1)));
            return `
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                <td class="p-2.5 font-bold text-slate-800 dark:text-slate-100">${escapeHtml(it.name || it.productName || 'Article')}</td>
                <td class="p-2.5 text-center font-mono font-bold text-slate-700 dark:text-slate-300">${it.qty || it.quantity || 1}</td>
                <td class="p-2.5 text-right font-mono text-slate-500 dark:text-slate-400">${unitPrice.toFixed(2)}</td>
                <td class="p-2.5 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">${lineTotal.toFixed(2)} DA</td>
              </tr>
            `;
          }).join('');
        }
      }

      // Print button on modal
      const printBtn = document.getElementById('order-modal-print-btn');
      if (printBtn) {
        printBtn.onclick = () => {
          window.reprintPosSaleReceipt(sale.orderRef);
        };
      }

      // Refund / Return button on modal
      const refundBtn = document.getElementById('order-modal-refund-btn');
      if (refundBtn) {
        if (sale.status === 'refunded') {
          refundBtn.disabled = true;
          refundBtn.className = 'px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold cursor-not-allowed';
          refundBtn.innerText = '✓ Commande Déjà Remboursée';
        } else {
          refundBtn.disabled = false;
          refundBtn.className = 'px-3 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-300 text-xs font-bold transition flex items-center gap-1.5';
          refundBtn.innerHTML = '<span>🔄</span> <span>Retour / Annuler Vente</span>';
          refundBtn.onclick = async () => {
            const reason = prompt(`Motif du retour / annulation pour la commande #${sale.orderRef} :`, 'Retour client au comptoir');
            if (reason === null) return;
            try {
              await window.CheckoutService.processRefund(sale.orderRef, reason || 'Retour client');
              showToast(`Commande #${sale.orderRef} annulée et articles réintégrés en stock !`);
              document.getElementById('pos-order-modal')?.classList.add('hidden');
              await loadPosProducts();
              await renderPosSalesHistory();
              if (typeof window.renderInventoryWorkspace === 'function') {
                window.renderInventoryWorkspace();
              }
              if (window.DebtService?.refreshDebtBadge) {
                await window.DebtService.refreshDebtBadge();
              }
            } catch (refErr) {
              showToast(refErr.message, 'error');
            }
          };
        }
      }

      modal.classList.remove('hidden');

    } catch (err) {
      console.error('Error opening order details:', err);
      showToast('Error opening order details: ' + err.message, 'error');
    }
  };

  // --- Direct Ticket Reprint Function ---
  window.reprintPosSaleReceipt = async function(orderRef) {
    if (!window.FlexiDB?.db) return;
    try {
      const sale = await window.FlexiDB.db.sales.where('orderRef').equals(orderRef).first();
      if (!sale) {
        showToast('Commande introuvable pour impression', 'error');
        return;
      }

      let items = sale.items || [];
      if (!items || items.length === 0) {
        const lineItems = await window.FlexiDB.db.saleItems.where('saleId').equals(sale.id).toArray();
        items = lineItems.map(l => ({
          name: l.productName,
          qty: l.quantity,
          price: l.unitSellingPrice,
          total: l.lineTotal
        }));
      }

      let debt = null;
      let customer = null;
      if (sale.paymentMethod === 'credit' && window.FlexiDB?.db?.debts) {
        try {
          debt = await window.FlexiDB.db.debts.where('saleId').equals(sale.id).first();
          if (debt && window.FlexiDB.db.customers) {
            customer = await window.FlexiDB.db.customers.get(debt.customerId);
          }
        } catch (e) {}
      }

      const receiptPayload = {
        ...sale,
        items,
        customerName: customer?.name,
        customerPhone: customer?.phone,
        remainingAmount: debt?.remainingAmount,
        amountPaidNow: debt ? (debt.amount - debt.remainingAmount) : 0
      };

      const receiptHtml = generateThermalReceipt(receiptPayload);
      const printArea = document.getElementById('print-area');
      if (printArea) {
        printArea.innerHTML = receiptHtml;
        setTimeout(() => {
          window.print();
        }, 300);
      }
      showToast(`Ticket ${sale.orderRef} envoyé à l'impression !`);
    } catch (e) {
      console.error('Reprint error:', e);
      showToast('Erreur réimpression: ' + e.message, 'error');
    }
  };

  // --- Render Sales History with Rich Order Information ---
  async function renderPosSalesHistory() {
    const historyContainer = document.getElementById('pos-sales-history');
    if (!historyContainer || !window.FlexiDB?.db) return;

    try {
      const recentSales = await window.FlexiDB.db.sales
        .reverse()
        .limit(25)
        .toArray();

      if (recentSales.length === 0) {
        historyContainer.innerHTML = `<div class="text-slate-400 text-center py-4 text-xs">No recent transactions yet.</div>`;
        return;
      }

      historyContainer.innerHTML = recentSales.map(sale => {
        const d = new Date(sale.timestamp);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
        const items = sale.items || [];
        const safeRef = escapeHtml(sale.orderRef);

        return `
          <div class="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-indigo-500 hover:shadow-md transition flex flex-col gap-2 group cursor-pointer" onclick="window.openOrderDetailsModal('${safeRef}')">
            
            <!-- Order Header Row -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs">${safeRef}</span>
                <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">💵 Cash</span>
              </div>
              <span class="font-mono font-black text-indigo-600 dark:text-indigo-400 text-xs">${Number(sale.totalAmount).toFixed(2)} DA</span>
            </div>

            <!-- Date & Article Count -->
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>📅 ${dateStr}, ${timeStr}</span>
              <span>${sale.itemCount || items.length || 1} article(s)</span>
            </div>

            <!-- Items Preview (if present) -->
            ${items.length > 0 ? `
              <div class="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-0.5 text-[11px]">
                ${items.slice(0, 2).map(it => `
                  <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span class="truncate pr-2">${escapeHtml(it.name || it.productName)}</span>
                    <span class="font-mono text-slate-400 shrink-0">×${it.qty || it.quantity}</span>
                  </div>
                `).join('')}
                ${items.length > 2 ? `<span class="text-[10px] text-indigo-500 font-bold">+ ${items.length - 2} autre(s) article(s)...</span>` : ''}
              </div>
            ` : ''}

            <!-- Card Bottom Actions -->
            <div class="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs" onclick="event.stopPropagation()">
              <button onclick="window.openOrderDetailsModal('${safeRef}')" class="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px] font-bold flex items-center gap-1">
                <span>👁️</span> <span>Détails de la commande</span>
              </button>
              <button onclick="window.reprintPosSaleReceipt('${safeRef}')" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] transition flex items-center gap-1">
                <span>🖨️</span> <span>Imprimer Ticket</span>
              </button>
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
      searchDebounceTimer = setTimeout(() => renderPosProducts(true), 120);
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
      renderPosProducts(true);
    });

    // Discount percentage listener
    document.getElementById('pos-discount-input')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      posDiscountPercent = Math.min(100, Math.max(0, val));
      renderPosCart();
    });

    // Clear cart with 2-stage confirmation interlock to prevent accidental clears
    let clearConfirmTimer = null;
    const clearCartBtn = document.getElementById('pos-clear-cart');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => {
        if (posCart.length === 0) return;
        if (clearCartBtn.dataset.confirming === 'true') {
          clearTimeout(clearConfirmTimer);
          clearCartBtn.dataset.confirming = 'false';
          clearCartBtn.innerText = 'Clear Cart';
          clearCartBtn.classList.remove('text-rose-600', 'font-black');
          posCart = [];
          lastScannedItemId = null;
          renderPosCart();
          showToast('Panier vidé');
        } else {
          clearCartBtn.dataset.confirming = 'true';
          clearCartBtn.innerText = '⚠️ Confirmer (Vider) ?';
          clearCartBtn.classList.add('text-rose-600', 'font-black');
          clearTimeout(clearConfirmTimer);
          clearConfirmTimer = setTimeout(() => {
            clearCartBtn.dataset.confirming = 'false';
            clearCartBtn.innerText = 'Clear Cart';
            clearCartBtn.classList.remove('text-rose-600', 'font-black');
          }, 3000);
        }
      });
    }

    // Change Due HUD Dismiss Button
    document.getElementById('pos-change-hud-dismiss-btn')?.addEventListener('click', () => {
      dismissChangeDueHUD();
    });

    // Invoice Auto-Print Parameter (Allow / Deny)
    const autoPrintToggle = document.getElementById('pos-toggle-auto-print');
    const settingsAutoPrintToggle = document.getElementById('settings-auto-print-toggle');

    function syncAutoPrint(enabled) {
      allowReceiptAutoPrint = Boolean(enabled);
      localStorage.setItem('pos_auto_print_receipt', allowReceiptAutoPrint ? 'true' : 'false');
      if (autoPrintToggle) autoPrintToggle.checked = allowReceiptAutoPrint;
      if (settingsAutoPrintToggle) settingsAutoPrintToggle.checked = allowReceiptAutoPrint;
      const statusLabel = document.getElementById('pos-print-status-label');
      if (statusLabel) {
        statusLabel.innerText = allowReceiptAutoPrint 
          ? 'Autorisée (Ticket imprimé après encaissement)' 
          : 'Refusée (Encaissement sans impression auto)';
      }
    }

    if (autoPrintToggle) {
      autoPrintToggle.checked = allowReceiptAutoPrint;
      syncAutoPrint(allowReceiptAutoPrint);
      autoPrintToggle.addEventListener('change', (e) => syncAutoPrint(e.target.checked));
    }
    if (settingsAutoPrintToggle) {
      settingsAutoPrintToggle.checked = allowReceiptAutoPrint;
      settingsAutoPrintToggle.addEventListener('change', (e) => syncAutoPrint(e.target.checked));
    }

    // Order Details Modal Close Listeners
    document.getElementById('close-order-modal-btn')?.addEventListener('click', () => {
      document.getElementById('pos-order-modal')?.classList.add('hidden');
    });
    document.getElementById('order-modal-close-action-btn')?.addEventListener('click', () => {
      document.getElementById('pos-order-modal')?.classList.add('hidden');
    });

    // Cash Checkout button
    const checkoutBtn = document.getElementById('pos-checkout-btn');
    if (checkoutBtn) checkoutBtn.onclick = () => completePosCashCheckout(null);

    // Credit Checkout button & modal controls
    const creditCheckoutBtn = document.getElementById('pos-credit-checkout-btn');
    if (creditCheckoutBtn) creditCheckoutBtn.onclick = openPosCreditModal;

    document.getElementById('pos-close-credit-modal-btn')?.addEventListener('click', () => {
      document.getElementById('pos-credit-modal')?.classList.add('hidden');
    });
    document.getElementById('pos-cancel-credit-modal-btn')?.addEventListener('click', () => {
      document.getElementById('pos-credit-modal')?.classList.add('hidden');
    });
    document.getElementById('pos-confirm-credit-btn')?.addEventListener('click', completePosCreditCheckout);

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

    // Backup Reminder Banner Controls
    document.getElementById('pos-banner-dismiss-btn')?.addEventListener('click', () => {
      document.getElementById('pos-backup-reminder-banner')?.classList.add('hidden');
    });
    document.getElementById('dismiss-backup-banner')?.addEventListener('click', () => {
      document.getElementById('pos-backup-reminder-banner')?.classList.add('hidden');
    });
    document.getElementById('pos-banner-backup-now-btn')?.addEventListener('click', () => {
      if (typeof window.switchAppMode === 'function') {
        window.switchAppMode('settings');
      } else {
        document.getElementById('pos-backup-modal')?.classList.remove('hidden');
      }
    });

    // Camera Barcode Scanner Controls
    document.getElementById('open-cam-scanner-btn')?.addEventListener('click', startCameraScanner);
    document.getElementById('close-cam-scanner-btn')?.addEventListener('click', stopCameraScanner);

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

    // Restore database from JSON file (reusable across POS modal and Settings workspace)
    window.restoreDatabaseFromJsonFile = async function(file) {
      if (!file) return;
      if (!window.BackupService) {
        showToast('Backup Service unavailable', 'error');
        return;
      }
      if (confirm('Warning: Restoring backup will overwrite current local inventory and sales history. Continue?')) {
        try {
          const res = await window.BackupService.importDatabaseFromJson(file);
          showToast(`Database Restored! Products: ${res.restored.products}, Sales: ${res.restored.sales}`);
          await loadPosProducts();
          await renderPosSalesHistory();
          if (typeof renderInventoryWorkspace === 'function') renderInventoryWorkspace();
          document.getElementById('pos-backup-modal')?.classList.add('hidden');
        } catch (err) {
          showToast('Import Error: ' + err.message, 'error');
        }
      }
    };

    // JSON Import
    document.getElementById('import-json-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) await window.restoreDatabaseFromJsonFile(file);
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

    // Mobile QR Payment Actions
    document.getElementById('pos-open-portal-btn')?.addEventListener('click', () => {
      if (activePaymentUrl) {
        window.open(activePaymentUrl, '_blank');
      }
    });

    document.getElementById('pos-copy-pay-link-btn')?.addEventListener('click', () => {
      if (activePaymentUrl) {
        navigator.clipboard.writeText(activePaymentUrl).then(() => {
          showToast('Lien de paiement copié dans le presse-papier !');
        });
      }
    });

    // Scanner & Hardware Setup Modal
    const scannerModal = document.getElementById('scanner-config-modal');
    document.getElementById('open-scanner-config-btn')?.addEventListener('click', async () => {
      if (scannerModal) {
        scannerModal.classList.remove('hidden');
        document.getElementById('scanner-threshold-input').value = scannerConfig.thresholdMs || 50;
        document.getElementById('scanner-min-len-input').value = scannerConfig.minLen || 4;
        document.getElementById('scanner-suffix-select').value = scannerConfig.suffix || 'Enter';
        document.getElementById('scanner-sound-toggle').checked = scannerConfig.soundEnabled !== false;

        // Auto-detect server IP for host input
        const hostInput = document.getElementById('scanner-host-input');
        if (hostInput) {
          hostInput.value = scannerConfig.mobileHost || '';
          if (!hostInput.value) {
            try {
              const res = await fetch('/api/pos/info');
              const data = await res.json();
              if (data.baseUrl) hostInput.value = data.baseUrl;
            } catch (e) {
              hostInput.value = window.location.origin;
            }
          }
        }
      }
    });

    document.getElementById('close-scanner-config-btn')?.addEventListener('click', () => {
      scannerModal?.classList.add('hidden');
    });

    document.getElementById('detect-host-btn')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/pos/info');
        const data = await res.json();
        const hostInput = document.getElementById('scanner-host-input');
        if (hostInput && data.baseUrl) {
          hostInput.value = data.baseUrl;
          showToast(`Détecté: ${data.baseUrl}`);
        }
      } catch (e) {
        showToast('Detection error: ' + e.message, 'error');
      }
    });

    document.getElementById('test-beep-btn')?.addEventListener('click', playScannerBeep);

    document.getElementById('save-scanner-config-btn')?.addEventListener('click', () => {
      scannerConfig.thresholdMs = parseInt(document.getElementById('scanner-threshold-input').value, 10) || 50;
      scannerConfig.minLen = parseInt(document.getElementById('scanner-min-len-input').value, 10) || 4;
      scannerConfig.suffix = document.getElementById('scanner-suffix-select').value;
      scannerConfig.soundEnabled = document.getElementById('scanner-sound-toggle').checked;
      scannerConfig.mobileHost = (document.getElementById('scanner-host-input')?.value || '').trim();

      localStorage.setItem('pos_scanner_config', JSON.stringify(scannerConfig));
      scannerModal?.classList.add('hidden');
      showToast('Paramètres de caisse & QR enregistrés');

      // Re-render QR with updated host if active
      if (posPaymentMethod === 'qr' && posCart.length > 0) {
        renderPosCart();
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
    renderSalesHistory: renderPosSalesHistory,
    openCreditModal: openPosCreditModal,
    completeCreditCheckout: completePosCreditCheckout,
    completeCashCheckout: completePosCashCheckout,
    dismissChangeHUD: dismissChangeDueHUD,
    kickCashDrawer: kickPosCashDrawer,
    syncCategoriesUI: syncCategoriesUI,
    openCategoryManagerModal: openCategoryManagerModal,
    updateExpiryBadge: updateExpiryBadge,
    updateStockConflictBadge: updateStockConflictBadge,
    updateSyncBadge: updateSyncBadge
  };

  window.loadPosProducts = loadPosProducts;

  // Auto-heal check: if grid is still showing loading message, force load products
  function autoHealGrid() {
    const grid = document.getElementById('pos-product-grid');
    if (grid && (grid.innerText.includes('Loading catalog') || posProducts.length === 0)) {
      console.warn('[POS Auto-Heal] Catalog placeholder detected, forcing loadPosProducts()...');
      loadPosProducts();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(autoHealGrid, 300);
      setTimeout(autoHealGrid, 1000);
    });
  } else {
    setTimeout(autoHealGrid, 300);
    setTimeout(autoHealGrid, 1000);
  }
})();