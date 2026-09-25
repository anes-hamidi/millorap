// ==========================================
// APPLICATION ORCHESTRATOR & WORKSPACE ROUTER
// ==========================================

// Global Toast notification helper
function showToast(message, type = 'success') {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-indigo-600';
  toast.className = `${bgColor} text-white px-4 py-2.5 rounded-xl shadow-lg font-medium text-sm transition-all duration-300 transform translate-y-2 opacity-0 flex items-center gap-2 z-50 pointer-events-auto`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
window.showToast = showToast;

// Global HTML sanitization helper
function escapeHtml(str) {
  return str ? String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) : '';
}
window.escapeHtml = escapeHtml;

// Workspace Metadata Configuration
const WORKSPACES = {
  pos: {
    title: 'POS Cashier Terminal',
    subtitle: 'Fast barcode checkout, order register & instant receipts',
    icon: '🛒',
    sectionId: 'section-pos-app',
    navId: 'nav-pos'
  },
  inventory: {
    title: 'Inventory & Catalog Management',
    subtitle: 'Manage products, stock counts, profit margins, cost price & barcodes',
    icon: '📦',
    sectionId: 'section-inventory-app',
    navId: 'nav-inventory'
  },
  analytics: {
    title: 'Financial & Sales Intelligence',
    subtitle: 'Local real-time gross revenue, net profit, top sellers, and margin reports',
    icon: '📊',
    sectionId: 'section-analytics-app',
    navId: 'nav-analytics'
  },
  print: {
    title: 'Document & Exam Print Hub',
    subtitle: 'Explore 44,000+ school exams, lesson documents, and high-res previews',
    icon: '🖨️',
    sectionId: 'section-print-app',
    navId: 'nav-print'
  },
  merge: {
    title: 'PDF Multi-File Merge Studio',
    subtitle: 'Combine multiple PDF documents, exams, or lessons into a single file',
    icon: '✨',
    sectionId: 'section-merge-app',
    navId: 'nav-merge'
  },
  transfer: {
    title: 'Mobile-to-PC File Reception Station',
    subtitle: 'Scan with smartphone camera to instantly receive customer files directly to PC',
    icon: '📲',
    sectionId: 'section-transfer-app',
    navId: 'nav-transfer'
  },
  qr: {
    title: 'QR Code Design Studio',
    subtitle: 'Custom styled QR codes with logos, colors, gradients, and 9 data types',
    icon: '📱',
    sectionId: 'section-qr-app',
    navId: 'nav-qr'
  },
  settings: {
    title: 'Backup, Data Safety & Hardware Setup',
    subtitle: 'Full database snapshot, CSV spreadsheet exports, and barcode scanner timing',
    icon: '⚙️',
    sectionId: 'section-settings-app',
    navId: 'nav-settings'
  },
  debts: {
    title: 'Customer Credit & Debt Ledger',
    subtitle: 'Track on-credit sales, customer balances and full repayment history',
    icon: '🏦',
    sectionId: 'section-debts-app',
    navId: 'nav-debts'
  },
  suppliers: {
    title: 'Fournisseurs & Commandes',
    subtitle: 'Gestion des fournisseurs, bons de commande et réception des livraisons',
    icon: '🏭',
    sectionId: 'section-suppliers-app',
    navId: 'nav-suppliers'
  }
};

let currentWorkspace = 'transfer';

// Main Workspace Navigation Switcher
function switchAppMode(targetMode) {
  if (!WORKSPACES[targetMode]) targetMode = 'transfer';
  currentWorkspace = targetMode;

  const meta = WORKSPACES[targetMode];

  // Update Page Title and Icon
  const pageIcon = document.getElementById('page-icon');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  if (pageIcon) pageIcon.innerText = meta.icon;
  if (pageTitle) pageTitle.innerText = meta.title;
  if (pageSubtitle) pageSubtitle.innerText = meta.subtitle;

  // Update Sidebar Navigation Link Active State
  document.querySelectorAll('.nav-link').forEach(link => {
    const isTarget = link.dataset.workspace === targetMode || link.id === meta.navId;
    link.classList.toggle('active', isTarget);
  });

  // Toggle Visibility of all Workspaces
  Object.keys(WORKSPACES).forEach(key => {
    const sec = document.getElementById(WORKSPACES[key].sectionId);
    if (sec) {
      if (key === targetMode) {
        sec.classList.remove('hidden');
        sec.classList.add('animate-fade-in');
      } else {
        sec.classList.add('hidden');
        sec.classList.remove('animate-fade-in');
      }
    }
  });

  // Close mobile sidebar if open
  closeMobileSidebar();

  // Trigger Workspace-Specific Loading/Rendering
  switch (targetMode) {
    case 'pos':
      if (window.POS?.loadProducts) window.POS.loadProducts();
      if (window.POS?.renderSalesHistory) window.POS.renderSalesHistory();
      break;
    case 'inventory':
      renderInventoryWorkspace();
      break;
    case 'analytics':
      renderAnalyticsWorkspace('30days');
      break;
    case 'print':
      if (window.FileBrowser?.fetchFiles) window.FileBrowser.fetchFiles();
      if (window.Printing?.fetchPrinters) window.Printing.fetchPrinters();
      break;
    case 'merge':
      renderMergeStudioWorkspace();
      break;
    case 'transfer':
      renderTransferDropZoneWorkspace();
      break;
    case 'qr':
      if (window.QRGenerator?.init) window.QRGenerator.init();
      break;
    case 'settings':
      renderSettingsWorkspace();
      break;
    case 'debts':
      renderDebtsWorkspace();
      break;
    case 'suppliers':
      renderSuppliersWorkspace();
      break;
  }
}
window.switchAppMode = switchAppMode;

// Mobile Sidebar Controls
function openMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('-translate-x-full');
  if (backdrop) backdrop.classList.remove('hidden');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.add('-translate-x-full');
  if (backdrop) backdrop.classList.add('hidden');
}

// Live Clock Helper
function startLiveClock() {
  const clockEl = document.getElementById('system-clock');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

// ==========================================
// WORKSPACE 1: INVENTORY & STOCK MANAGER
// ==========================================
// WORKSPACE 1: INVENTORY & STOCK MANAGER
// ==========================================
let invCurrentPage = 0;
const INV_PAGE_SIZE = 50;
let invTotalCount = 0;

async function changeInventoryPage(delta) {
  const maxPage = Math.max(0, Math.ceil(invTotalCount / INV_PAGE_SIZE) - 1);
  const newPage = invCurrentPage + delta;
  if (newPage >= 0 && newPage <= maxPage) {
    invCurrentPage = newPage;
    await renderInventoryWorkspace(false);
  }
}
window.changeInventoryPage = changeInventoryPage;

async function renderInventoryWorkspace(resetPage = true) {
  if (typeof resetPage !== 'boolean') resetPage = true;
  if (resetPage) invCurrentPage = 0;

  if (window.FlexiDB && window.FlexiDB.init) {
    try {
      await window.FlexiDB.init();
    } catch (e) {
      console.warn('FlexiDB init error:', e);
    }
  }
  if (!window.FlexiDB || !window.FlexiDB.db) return;

  try {
    // 1. Lightweight Inventory Statistics (Cursor-streamed without holding 42k objects in memory)
    if (window.FlexiDB.getInventoryStats) {
      const stats = await window.FlexiDB.getInventoryStats();
      const elTotProd = document.getElementById('inv-stat-total-products');
      const elTotUnits = document.getElementById('inv-stat-total-units');
      const elRetailVal = document.getElementById('inv-stat-retail-value');
      const elLowCount = document.getElementById('inv-stat-low-count');
      const navLowBadge = document.getElementById('nav-low-stock-badge');

      if (elTotProd) elTotProd.innerText = `${stats.totalProducts.toLocaleString()} items`;
      if (elTotUnits) elTotUnits.innerText = `${stats.totalUnits.toLocaleString()} units`;
      if (elRetailVal) elRetailVal.innerText = `${stats.totalRetailVal.toFixed(2)} DA`;
      if (elLowCount) elLowCount.innerText = `${stats.lowCount} alerts`;

      if (navLowBadge) {
        if (stats.lowCount > 0) {
          navLowBadge.classList.remove('hidden');
          navLowBadge.innerText = stats.lowCount;
        } else {
          navLowBadge.classList.add('hidden');
        }
      }
    }

    // 2. Fetch Paged Slice for Table
    const searchVal = (document.getElementById('inventory-search-input')?.value || '').toLowerCase().trim();
    const catVal = document.getElementById('inventory-category-filter')?.value || 'all';
    const stockFilter = document.getElementById('inventory-stock-filter')?.value || 'all';

    let filtered = [];
    let totalMatched = 0;

    if (window.SearchEngine && window.SearchEngine.isReady()) {
      const res = await window.SearchEngine.search({
        category: catVal,
        query: searchVal,
        stockFilter: stockFilter,
        page: invCurrentPage,
        pageSize: INV_PAGE_SIZE
      });
      filtered = res.products || [];
      totalMatched = res.total || 0;
    } else if (window.FlexiDB.getProductsPaged) {
      const res = await window.FlexiDB.getProductsPaged({
        category: catVal,
        search: searchVal,
        stockFilter: stockFilter,
        page: invCurrentPage,
        pageSize: INV_PAGE_SIZE
      });
      filtered = res.products || [];
      totalMatched = res.total || 0;
    } else {
      const all = await window.FlexiDB.db.products.toArray();
      filtered = all.slice(invCurrentPage * INV_PAGE_SIZE, (invCurrentPage + 1) * INV_PAGE_SIZE);
      totalMatched = all.length;
    }

    invTotalCount = totalMatched;

    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="p-8 text-center text-slate-400 text-xs">
            Aucun produit ne correspond à vos filtres de recherche.
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = filtered.map(p => {
        const stock = Number(p.currentStock) || 0;
        const threshold = Number(p.lowStockThreshold != null ? p.lowStockThreshold : 10);
        const isOutOfStock = stock <= 0;
        const isLowStock = stock <= threshold && !isOutOfStock;
        const cost = Number(p.costPrice || 0);
        const price = Number(p.sellingPrice || p.price || 0);
        const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(0) : '0';

        const statusBadge = isOutOfStock
          ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800">OUT OF STOCK</span>'
          : isLowStock
          ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800">LOW STOCK</span>'
          : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">IN STOCK</span>';

        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
            <td class="text-center text-xl select-none">
              ${p.icon || '📦'}
            </td>
            <td>
              <div class="flex flex-col">
                <span class="font-bold text-slate-800 dark:text-slate-100 text-xs">${escapeHtml(p.name)}</span>
                ${p.image ? `<span class="text-[10px] text-indigo-500 truncate max-w-[140px]">Photo Attached</span>` : ''}
              </div>
            </td>
            <td>
              <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">${escapeHtml(p.category || 'General')}</span>
            </td>
            <td>
              <span class="font-mono text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">${escapeHtml(p.barcode || 'NO BARCODE')}</span>
            </td>
            <td class="text-right font-mono text-slate-500">
              ${cost.toFixed(2)} DA
            </td>
            <td class="text-right font-mono font-bold text-slate-800 dark:text-slate-100">
              ${price.toFixed(2)} DA
              <span class="block text-[10px] text-emerald-600 font-normal">(${margin}% margin)</span>
            </td>
            <td class="text-center">
              <div class="inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-1">
                <button onclick="quickAdjustStock('${escapeHtml(String(p.id))}', -1)" class="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center">-1</button>
                <span class="px-2 font-mono font-black text-xs min-w-[28px] text-center ${isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'}">${stock}</span>
                <button onclick="quickAdjustStock('${escapeHtml(String(p.id))}', 1)" class="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center">+1</button>
                <button onclick="quickAdjustStock('${escapeHtml(String(p.id))}', 10)" class="px-1.5 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 font-bold text-[10px] flex items-center justify-center">+10</button>
              </div>
            </td>
            <td class="text-center">
              ${statusBadge}
            </td>
            <td class="text-right">
              <div class="flex items-center justify-end gap-1.5">
                <button onclick="editProduct('${escapeHtml(String(p.id))}')" class="p-1.5 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1" title="Edit Product">
                  <span>✏️</span> <span>Edit</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 3. Update Pagination Controls
    const totalPages = Math.max(1, Math.ceil(totalMatched / INV_PAGE_SIZE));
    const startIdx = totalMatched === 0 ? 0 : (invCurrentPage * INV_PAGE_SIZE + 1);
    const endIdx = Math.min(totalMatched, (invCurrentPage + 1) * INV_PAGE_SIZE);

    const elInfo = document.getElementById('inventory-pagination-info');
    const elIndicator = document.getElementById('inventory-page-indicator');
    const btnPrev = document.getElementById('inventory-prev-page');
    const btnNext = document.getElementById('inventory-next-page');

    if (elInfo) elInfo.innerText = `Affichage de ${startIdx.toLocaleString()} à ${endIdx.toLocaleString()} sur ${totalMatched.toLocaleString()} produit(s)`;
    if (elIndicator) elIndicator.innerText = `Page ${invCurrentPage + 1} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = invCurrentPage <= 0;
    if (btnNext) btnNext.disabled = invCurrentPage >= totalPages - 1;

  } catch (err) {
    console.error('Inventory rendering error:', err);
  }
}
window.renderInventoryWorkspace = renderInventoryWorkspace;

// Quick Stock Adjustments from Table
async function quickAdjustStock(productId, delta) {
  if (!window.FlexiDB || !window.FlexiDB.db) return;
  const db = window.FlexiDB.db;
  try {
    const idNum = Number(productId);
    const product = (!isNaN(idNum) ? await db.products.get(idNum) : null) || await db.products.get(productId) || await db.products.get(String(productId));
    if (!product) return;
    const actualId = product.id;
    const prevStock = Number(product.currentStock) || 0;
    const newStock = Math.max(0, prevStock + delta);

    await db.products.update(actualId, {
      currentStock: newStock,
      updatedAt: new Date().toISOString()
    });

    await db.stockLogs.add({
      productId: actualId,
      timestamp: new Date().toISOString(),
      type: 'ADJUSTMENT',
      quantityChange: delta,
      previousStock: prevStock,
      newStock: newStock,
      referenceId: 'QUICK_TABLE_ADJUST',
      note: 'Quick inventory table adjustment'
    });

    showToast(`Stock mis à jour pour ${product.name}: ${newStock} unités`);
    await renderInventoryWorkspace(false);
    if (window.POS?.loadProducts) window.POS.loadProducts();
  } catch (e) {
    showToast('Error updating stock: ' + e.message, 'error');
  }
}
window.quickAdjustStock = quickAdjustStock;

// ==========================================
// WORKSPACE 2: SALES & FINANCIAL ANALYTICS
// ==========================================
async function renderAnalyticsWorkspace(windowPeriod = '30days') {
  if (window.FlexiDB && window.FlexiDB.init) {
    try {
      await window.FlexiDB.init();
    } catch (e) {
      console.warn('FlexiDB init error:', e);
    }
  }
  if (!window.AnalyticsService) return;

  try {
    // 1. Revenue & Margin Summary
    let startDate = null;
    const now = new Date();
    if (windowPeriod === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (windowPeriod === '7days') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (windowPeriod === '30days') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const rev = await window.AnalyticsService.getRevenueAnalytics(startDate);

    const elRev = document.getElementById('page-analytics-revenue');
    const elOrders = document.getElementById('page-analytics-orders');
    const elProfit = document.getElementById('page-analytics-profit');
    const elMargin = document.getElementById('page-analytics-margin');
    const elCogs = document.getElementById('page-analytics-cogs');
    const elBasket = document.getElementById('page-analytics-basket');

    if (elRev) elRev.innerText = `${rev.totalRevenue.toFixed(2)} DA`;
    if (elOrders) elOrders.innerText = `${rev.orderCount} transactions`;
    if (elProfit) elProfit.innerText = `${rev.netProfit.toFixed(2)} DA`;
    if (elMargin) elMargin.innerText = `${rev.marginPercent.toFixed(1)}% margin`;
    if (elCogs) elCogs.innerText = `${rev.totalCost.toFixed(2)} DA`;
    if (elBasket) elBasket.innerText = `${rev.avgBasket.toFixed(2)} DA`;

    // 2. Top Sellers
    const topSellers = await window.AnalyticsService.getTopSellingProducts(windowPeriod);
    const topContainer = document.getElementById('page-analytics-top-sellers');
    if (topContainer) {
      if (topSellers.length === 0) {
        topContainer.innerHTML = '<span class="text-slate-400 text-xs text-center py-6">No sales recorded in this period.</span>';
      } else {
        topContainer.innerHTML = topSellers.slice(0, 10).map((p, idx) => `
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center shrink-0">#${idx + 1}</span>
              <span class="font-bold text-slate-800 dark:text-slate-200 truncate">${escapeHtml(p.name)}</span>
            </div>
            <div class="flex items-center gap-3 font-mono shrink-0">
              <span class="text-slate-400 text-[11px]">${p.totalQuantity} units</span>
              <span class="text-emerald-600 font-extrabold">${p.totalRevenue.toFixed(0)} DA</span>
            </div>
          </div>
        `).join('');
      }
    }

    // 3. Low Stock Warnings
    const lowStockList = await window.AnalyticsService.getLowStockProducts();
    const lowContainer = document.getElementById('page-analytics-low-stock');
    if (lowContainer) {
      if (lowStockList.length === 0) {
        lowContainer.innerHTML = '<span class="text-emerald-600 text-xs font-semibold py-4 text-center">✅ All inventory levels are optimal!</span>';
      } else {
        lowContainer.innerHTML = lowStockList.map(p => {
          const isZero = p.currentStock <= 0;
          return `
            <div class="flex items-center justify-between p-2.5 rounded-xl ${isZero ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900' : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900'} text-xs">
              <div class="flex items-center gap-2">
                <span>${p.icon || '📦'}</span>
                <span class="font-bold ${isZero ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-200'}">${escapeHtml(p.name)}</span>
              </div>
              <span class="font-mono font-extrabold ${isZero ? 'text-rose-600' : 'text-amber-600'}">${isZero ? 'OUT OF STOCK' : p.currentStock + ' left (min ' + (p.lowStockThreshold || 10) + ')'}</span>
            </div>
          `;
        }).join('');
      }
    }

    // 4. Sales Register
    if (window.FlexiDB?.db) {
      const sales = await window.FlexiDB.db.sales.reverse().limit(50).toArray();
      const regContainer = document.getElementById('page-analytics-register');
      if (regContainer) {
        if (sales.length === 0) {
          regContainer.innerHTML = '<div class="text-slate-400 text-xs text-center py-8">No transaction history recorded yet.</div>';
        } else {
          regContainer.innerHTML = sales.map(s => {
            const dateStr = new Date(s.timestamp).toLocaleString();
            return `
              <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div class="flex flex-col min-w-0">
                  <span class="font-bold font-mono text-slate-800 dark:text-slate-100">${escapeHtml(s.orderRef)}</span>
                  <span class="text-[11px] text-slate-400">${dateStr} • ${s.itemCount || 0} items • ${s.paymentMethod.toUpperCase()}</span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="flex flex-col items-end">
                    <span class="font-mono font-extrabold text-emerald-600 text-sm">${Number(s.totalAmount).toFixed(2)} DA</span>
                    <span class="text-[10px] text-slate-400 font-mono">Profit: ${Number(s.netProfit).toFixed(1)} DA</span>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }

    // 5. Expiring Batches Alerts (D-7 / D-3)
    if (window.AnalyticsService?.getExpiringBatches) {
      try {
        const expiringBatches = await window.AnalyticsService.getExpiringBatches(7);
        const expiringContainer = document.getElementById('page-analytics-expiring-batches');
        if (expiringContainer) {
          if (expiringBatches.length === 0) {
            expiringContainer.innerHTML = '<span class="text-emerald-600 text-xs font-semibold py-4 text-center">✅ Aucun lot en approche d\'expiration !</span>';
          } else {
            expiringContainer.innerHTML = expiringBatches.map(b => {
              const isDanger = b.severity === 'danger';
              return `
                <div class="flex items-center justify-between p-2.5 rounded-xl ${isDanger ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900' : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900'} text-xs">
                  <div class="flex flex-col min-w-0">
                    <span class="font-bold ${isDanger ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-200'} truncate">${escapeHtml(b.productName || 'Article')} ${b.batchNumber ? '(' + escapeHtml(b.batchNumber) + ')' : ''}</span>
                    <span class="text-[10px] text-slate-400">Périme le ${new Date(b.expiryDate).toLocaleDateString()}</span>
                  </div>
                  <div class="flex items-center gap-2 font-mono">
                    <span class="font-bold text-slate-700 dark:text-slate-300">${b.remainingQty != null ? b.remainingQty : b.initialQty} u.</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${isDanger ? 'bg-rose-500 text-white animate-pulse' : 'bg-amber-500 text-white'}">${b.daysRemaining <= 0 ? 'Expiré' : 'J-' + b.daysRemaining}</span>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
      } catch (expErr) {
        console.warn('Expiring batches render error:', expErr);
      }
    }

    // 6. Stock Conflicts (Multi-Register Negative Stock Detection & Reconciliation)
    if (window.AnalyticsService?.getStockConflicts) {
      try {
        const conflicts = await window.AnalyticsService.getStockConflicts('open');
        const conflictsContainer = document.getElementById('page-analytics-stock-conflicts');
        const conflictsCountEl = document.getElementById('page-analytics-conflicts-count');
        if (conflictsCountEl) {
          conflictsCountEl.innerText = `${conflicts.length} Conflit(s)`;
          conflictsCountEl.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${conflicts.length > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`;
        }
        if (conflictsContainer) {
          if (conflicts.length === 0) {
            conflictsContainer.innerHTML = '<span class="text-emerald-600 text-xs font-semibold py-4 text-center">✅ Aucun conflit de stock négatif détecté.</span>';
          } else {
            conflictsContainer.innerHTML = conflicts.map(c => `
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs">
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-rose-800 dark:text-rose-200 truncate">${escapeHtml(c.productName || 'Produit')}</span>
                    <span class="text-[10px] text-slate-400 font-mono">(${escapeHtml(c.barcode || c.productId)})</span>
                  </div>
                  <span class="text-[10px] text-slate-400">Détecté le ${new Date(c.detectedAt).toLocaleString()}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-600 text-white">${c.currentStock} u.</span>
                  <button onclick="openResolveConflictModal('${escapeHtml(String(c.id))}')" class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 text-[11px] font-bold transition">
                    Résoudre
                  </button>
                </div>
              </div>
            `).join('');
          }
        }
        if (window.POS?.updateStockConflictBadge) {
          await window.POS.updateStockConflictBadge();
        }
      } catch (confErr) {
        console.warn('Stock conflicts render error:', confErr);
      }
    }

  } catch (err) {
    console.error('Analytics workspace error:', err);
  }
}

async function openResolveConflictModal(conflictId) {
  if (!window.FlexiDB || !window.FlexiDB.db) return;
  const db = window.FlexiDB.db;
  try {
    const numericId = Number(conflictId);
    const targetId = isNaN(numericId) ? conflictId : numericId;
    const conflict = await db.stockConflicts.get(targetId);
    if (!conflict) {
      showToast('Conflit introuvable', 'error');
      return;
    }
    const product = await db.products.get(conflict.productId) || {};
    
    document.getElementById('conflict-modal-id').value = conflict.id;
    document.getElementById('conflict-modal-product-name').innerText = product.name || 'Produit Inconnu';
    document.getElementById('conflict-modal-stock-badge').innerText = `${conflict.currentStock} u.`;
    document.getElementById('conflict-resolution-note').value = '';
    document.getElementById('conflict-resolved-by').value = localStorage.getItem('pos_terminal_id') ? `Caissier (${localStorage.getItem('pos_terminal_id')})` : 'Manager';
    document.getElementById('stock-conflict-modal')?.classList.remove('hidden');
  } catch (e) {
    console.error('Error opening conflict modal:', e);
  }
}
window.openResolveConflictModal = openResolveConflictModal;

async function handleResolveConflictSubmit(e) {
  e.preventDefault();
  const conflictId = document.getElementById('conflict-modal-id')?.value;
  const resolvedBy = document.getElementById('conflict-resolved-by')?.value || 'Manager';
  const resolutionNote = document.getElementById('conflict-resolution-note')?.value || '';

  if (!conflictId) return;

  try {
    const numericId = Number(conflictId);
    const targetId = isNaN(numericId) ? conflictId : numericId;
    await window.FlexiDB.resolveStockConflict(targetId, { resolvedBy, resolutionNote });
    document.getElementById('stock-conflict-modal')?.classList.add('hidden');
    showToast('Conflit de stock marqué comme résolu !', 'success');
    if (window.renderAnalyticsWorkspace) await window.renderAnalyticsWorkspace();
    if (window.POS?.updateStockConflictBadge) await window.POS.updateStockConflictBadge();
  } catch (err) {
    showToast('Erreur résolution conflit: ' + err.message, 'error');
  }
}
window.handleResolveConflictSubmit = handleResolveConflictSubmit;
window.renderAnalyticsWorkspace = renderAnalyticsWorkspace;

// ==========================================
// WORKSPACE 3: PDF MERGE STUDIO
// ==========================================
let studioMergeQueue = []; // array of { name, path, fileBlob, isLocal }

function syncMergeQueueFromExplorer() {
  if (!window.FileBrowser?.getSelectedFiles) return;
  const explorerFiles = window.FileBrowser.getSelectedFiles();
  
  // Keep existing local files and merge explorer files
  const existingLocal = studioMergeQueue.filter(f => f.isLocal);
  const existingPaths = new Set(studioMergeQueue.map(f => f.path));

  explorerFiles.forEach(path => {
    if (!existingPaths.has(path)) {
      studioMergeQueue.push({
        name: path.split('/').pop(),
        path: path,
        fileBlob: null,
        isLocal: false
      });
    }
  });

  // Remove explorer files that are unselected
  const explorerSet = new Set(explorerFiles);
  studioMergeQueue = studioMergeQueue.filter(f => f.isLocal || explorerSet.has(f.path));
}

function renderMergeStudioWorkspace() {
  syncMergeQueueFromExplorer();

  const listContainer = document.getElementById('studio-merge-list');
  const countDisp = document.getElementById('studio-merge-count');
  if (!listContainer) return;

  if (countDisp) countDisp.innerText = studioMergeQueue.length;

  if (studioMergeQueue.length === 0) {
    listContainer.innerHTML = `
      <div class="text-slate-400 text-center py-12 flex flex-col items-center gap-2">
        <span class="text-3xl">📑</span>
        <span class="font-bold text-slate-700 dark:text-slate-300">No documents in the merge queue.</span>
        <p class="text-xs text-slate-400">Select files in the Document Explorer or upload local PDF files from your computer.</p>
        <div class="flex items-center gap-2 mt-2">
          <button onclick="switchAppMode('print')" class="px-3.5 py-1.5 rounded-xl btn-gradient text-white font-bold text-xs shadow-sm">Browse Document Explorer ↗</button>
        </div>
      </div>`;
    return;
  }

  listContainer.innerHTML = studioMergeQueue.map((item, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === studioMergeQueue.length - 1;
    return `
      <div class="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 shadow-sm hover:border-indigo-400 transition">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <span class="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center shrink-0">#${idx + 1}</span>
          <span class="text-lg shrink-0">${item.isLocal ? '💾' : '📄'}</span>
          <div class="flex flex-col min-w-0">
            <span class="font-bold text-slate-800 dark:text-slate-100 text-xs truncate">${escapeHtml(item.name)}</span>
            <span class="text-[10px] text-slate-400 font-mono truncate">${item.isLocal ? 'Local uploaded file' : escapeHtml(item.path)}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="moveStudioMergeItem(${idx}, -1)" ${isFirst ? 'disabled' : ''} class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs disabled:opacity-30 disabled:cursor-not-allowed font-bold" title="Move Up">▲</button>
          <button onclick="moveStudioMergeItem(${idx}, 1)" ${isLast ? 'disabled' : ''} class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs disabled:opacity-30 disabled:cursor-not-allowed font-bold" title="Move Down">▼</button>
          <button onclick="removeStudioMergeItem(${idx})" class="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-500 font-bold text-xs ml-1" title="Remove">✕</button>
        </div>
      </div>
    `;
  }).join('');
}
window.renderMergeStudioWorkspace = renderMergeStudioWorkspace;

window.moveStudioMergeItem = (index, delta) => {
  const targetIdx = index + delta;
  if (targetIdx < 0 || targetIdx >= studioMergeQueue.length) return;
  const temp = studioMergeQueue[index];
  studioMergeQueue[index] = studioMergeQueue[targetIdx];
  studioMergeQueue[targetIdx] = temp;
  renderMergeStudioWorkspace();
};

window.removeStudioMergeItem = (index) => {
  const item = studioMergeQueue[index];
  if (item && !item.isLocal && window.FileBrowser?.selectedFiles) {
    window.FileBrowser.selectedFiles.delete(item.path);
  }
  studioMergeQueue.splice(index, 1);
  renderMergeStudioWorkspace();
};

// Execute Merge from Studio
async function executeStudioMerge(actionType = 'download') {
  if (studioMergeQueue.length === 0) {
    showToast('Merge queue is empty! Add documents first.', 'error');
    return;
  }

  const rawFilename = (document.getElementById('studio-merge-filename')?.value || '').trim();
  const saveName = (rawFilename || 'Merged_Document').replace(/\.pdf$/i, '') + '.pdf';
  const targetFolder = (document.getElementById('studio-merge-folder')?.value || '').trim();

  showToast(`Merging ${studioMergeQueue.length} documents...`);

  try {
    // Collect server relative file paths
    const serverFiles = studioMergeQueue.filter(f => !f.isLocal).map(f => f.path);
    const localFiles = studioMergeQueue.filter(f => f.isLocal && f.fileBlob);

    if (localFiles.length === 0 && serverFiles.length > 0) {
      // Direct server-side merge
      const mergeEndpoint = window.apiUrl ? window.apiUrl('/api/merge') : '/api/merge';
      const res = await fetch(mergeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: serverFiles,
          saveName: saveName,
          targetFolder: targetFolder,
          action: actionType === 'save' ? 'save' : 'view'
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Server merge failed');
      }

      if (actionType === 'save') {
        const data = await res.json();
        showToast(`Saved to server: ${data.savedPath || saveName}`);
      } else {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        if (actionType === 'download') {
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = saveName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast(`Downloaded: ${saveName}`);
        } else if (actionType === 'print') {
          const win = window.open(blobUrl, '_blank');
          if (win) {
            win.onload = () => win.print();
          }
          showToast('Opened merged document for printing');
        }
      }
    } else if (typeof PDFLib !== 'undefined') {
      // Client-side PDF-Lib merge
      const mergedPdf = await PDFLib.PDFDocument.create();

      const totalDocs = studioMergeQueue.length;
      for (let i = 0; i < totalDocs; i++) {
        const item = studioMergeQueue[i];
        if (totalDocs > 2) {
          showToast(`Merging document ${i + 1} of ${totalDocs}...`);
          await new Promise(r => setTimeout(r, 0));
        }
        let pdfBytes;
        if (item.isLocal && item.fileBlob) {
          pdfBytes = await item.fileBlob.arrayBuffer();
        } else {
          const downloadEndpoint = window.apiUrl ? window.apiUrl(`/api/files/download?path=${encodeURIComponent(item.path)}`) : `/api/files/download?path=${encodeURIComponent(item.path)}`;
          const res = await fetch(downloadEndpoint);
          if (!res.ok) continue;
          pdfBytes = await res.arrayBuffer();
        }

        const doc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach(p => mergedPdf.addPage(p));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      if (actionType === 'download') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = saveName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`Downloaded: ${saveName}`);
      } else if (actionType === 'print') {
        const win = window.open(blobUrl, '_blank');
        if (win) {
          win.onload = () => win.print();
        }
        showToast('Opened merged document for printing');
      } else if (actionType === 'save') {
        showToast(`Merged file created: ${saveName}. Downloading copy...`);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = saveName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  } catch (err) {
    console.error('Merge execution error:', err);
    showToast('Merge Failed: ' + err.message, 'error');
  }
}

// ==========================================
// WORKSPACE 4: MOBILE FILE DROPZONE
// ==========================================
let transferPollTimer = null;
let transferQrCode = null;
let activeTransferNetworkMode = 'cloud'; // 'cloud' or 'local'
let cachedCloudHost = '';
let cachedLocalHost = '';

function updateTransferQrDisplay() {
  const canvas = document.getElementById('page-transfer-qr-canvas');
  if (!canvas) return;

  let host = (activeTransferNetworkMode === 'cloud' && cachedCloudHost) ? cachedCloudHost : cachedLocalHost;

  const config = JSON.parse(localStorage.getItem('pos_scanner_config') || '{}');
  if (config.mobileHost && config.mobileHost.trim().length > 0) {
    host = config.mobileHost.trim();
  }

  const transferUrl = `${host}/transfer`;

  // Update target URL label
  const urlLabel = document.getElementById('page-transfer-target-url');
  if (urlLabel) urlLabel.innerText = transferUrl;

  // Update Test button
  const testBtn = document.getElementById('page-transfer-test-btn');
  if (testBtn) {
    testBtn.onclick = () => window.open(transferUrl, '_blank');
  }

  // Update copy button
  const copyBtn = document.getElementById('page-transfer-copy-url-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(transferUrl).then(() => {
        showToast('URL copied to clipboard!');
      }).catch(() => {});
    };
  }

  // Update mode button styles
  const cloudBtn = document.getElementById('transfer-mode-cloud-btn');
  const localBtn = document.getElementById('transfer-mode-local-btn');
  if (cloudBtn && localBtn) {
    if (activeTransferNetworkMode === 'cloud' && cachedCloudHost) {
      cloudBtn.className = 'px-3 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 bg-indigo-600 text-white shadow-sm';
      localBtn.className = 'px-3 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
    } else {
      localBtn.className = 'px-3 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 bg-indigo-600 text-white shadow-sm';
      cloudBtn.className = 'px-3 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
    }
  }

  // Render QR code
  canvas.innerHTML = '';
  if (typeof QRCodeStyling !== 'undefined') {
    transferQrCode = new QRCodeStyling({
      width: 220,
      height: 220,
      data: transferUrl,
      dotsOptions: { color: '#4f46e5', type: 'rounded' },
      cornersSquareOptions: { color: '#4338ca', type: 'extra-rounded' },
      backgroundOptions: { color: '#ffffff' }
    });
    transferQrCode.append(canvas);
  }
}

function setupTransferModeButtons() {
  const cloudBtn = document.getElementById('transfer-mode-cloud-btn');
  const localBtn = document.getElementById('transfer-mode-local-btn');

  if (cloudBtn) {
    cloudBtn.onclick = () => {
      if (!cachedCloudHost) {
        showToast('No Cloud tunnel (PUBLIC_URL/ngrok) configured.', 'error');
        return;
      }
      activeTransferNetworkMode = 'cloud';
      updateTransferQrDisplay();
      showToast('QR code switched to Cloud / 4G (Any Network)');
    };
  }

  if (localBtn) {
    localBtn.onclick = () => {
      activeTransferNetworkMode = 'local';
      updateTransferQrDisplay();
      showToast('QR code switched to Local Wi-Fi');
    };
  }
}

async function renderTransferDropZoneWorkspace() {
  const canvas = document.getElementById('page-transfer-qr-canvas');
  if (!canvas) return;

  try {
    const lanEndpoint = window.apiUrl ? window.apiUrl('/api/lan-ip') : '/api/lan-ip';
    const res = await fetch(lanEndpoint);
    if (res.ok) {
      const data = await res.json();
      if (data.baseUrl) {
        cachedCloudHost = data.baseUrl.replace(/\/$/, '');
      }
      if (data.ip) {
        cachedLocalHost = `http://${data.ip}:${window.location.port || 3000}`;
      }
    }
  } catch (e) {}

  if (!cachedLocalHost) {
    cachedLocalHost = window.location.origin;
  }

  // If no cloud host detected, fallback to local
  if (!cachedCloudHost) {
    activeTransferNetworkMode = 'local';
  }

  updateTransferQrDisplay();
  setupTransferModeButtons();

  // Helper: pick an emoji icon by file extension
  function fileTypeIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map = {
      pdf:'📄', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', webp:'🖼️', bmp:'🖼️', svg:'🖼️',
      doc:'📝', docx:'📝', odt:'📝', txt:'📝',
      xls:'📊', xlsx:'📊', csv:'📊', ods:'📊',
      ppt:'📑', pptx:'📑', odp:'📑',
      zip:'🗜️', rar:'🗜️', tar:'🗜️', gz:'🗜️',
      mp3:'🎵', wav:'🎵', ogg:'🎵',
      mp4:'🎬', mov:'🎬', avi:'🎬', mkv:'🎬',
    };
    return map[ext] || '📁';
  }

  // Helper: human-friendly relative date
  function relativeTime(mtimeStr) {
    try {
      const diff = Date.now() - new Date(mtimeStr).getTime();
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' hr ago';
      return new Date(mtimeStr).toLocaleDateString(undefined, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    } catch (e) { return ''; }
  }

  // Per-file delete
  window.deleteTransferFile = async function(filename) {
    if (!confirm('Delete "' + filename + '" from the reception stream?')) return;
    try {
      const deleteEndpoint = window.apiUrl ? window.apiUrl('/api/transfer/files/' + encodeURIComponent(filename)) : '/api/transfer/files/' + encodeURIComponent(filename);
      const r = await fetch(deleteEndpoint, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) { showToast('Deleted: ' + filename); fetchUploads(); }
      else showToast(d.error || 'Delete failed', 'error');
    } catch (e) { showToast('Network error', 'error'); }
  };

  // Send PDF to Merge Studio
  window.sendTransferFileToMerge = function(filename, filePath) {
    studioMergeQueue.push({ name: filename, path: filePath, fileBlob: null, isLocal: false });
    showToast('"' + filename + '" added to Merge Studio');
    switchAppMode('merge');
  };

  // Wire "Clear Stream" button (idempotent)
  const clearBtn = document.getElementById('page-transfer-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (!confirm('Clear ALL received files from the reception stream?')) return;
      try {
        const clearEndpoint = window.apiUrl ? window.apiUrl('/api/transfer/clear') : '/api/transfer/clear';
        const r = await fetch(clearEndpoint, { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.success) { showToast('Cleared ' + d.count + ' file(s)'); fetchUploads(); }
        else showToast(d.error || 'Clear failed', 'error');
      } catch (e) { showToast('Network error', 'error'); }
    };
  }

  // Start polling uploads list
  if (transferPollTimer) clearInterval(transferPollTimer);
  async function fetchUploads() {
    try {
      const filesEndpoint = window.apiUrl ? window.apiUrl('/api/transfer/files') : '/api/transfer/files';
      const res = await fetch(filesEndpoint);
      if (!res.ok) return;
      const data = await res.json();

      const listEl  = document.getElementById('page-transfer-list');
      const countEl = document.getElementById('page-transfer-count');
      const statusText  = document.getElementById('page-transfer-status-text');
      const statusBadge = document.getElementById('page-transfer-status-badge');
      if (!listEl) return;

      const files = data.files || [];
      if (countEl) countEl.innerText = files.length + ' file' + (files.length !== 1 ? 's' : '');

      // Update status badge colour
      if (files.length > 0) {
        if (statusText) statusText.innerText = 'Connected! ' + files.length + ' file(s) in reception stream.';
        if (statusBadge) {
          statusBadge.classList.remove('bg-amber-100','text-amber-700','border-amber-300','animate-pulse');
          statusBadge.classList.add('bg-emerald-100','text-emerald-700','border-emerald-300');
        }
      } else {
        if (statusText) statusText.innerText = 'Waiting for customer mobile connection...';
        if (statusBadge) {
          statusBadge.classList.add('bg-amber-100','text-amber-700','border-amber-300','animate-pulse');
          statusBadge.classList.remove('bg-emerald-100','text-emerald-700','border-emerald-300');
        }
      }

      if (files.length === 0) {
        listEl.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 gap-3 text-center h-full">
            <div class="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 dark:text-indigo-400 flex items-center justify-center text-3xl shadow-inner">
              📥
            </div>
            <p class="text-slate-700 dark:text-slate-200 text-sm font-bold">No files received from customer phones yet</p>
            <p class="text-slate-400 text-xs max-w-sm">Scan the QR code on the left with any mobile camera to send PDFs, photos, or documents instantly.</p>
          </div>`;
        return;
      }

      listEl.innerHTML = files.map((f, idx) => {
        const icon    = fileTypeIcon(f.name);
        const isPdf   = f.name.toLowerCase().endsWith('.pdf');
        const sizeFmt = parseFloat(f.sizeMB) < 0.1
          ? (f.size / 1024).toFixed(1) + ' KB'
          : parseFloat(f.sizeMB).toFixed(2) + ' MB';
        const when    = relativeTime(f.mtime);
        const safe    = escapeHtml(f.name);
        const safeUrl = escapeHtml(f.url);

        return `<div class="p-3 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 flex items-center gap-3.5 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition group" data-file-idx="${idx}">
  <span class="text-2xl shrink-0 select-none">${icon}</span>
  <div class="flex flex-col min-w-0 flex-1">
    <span class="font-bold text-slate-800 dark:text-slate-100 truncate text-xs leading-tight" title="${safe}">${safe}</span>
    <span class="text-[10px] text-slate-400 font-mono mt-0.5">${sizeFmt} &nbsp;•&nbsp; ${when}</span>
  </div>
  <div class="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
    <a href="${safeUrl}" target="_blank"
       class="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/80 transition shadow-sm"
       title="Open / Print">View ↗</a>${isPdf ? `
    <button data-merge-idx="${idx}"
            class="px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/80 text-violet-600 dark:text-violet-400 font-bold text-xs hover:bg-violet-100 dark:hover:bg-violet-900/80 transition shadow-sm"
            title="Send to Merge Studio">Merge ✨</button>` : ''}
    <button data-delete-idx="${idx}"
            class="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition"
            title="Delete file from uploads">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
      </svg>
    </button>
  </div>
</div>`;
      }).join('');

      // Event delegation — handles all delete and merge buttons safely (works with any filename)
      listEl.onclick = async (ev) => {
        const delBtn   = ev.target.closest('[data-delete-idx]');
        const mergeBtn = ev.target.closest('[data-merge-idx]');
        if (delBtn) {
          const f = files[parseInt(delBtn.dataset.deleteIdx, 10)];
          if (!f) return;
          if (!confirm('Delete "' + f.name + '" from the reception stream?')) return;
          try {
            const r = await fetch('/api/transfer/files/' + encodeURIComponent(f.name), { method: 'DELETE' });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.success) { showToast('Deleted: ' + f.name); fetchUploads(); }
            else showToast(d.error || 'Delete failed', 'error');
          } catch (e) { showToast('Network error', 'error'); }
        }
        if (mergeBtn) {
          const f = files[parseInt(mergeBtn.dataset.mergeIdx, 10)];
          if (!f) return;
          studioMergeQueue.push({ name: f.name, path: f.path, fileBlob: null, isLocal: false });
          showToast('"' + f.name + '" added to Merge Studio');
          switchAppMode('merge');
        }
      };

    } catch (e) {
      console.warn('Transfer poll error:', e);
    }
  }

  fetchUploads();
  transferPollTimer = setInterval(fetchUploads, 2500);
}
window.renderTransferDropZoneWorkspace = renderTransferDropZoneWorkspace;

// ==========================================
// WORKSPACE 5: SETTINGS & HARDWARE CONFIG
// ==========================================
function playAudioBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1200;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

function renderSettingsWorkspace() {
  const config = JSON.parse(localStorage.getItem('pos_scanner_config') || '{}');
  const thresh = document.getElementById('settings-threshold-input');
  const minLen = document.getElementById('settings-min-len-input');
  const suffix = document.getElementById('settings-suffix-select');
  const sound = document.getElementById('settings-sound-toggle');
  const host = document.getElementById('settings-host-input');

  if (thresh) thresh.value = config.thresholdMs || 50;
  if (minLen) minLen.value = config.minLen || 4;
  if (suffix) suffix.value = config.suffix || 'Enter';
  if (sound) sound.checked = config.soundEnabled !== false;
  if (host && !host.value) host.value = config.mobileHost || window.location.origin;

  // Save Button
  const saveBtn = document.getElementById('settings-save-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const newConfig = {
        thresholdMs: parseInt(document.getElementById('settings-threshold-input')?.value, 10) || 50,
        minLen: parseInt(document.getElementById('settings-min-len-input')?.value, 10) || 4,
        suffix: document.getElementById('settings-suffix-select')?.value || 'Enter',
        soundEnabled: document.getElementById('settings-sound-toggle')?.checked !== false,
        mobileHost: (document.getElementById('settings-host-input')?.value || '').trim()
      };
      localStorage.setItem('pos_scanner_config', JSON.stringify(newConfig));
      showToast('Hardware & network settings saved!');
    };
  }
}
window.renderSettingsWorkspace = renderSettingsWorkspace;

// ==========================================
// WORKSPACE 6: CUSTOMER DEBT & CREDIT LEDGER
// ==========================================
let activeDebtFilter = 'all';

async function renderDebtsWorkspace() {
  if (window.FlexiDB && window.FlexiDB.init) {
    try { await window.FlexiDB.init(); } catch (e) {}
  }
  if (!window.DebtService) return;

  try {
    const customers = await window.DebtService.getAllCustomers();

    // Compute aggregate KPIs
    const totalOutstanding = customers.reduce((sum, c) => sum + (c.totalRemaining || 0), 0);
    const activeCustomersCount = customers.filter(c => c.totalRemaining > 0).length;
    const totalOpenDebts = customers.reduce((sum, c) => sum + (c.openCount || 0), 0);

    // Update KPI Card Displays
    const elOutstanding = document.getElementById('debts-stat-total-outstanding');
    const elActiveCust = document.getElementById('debts-stat-active-customers');
    const elOpenDebts = document.getElementById('debts-stat-open-debts');

    if (elOutstanding) elOutstanding.innerText = `${Math.round(totalOutstanding).toLocaleString('fr-DZ')} DA`;
    if (elActiveCust) elActiveCust.innerText = `${activeCustomersCount} client(s)`;
    if (elOpenDebts) elOpenDebts.innerText = `${totalOpenDebts} créance(s)`;

    // Refresh badges
    await window.DebtService.refreshDebtBadge();

    // Filter customers
    const searchVal = (document.getElementById('debts-search-input')?.value || '').toLowerCase().trim();
    const filtered = customers.filter(c => {
      if (activeDebtFilter === 'unpaid' && c.totalRemaining <= 0) return false;
      if (activeDebtFilter === 'settled' && c.totalRemaining > 0) return false;
      if (!searchVal) return true;
      return (c.name || '').toLowerCase().includes(searchVal) || (c.phone || '').toLowerCase().includes(searchVal);
    });

    const tbody = document.getElementById('debts-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-8 text-center text-slate-400 text-xs">
            Aucun client ou créance correspondant.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const oldestStr = c.oldestDebtDate
        ? new Date(c.oldestDebtDate).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
      const isOverdue = c.totalRemaining > 0;

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
          <td class="p-3.5">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-black text-xs flex items-center justify-center shrink-0">
                ${escapeHtml((c.name || 'C').charAt(0).toUpperCase())}
              </div>
              <div class="flex flex-col min-w-0">
                <span class="font-bold text-slate-800 dark:text-slate-100 text-xs truncate">${escapeHtml(c.name)}</span>
                <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(c.phone || 'Pas de numéro')}</span>
              </div>
            </div>
          </td>
          <td class="p-3.5 text-right font-mono text-slate-500 text-xs">
            ${Number(c.totalOwed).toFixed(2)} DA
          </td>
          <td class="p-3.5 text-right">
            <div class="flex flex-col items-end">
              <span class="font-mono font-black text-xs ${c.isSleeping ? 'text-amber-600 dark:text-amber-400' : (isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}">
                ${Number(c.totalRemaining).toFixed(2)} DA
              </span>
              <span class="text-[10px] text-slate-400 font-mono">
                Plafond: ${c.debtLimit > 0 ? Number(c.debtLimit).toFixed(0) + ' DA' : 'Illimité'}
              </span>
              ${c.debtLimit > 0 ? `
                <div class="w-20 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1 overflow-hidden" title="${Math.round((c.totalRemaining / c.debtLimit) * 100)}% du plafond">
                  <div class="h-full ${c.isSleeping ? 'bg-amber-500' : 'bg-indigo-500'}" style="width: ${Math.min(100, Math.round((c.totalRemaining / c.debtLimit) * 100))}%"></div>
                </div>
              ` : ''}
              ${c.openCount > 0 ? `<span class="block text-[9px] text-slate-400 mt-0.5">${c.openCount} créance${c.openCount > 1 ? 's' : ''}</span>` : ''}
            </div>
          </td>
          <td class="p-3.5 text-center font-mono text-[11px] text-slate-500">
            ${oldestStr}
          </td>
          <td class="p-3.5 text-center">
            ${c.isSleeping
              ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse flex items-center gap-1 justify-center"><span>😴</span> <span>EN VEILLE</span></span>'
              : (isOverdue
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">NON SOLDÉ</span>'
                : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">SOLDÉ</span>')}
          </td>
          <td class="p-3.5 text-right">
            <div class="flex items-center justify-end gap-1.5">
              ${isOverdue ? `
                <button onclick="openCustomerQuickPaymentModal('${escapeHtml(String(c.id))}')" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1" title="Encaisser un versement">
                  <span>💵</span> <span>Encaisser</span>
                </button>
              ` : ''}
              <button onclick="openCustomerDetailModal('${escapeHtml(String(c.id))}')" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1" title="Voir l'historique complet">
                <span>📋</span> <span>Détails</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Debts workspace render error:', err);
  }
}
window.renderDebtsWorkspace = renderDebtsWorkspace;

// Customer Detail Modal
async function openCustomerDetailModal(customerId) {
  if (!window.DebtService) return;
  try {
    const data = await window.DebtService.getCustomerById(customerId);
    if (!data || !data.customer) {
      showToast('Client introuvable', 'error');
      return;
    }
    const { customer, debts } = data;
    const modal = document.getElementById('debt-customer-modal');
    if (!modal) return;

    document.getElementById('debt-modal-cust-name').innerText = customer.name;
    document.getElementById('debt-modal-cust-phone').innerText = customer.phone || 'Aucun numéro';
    
    const totalRemaining = debts.filter(d => d.status === 'open').reduce((s, d) => s + (d.remainingAmount || 0), 0);
    const totalOwed = debts.reduce((s, d) => s + (d.amount || 0), 0);
    const totalPaid = totalOwed - totalRemaining;

    document.getElementById('debt-modal-cust-remaining').innerText = `${Number(totalRemaining).toFixed(2)} DA`;
    document.getElementById('debt-modal-cust-total-owed').innerText = `${Number(totalOwed).toFixed(2)} DA`;
    document.getElementById('debt-modal-cust-total-paid').innerText = `${Number(totalPaid).toFixed(2)} DA`;

    // Customer Limit and Sleep Status in Details Modal
    const limitEl = document.getElementById('debt-modal-cust-limit');
    if (limitEl) {
      limitEl.innerText = customer.debtLimit > 0 ? `${Number(customer.debtLimit).toFixed(2)} DA` : 'Illimité';
    }
    const badgeEl = document.getElementById('debt-modal-cust-status-badge');
    if (badgeEl) {
      if (customer.status === 'sleeping' || (customer.debtLimit > 0 && totalRemaining >= customer.debtLimit)) {
        badgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 animate-pulse';
        badgeEl.innerText = '😴 En Veille (Plafond Atteint)';
      } else {
        badgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300';
        badgeEl.innerText = '🟢 Actif';
      }
    }
    const editBtn = document.getElementById('debt-modal-edit-profile-btn');
    if (editBtn) {
      editBtn.onclick = () => {
        document.getElementById('debt-customer-modal')?.classList.add('hidden');
        openCreateCustomerModal(customer);
      };
    }
    const printStmtBtn = document.getElementById('debt-modal-print-stmt-btn');
    if (printStmtBtn) {
      printStmtBtn.onclick = () => {
        printCustomerStatement(customer.id);
      };
    }
    const deleteCustBtn = document.getElementById('debt-modal-delete-cust-btn');
    if (deleteCustBtn) {
      deleteCustBtn.onclick = async () => {
        if (!confirm(`Confirmez-vous la suppression définitive du client "${customer.name}" ?`)) return;
        try {
          await window.DebtService.deleteCustomer(customer.id);
          showToast(`Client "${customer.name}" supprimé.`);
          document.getElementById('debt-customer-modal')?.classList.add('hidden');
          await renderDebtsWorkspace();
          if (window.DebtService?.refreshDebtBadge) {
            await window.DebtService.refreshDebtBadge();
          }
        } catch (e) {
          showToast(e.message, 'error');
        }
      };
    }

    const container = document.getElementById('debt-modal-debts-list');
    if (container) {
      if (debts.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-center py-6 text-xs">Aucune dette enregistrée pour ce client.</div>';
      } else {
        container.innerHTML = debts.map(de => {
          const dateStr = new Date(de.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          const isOpen = de.status === 'open';
          const isWrittenOff = de.status === 'written_off';
          const statusBadge = isOpen
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">Reste: ${Number(de.remainingAmount).toFixed(2)} DA</span>`
            : isWrittenOff
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Passé en pertes</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">Entièrement soldé</span>`;

          const paymentsHtml = (de.payments && de.payments.length > 0)
            ? `<div class="mt-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-1 text-[11px]">
                <span class="font-bold text-slate-500 text-[10px] uppercase">Historique des versements :</span>
                ${de.payments.map(p => `
                  <div class="flex items-center justify-between text-slate-600 dark:text-slate-300 font-mono">
                    <span>${new Date(p.paidAt).toLocaleDateString()} ${p.note ? '— <em class="text-slate-400 font-sans">' + escapeHtml(p.note) + '</em>' : ''}</span>
                    <span class="font-bold text-emerald-600">+${Number(p.amount).toFixed(2)} DA</span>
                  </div>
                `).join('')}
              </div>`
            : '';

          return `
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-bold text-xs text-slate-800 dark:text-slate-100">
                    ${de.orderRef ? 'Vente ' + escapeHtml(de.orderRef) : (de.note ? escapeHtml(de.note) : 'Créance manuelle')}
                  </span>
                  ${statusBadge}
                </div>
                <div class="flex items-center gap-2 font-mono text-xs">
                  <span class="text-slate-400">Montant :</span>
                  <span class="font-bold text-slate-700 dark:text-slate-200">${Number(de.amount).toFixed(2)} DA</span>
                </div>
              </div>

              <div class="flex items-center justify-between text-[11px] text-slate-400">
                <span>Date : ${dateStr}</span>
                <div class="flex items-center gap-2">
                  ${isOpen ? `
                    <button onclick="openRecordPaymentModal('${escapeHtml(String(de.id))}', ${de.remainingAmount}, '${escapeHtml(customer.name)}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition">
                      Encaisser un versement
                    </button>
                    <button onclick="handleWriteOffDebt('${escapeHtml(String(de.id))}', '${escapeHtml(String(customer.id))}')" class="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950 text-slate-600 dark:text-slate-300 hover:text-rose-600 text-xs transition" title="Passer en perte irrécouvrable">
                      Passer en perte
                    </button>
                  ` : (isWrittenOff ? `
                    <button onclick="handleReverseWriteOff('${escapeHtml(String(de.id))}', '${escapeHtml(String(customer.id))}')" class="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold transition">
                      Restaurer la dette
                    </button>
                  ` : '')}
                </div>
              </div>

              ${paymentsHtml}
            </div>
          `;
        }).join('');
      }
    }

    modal.classList.remove('hidden');
  } catch (err) {
    console.error('Customer detail error:', err);
    showToast('Erreur détails client: ' + err.message, 'error');
  }
}
window.openCustomerDetailModal = openCustomerDetailModal;

// Quick payment / Lump-Sum payment for customer
let currentPaymentCustomerId = null;
let currentPaymentDebtId = null;

async function openCustomerQuickPaymentModal(customerId) {
  if (!window.DebtService) return;
  const data = await window.DebtService.getCustomerById(customerId);
  if (!data || !data.debts) return;
  const openDebts = data.debts.filter(d => d.status === 'open');
  if (openDebts.length === 0) {
    showToast('Aucune dette en cours pour ce client !');
    return;
  }
  const totalRemaining = openDebts.reduce((s, d) => s + (d.remainingAmount || 0), 0);
  currentPaymentCustomerId = customerId;
  currentPaymentDebtId = null; // null indicates Lump-sum FIFO

  const modal = document.getElementById('debt-payment-modal');
  if (!modal) return;

  const nameEl = document.getElementById('debt-pay-customer-name');
  const maxDisp = document.getElementById('debt-pay-max-display');
  const amountInput = document.getElementById('debt-pay-amount-input');
  const noteInput = document.getElementById('debt-pay-note-input');

  if (nameEl) nameEl.innerText = `${data.customer.name} (Versement Global)`;
  if (maxDisp) maxDisp.innerText = `${Number(totalRemaining).toFixed(2)} DA`;
  if (amountInput) {
    amountInput.value = Number(totalRemaining).toFixed(2);
    amountInput.max = totalRemaining;
  }
  if (noteInput) noteInput.value = '';

  modal.classList.remove('hidden');
  amountInput?.focus();
}
window.openCustomerQuickPaymentModal = openCustomerQuickPaymentModal;

// Record Payment Modal for a single debt ticket
function openRecordPaymentModal(debtId, maxAmount, customerName) {
  currentPaymentDebtId = debtId;
  currentPaymentCustomerId = null;
  const modal = document.getElementById('debt-payment-modal');
  if (!modal) return;

  const nameEl = document.getElementById('debt-pay-customer-name');
  const maxDisp = document.getElementById('debt-pay-max-display');
  const amountInput = document.getElementById('debt-pay-amount-input');
  const noteInput = document.getElementById('debt-pay-note-input');

  if (nameEl) nameEl.innerText = customerName ? `${customerName} (Ticket spécifique)` : '';
  if (maxDisp) maxDisp.innerText = `${Number(maxAmount).toFixed(2)} DA`;
  if (amountInput) {
    amountInput.value = Number(maxAmount).toFixed(2);
    amountInput.max = maxAmount;
  }
  if (noteInput) noteInput.value = '';

  modal.classList.remove('hidden');
  amountInput?.focus();
}
window.openRecordPaymentModal = openRecordPaymentModal;

async function confirmPaymentRecord() {
  if (!window.DebtService) return;
  const amountInput = document.getElementById('debt-pay-amount-input');
  const noteInput = document.getElementById('debt-pay-note-input');
  const amount = parseFloat(amountInput?.value) || 0;
  const note = (noteInput?.value || '').trim();

  if (amount <= 0) {
    showToast('Veuillez saisir un montant supérieur à 0 DA', 'error');
    return;
  }

  try {
    let updated;
    if (currentPaymentCustomerId) {
      // FIFO Lump sum payment
      updated = await window.DebtService.recordCustomerLumpSumPayment(currentPaymentCustomerId, amount, note);
      document.getElementById('debt-payment-modal')?.classList.add('hidden');
      if (updated.awakened) {
        showToast(`🎉 Client ${updated.customerName || ''} réactivé ! Le solde est repassé sous le plafond.`);
      } else {
        showToast(`Versement global de ${amount.toFixed(2)} DA validé (${updated.paymentsCount} créance(s) imputée(s)) !`);
      }
      const custModal = document.getElementById('debt-customer-modal');
      if (custModal && !custModal.classList.contains('hidden')) {
        await openCustomerDetailModal(currentPaymentCustomerId);
      }
    } else if (currentPaymentDebtId) {
      // Specific debt ticket payment
      updated = await window.DebtService.recordPayment({
        debtId: currentPaymentDebtId,
        amount: amount,
        note: note
      });
      document.getElementById('debt-payment-modal')?.classList.add('hidden');
      if (updated.awakened) {
        showToast(`🎉 Client ${updated.customerName || ''} réactivé ! Le solde est repassé sous le plafond.`);
      } else {
        showToast(`Versement de ${amount.toFixed(2)} DA enregistré avec succès !`);
      }
      const custModal = document.getElementById('debt-customer-modal');
      if (custModal && !custModal.classList.contains('hidden') && updated.customerId) {
        await openCustomerDetailModal(updated.customerId);
      }
    }

    await renderDebtsWorkspace();
    if (window.DebtService?.refreshDebtBadge) {
      await window.DebtService.refreshDebtBadge();
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}
window.confirmPaymentRecord = confirmPaymentRecord;

async function handleWriteOffDebt(debtId, customerId) {
  if (!confirm('Confirmez-vous le passage en perte de cette dette ?')) return;
  try {
    await window.DebtService.writeOffDebt(debtId);
    showToast('Dette passée en pertes.');
    if (customerId) await openCustomerDetailModal(customerId);
    await renderDebtsWorkspace();
    if (window.DebtService?.refreshDebtBadge) {
      await window.DebtService.refreshDebtBadge();
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}
window.handleWriteOffDebt = handleWriteOffDebt;

async function handleReverseWriteOff(debtId, customerId) {
  if (!confirm('Voulez-vous restaurer cette dette passée en perte ?')) return;
  try {
    await window.DebtService.reverseWriteOff(debtId);
    showToast('Dette restaurée avec succès !');
    if (customerId) await openCustomerDetailModal(customerId);
    await renderDebtsWorkspace();
    if (window.DebtService?.refreshDebtBadge) {
      await window.DebtService.refreshDebtBadge();
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}
window.handleReverseWriteOff = handleReverseWriteOff;

async function printCustomerStatement(customerId) {
  if (!window.DebtService) return;
  try {
    const data = await window.DebtService.getCustomerById(customerId);
    if (!data) return;
    const { customer, debts } = data;
    const openDebts = debts.filter(d => d.status === 'open');
    const totalRemaining = openDebts.reduce((s, d) => s + (d.remainingAmount || 0), 0);
    const totalOwed = debts.reduce((s, d) => s + (d.amount || 0), 0);
    const totalPaid = totalOwed - totalRemaining;

    const printHtml = `
      <div style="font-family: 'Courier New', Courier, monospace; width: 72mm; margin: 0 auto; padding: 6px; font-size: 11px; line-height: 1.3; color: #000; background: #fff;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 8px;">
          <h2 style="margin: 0; font-size: 15px; font-weight: bold;">MILLORA PRINT & POS</h2>
          <p style="margin: 2px 0; font-size: 10px; font-weight: bold;">RELEVÉ DE COMPTE CLIENT</p>
          <p style="margin: 2px 0; font-size: 9px;">Date : ${new Date().toLocaleString()}</p>
        </div>

        <div style="margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px; font-size: 10px;">
          <p style="margin: 2px 0;"><strong>Client :</strong> ${escapeHtml(customer.name)}</p>
          <p style="margin: 2px 0;"><strong>Téléphone :</strong> ${escapeHtml(customer.phone || 'Non renseigné')}</p>
          <p style="margin: 2px 0;"><strong>Plafond autorisé :</strong> ${customer.debtLimit > 0 ? customer.debtLimit.toFixed(2) + ' DA' : 'Illimité'}</p>
        </div>

        <div style="margin-bottom: 8px;">
          <p style="margin: 2px 0; font-weight: bold; font-size: 10px;">CRÉANCES EN COURS (${openDebts.length}) :</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 9px; margin-top: 4px;">
            <thead>
              <tr style="border-bottom: 1px solid #000;">
                <th style="text-align: left; padding: 2px 0;">Réf/Date</th>
                <th style="text-align: right; padding: 2px 0;">Total</th>
                <th style="text-align: right; padding: 2px 0;">Reste</th>
              </tr>
            </thead>
            <tbody>
              ${openDebts.map(d => `
                <tr>
                  <td style="padding: 2px 0;">
                    ${escapeHtml(d.orderRef || 'Créance')}<br>
                    <span style="font-size: 8px; color: #555;">${new Date(d.createdAt).toLocaleDateString()}</span>
                  </td>
                  <td style="text-align: right; padding: 2px 0;">${Number(d.amount).toFixed(2)}</td>
                  <td style="text-align: right; padding: 2px 0; font-weight: bold;">${Number(d.remainingAmount).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="border-top: 2px dashed #000; padding-top: 6px; margin-top: 8px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin: 2px 0;">
            <span>Total Emprunté:</span>
            <strong>${totalOwed.toFixed(2)} DA</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin: 2px 0;">
            <span>Total Remboursé:</span>
            <strong>${totalPaid.toFixed(2)} DA</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin: 4px 0 0 0; font-size: 13px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px;">
            <span>SOLDE RESTANT DÛ:</span>
            <span>${totalRemaining.toFixed(2)} DA</span>
          </div>
        </div>

        <div style="text-align: center; margin-top: 12px; border-top: 1px dashed #000; padding-top: 6px; font-size: 9px;">
          <p style="margin: 2px 0; font-weight: bold;">MERCI POUR VOTRE CONFIANCE !</p>
          <p style="margin: 2px 0;">Millora POS 100% Hors-Ligne</p>
        </div>
      </div>
    `;

    const printArea = document.getElementById('print-area');
    if (printArea) {
      printArea.innerHTML = printHtml;
      setTimeout(() => { window.print(); }, 250);
    }
  } catch (err) {
    showToast('Erreur impression relevé: ' + err.message, 'error');
  }
}
window.printCustomerStatement = printCustomerStatement;

// ── STANDALONE CUSTOMER CREATION & EDIT MODAL ─────────────────────────────
function openCreateCustomerModal(customerToEdit = null) {
  const modal = document.getElementById('debt-customer-create-modal');
  if (!modal) return;

  const title = document.getElementById('debt-customer-create-title');
  const idInput = document.getElementById('debt-cust-edit-id');
  const nameInput = document.getElementById('debt-cust-name-input');
  const phoneInput = document.getElementById('debt-cust-phone-input');
  const limitInput = document.getElementById('debt-cust-limit-input');
  const notesInput = document.getElementById('debt-cust-notes-input');
  const saveBtnText = document.getElementById('debt-cust-save-btn-text');

  if (customerToEdit) {
    if (title) title.innerText = 'Modifier la Fiche Client';
    if (idInput) idInput.value = customerToEdit.id;
    if (nameInput) nameInput.value = customerToEdit.name || '';
    if (phoneInput) phoneInput.value = customerToEdit.phone || '';
    if (limitInput) limitInput.value = customerToEdit.debtLimit || 0;
    if (notesInput) notesInput.value = customerToEdit.notes || '';
    if (saveBtnText) saveBtnText.innerText = 'Mettre à Jour';
  } else {
    if (title) title.innerText = 'Nouveau Client';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (limitInput) limitInput.value = '0';
    if (notesInput) notesInput.value = '';
    if (saveBtnText) saveBtnText.innerText = 'Enregistrer le Client';
  }

  modal.classList.remove('hidden');
  nameInput?.focus();
}
window.openCreateCustomerModal = openCreateCustomerModal;

function closeCreateCustomerModal() {
  document.getElementById('debt-customer-create-modal')?.classList.add('hidden');
}
window.closeCreateCustomerModal = closeCreateCustomerModal;

async function handleSaveCustomer() {
  if (!window.DebtService) return;
  const id = document.getElementById('debt-cust-edit-id')?.value;
  const name = (document.getElementById('debt-cust-name-input')?.value || '').trim();
  const phone = (document.getElementById('debt-cust-phone-input')?.value || '').trim();
  const debtLimit = Math.max(0, parseFloat(document.getElementById('debt-cust-limit-input')?.value) || 0);
  const notes = (document.getElementById('debt-cust-notes-input')?.value || '').trim();

  if (!name) {
    showToast('Le nom du client est obligatoire !', 'error');
    return;
  }

  try {
    if (id) {
      await window.DebtService.updateCustomer(id, { name, phone, debtLimit, notes });
      showToast(`Fiche de ${name} mise à jour avec succès !`);
    } else {
      await window.DebtService.createCustomer({ name, phone, debtLimit, notes });
      showToast(`Client ${name} créé avec succès !`);
    }
    closeCreateCustomerModal();
    await renderDebtsWorkspace();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
window.handleSaveCustomer = handleSaveCustomer;

// ── MANUAL DEBT MODAL WITH AUTOCOMPLETE & SLEEP MODE CHECK ────────────────
let manualDebtLoadedCustomers = [];
async function openManualDebtModal() {
  const modal = document.getElementById('debt-manual-modal');
  if (!modal) return;
  const nameInput = document.getElementById('debt-manual-name');
  const phoneInput = document.getElementById('debt-manual-phone');
  const amountInput = document.getElementById('debt-manual-amount');
  const paidInput = document.getElementById('debt-manual-paid-now');
  const noteInput = document.getElementById('debt-manual-note');
  const statusCard = document.getElementById('debt-manual-customer-status-card');
  const newLimitCont = document.getElementById('debt-manual-new-limit-container');
  const newLimitInput = document.getElementById('debt-manual-new-limit');
  const saveBtn = document.getElementById('debts-save-manual-btn');

  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (amountInput) amountInput.value = '';
  if (paidInput) paidInput.value = '0';
  if (noteInput) noteInput.value = '';
  if (newLimitInput) newLimitInput.value = '0';
  if (statusCard) statusCard.classList.add('hidden');
  if (newLimitCont) newLimitCont.classList.add('hidden');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  try {
    manualDebtLoadedCustomers = await window.DebtService?.getAllCustomers() || [];
    const datalist = document.getElementById('debt-manual-customers-list');
    if (datalist && manualDebtLoadedCustomers) {
      datalist.innerHTML = manualDebtLoadedCustomers.map(c =>
        `<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone || '')}${c.isSleeping ? ' [⚠️ EN VEILLE - Plafond]' : ''}</option>`
      ).join('');
    }
  } catch (e) {}

  const evaluateManualCustomer = () => {
    const typed = (nameInput?.value || '').trim().toLowerCase();
    const total = Math.max(0, parseFloat(amountInput?.value) || 0);
    const paid = Math.max(0, parseFloat(paidInput?.value) || 0);
    const remainingForThisDebt = Math.max(0, total - paid);

    if (!typed) {
      statusCard?.classList.add('hidden');
      newLimitCont?.classList.add('hidden');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      return;
    }

    const match = manualDebtLoadedCustomers.find(c =>
      c.name.toLowerCase() === typed || (c.phone && c.phone.toLowerCase() === typed)
    );

    if (match) {
      if (phoneInput && !phoneInput.value) phoneInput.value = match.phone || '';
      statusCard?.classList.remove('hidden');
      newLimitCont?.classList.add('hidden');

      document.getElementById('debt-manual-card-cust-name').innerText = match.name;
      document.getElementById('debt-manual-card-owed').innerText = `${match.totalRemaining.toFixed(2)} DA`;
      const limitStr = match.debtLimit > 0 ? `${match.debtLimit.toFixed(2)} DA` : 'Illimité';
      document.getElementById('debt-manual-card-limit').innerText = limitStr;

      const badge = document.getElementById('debt-manual-card-badge');
      const sleepWarn = document.getElementById('debt-manual-card-sleep-warning');

      const willExceed = match.debtLimit > 0 && (match.totalRemaining + remainingForThisDebt) > match.debtLimit;

      if (match.isSleeping || willExceed) {
        if (badge) {
          badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse';
          badge.innerText = '😴 EN VEILLE';
        }
        if (sleepWarn) {
          sleepWarn.classList.remove('hidden');
          sleepWarn.innerHTML = `<span>😴</span> <span>Client en Mode Veille ! Dette (${match.totalRemaining.toFixed(0)} DA) + montant (${remainingForThisDebt.toFixed(0)} DA) dépasse le plafond (${match.debtLimit.toFixed(0)} DA). Règlement requis.</span>`;
        }
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
      } else {
        if (badge) {
          badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700';
          badge.innerText = '🟢 Actif';
        }
        if (sleepWarn) sleepWarn.classList.add('hidden');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }
    } else {
      // New customer
      statusCard?.classList.add('hidden');
      newLimitCont?.classList.remove('hidden');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }
  };

  if (nameInput) nameInput.oninput = evaluateManualCustomer;
  if (amountInput) amountInput.oninput = evaluateManualCustomer;
  if (paidInput) paidInput.oninput = evaluateManualCustomer;

  modal.classList.remove('hidden');
  nameInput?.focus();
}
window.openManualDebtModal = openManualDebtModal;

async function saveManualDebt() {
  if (!window.DebtService) return;
  const name = (document.getElementById('debt-manual-name')?.value || '').trim();
  const phone = (document.getElementById('debt-manual-phone')?.value || '').trim();
  const amount = parseFloat(document.getElementById('debt-manual-amount')?.value) || 0;
  const paidNow = parseFloat(document.getElementById('debt-manual-paid-now')?.value) || 0;
  const newLimit = parseFloat(document.getElementById('debt-manual-new-limit')?.value) || 0;
  const note = (document.getElementById('debt-manual-note')?.value || '').trim();

  if (!name) {
    showToast('Le nom du client est obligatoire !', 'error');
    return;
  }
  if (amount <= 0) {
    showToast('Le montant total doit être supérieur à zéro !', 'error');
    return;
  }
  if (paidNow > amount) {
    showToast('L\'acompte ne peut pas dépasser le montant total !', 'error');
    return;
  }

  try {
    const { customer } = await window.DebtService.findOrCreateCustomer(name, phone, newLimit);
    await window.DebtService.recordDebt({
      customerId: customer.id,
      amount: amount,
      amountPaidNow: paidNow,
      note: note || 'Créance manuelle'
    });

    document.getElementById('debt-manual-modal')?.classList.add('hidden');
    showToast(`Créance enregistrée pour ${customer.name} (${(amount - paidNow).toFixed(2)} DA restant)`);
    await renderDebtsWorkspace();
  } catch (err) {
    showToast('Erreur lors de l\'enregistrement de la créance : ' + err.message, 'error');
  }
}
window.saveManualDebt = saveManualDebt;

// ==========================================
// WORKSPACE: SETTINGS & TERMINAL ID
// ==========================================
function renderSettingsWorkspace() {
  const terminalInput = document.getElementById('settings-terminal-id-input');
  if (terminalInput) {
    terminalInput.value = localStorage.getItem('pos_terminal_id') || 'REG-01';
  }
}
window.renderSettingsWorkspace = renderSettingsWorkspace;

function saveTerminalIdSetting() {
  const input = document.getElementById('settings-terminal-id-input');
  const val = (input?.value || '').trim().toUpperCase() || 'REG-01';
  localStorage.setItem('pos_terminal_id', val);
  if (input) input.value = val;
  if (window.POS?.updateSyncBadge) {
    window.POS.updateSyncBadge();
  }
  showToast(`Identifiant de caisse enregistré : ${val}`);
}
window.saveTerminalIdSetting = saveTerminalIdSetting;

// ==========================================
// WORKSPACE: SUPPLIERS & PURCHASE ORDERS
// ==========================================
let currentSuppliersSubTab = 'orders';

function switchSuppliersSubTab(tab) {
  currentSuppliersSubTab = tab;
  const btnOrders = document.getElementById('suppliers-tab-btn-orders');
  const btnList = document.getElementById('suppliers-tab-btn-list');
  const subOrders = document.getElementById('suppliers-subview-orders');
  const subList = document.getElementById('suppliers-subview-list');

  if (tab === 'orders') {
    if (btnOrders) btnOrders.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-indigo-600 text-white shadow-sm';
    if (btnList) btnList.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200';
    if (subOrders) subOrders.classList.remove('hidden');
    if (subList) subList.classList.add('hidden');
  } else {
    if (btnOrders) btnOrders.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200';
    if (btnList) btnList.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-indigo-600 text-white shadow-sm';
    if (subOrders) subOrders.classList.add('hidden');
    if (subList) subList.classList.remove('hidden');
  }
}
window.switchSuppliersSubTab = switchSuppliersSubTab;

async function renderSuppliersWorkspace() {
  if (!window.SupplierService) return;
  try {
    const [suppliers, orders] = await Promise.all([
      window.SupplierService.getAllSuppliers(),
      window.SupplierService.getAllPurchaseOrders()
    ]);

    // Update KPIs
    const kpiCount = document.getElementById('suppliers-kpi-count');
    const kpiPending = document.getElementById('suppliers-kpi-pending-po');
    const kpiTotal = document.getElementById('suppliers-kpi-total-orders');

    if (kpiCount) kpiCount.innerText = suppliers.length;
    if (kpiPending) kpiPending.innerText = orders.filter(o => o.status === 'pending').length;
    if (kpiTotal) kpiTotal.innerText = orders.length;

    // 1. Render Purchase Orders & Invoices Table
    const poLabel = document.getElementById('po-count-label');
    if (poLabel) poLabel.innerText = `${orders.length} commande(s) & facture(s)`;

    const poTableBody = document.getElementById('purchase-orders-table-body');
    if (poTableBody) {
      if (orders.length === 0) {
        poTableBody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400 text-xs">Aucune commande ou facture enregistrée.</td></tr>';
      } else {
        poTableBody.innerHTML = orders.map(po => {
          const dateStr = po.createdAt ? new Date(po.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : (po.expectedDate || '');
          const isPending = po.status === 'pending';
          const isReceived = po.status === 'received';
          const isScanIQ = po.source === 'scaniq' || po.type === 'scaniq';

          const statusBadge = isScanIQ
            ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700">⚡ FACTURE SCANÉE</span>'
            : (isPending
            ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse">🟡 EN ATTENTE</span>'
            : isReceived
            ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">🟢 RÉCEPTIONNÉ</span>'
            : '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">⚪ ANNULÉ</span>');

          const safeId = escapeHtml(String(po.id));

          return `
            <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition text-xs">
              <td class="p-3.5 font-mono font-bold text-slate-900 dark:text-slate-100">
                <div class="flex items-center gap-1.5">
                  <span>${isScanIQ ? '⚡' : '📦'}</span>
                  <span>${escapeHtml(po.orderRef || 'DZ-PO')}</span>
                </div>
              </td>
              <td class="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                <div class="flex items-center gap-1.5">
                  <span class="text-slate-400">🏭</span>
                  <span>${escapeHtml(po.supplierName || 'Fournisseur')}</span>
                </div>
              </td>
              <td class="p-3.5 text-slate-500 font-mono text-[11px]">${dateStr}</td>
              <td class="p-3.5 text-center font-bold">${po.itemsCount || po.itemCount || po.totalOrdered || 0} article(s)</td>
              <td class="p-3.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">${Number(po.totalAmount || po.totalEstimatedAmount || 0).toFixed(2)} DA</td>
              <td class="p-3.5 text-center">${statusBadge}</td>
              <td class="p-3.5 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <button onclick="openOrderDetailsModal('${safeId}')" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1" title="Voir les détails">
                    <span>👁️</span> <span>Détails</span>
                  </button>
                  ${isPending ? `
                    <button onclick="openReceiveDeliveryModal('${safeId}')" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1" title="Réceptionner la livraison">
                      <span>🚚</span> <span>Réceptionner</span>
                    </button>
                    <button onclick="handleCancelPurchaseOrder('${safeId}')" class="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-xs transition" title="Annuler commande">
                      ✕
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 2. Render Suppliers Directory Table with Total Purchases
    const supLabel = document.getElementById('suppliers-count-label');
    if (supLabel) supLabel.innerText = `${suppliers.length} fournisseur(s)`;

    const supTableBody = document.getElementById('suppliers-table-body');
    if (supTableBody) {
      if (suppliers.length === 0) {
        supTableBody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400 text-xs">Aucun fournisseur enregistré. Scannez une facture ou cliquez sur "Ajouter Fournisseur".</td></tr>';
      } else {
        supTableBody.innerHTML = suppliers.map(s => {
          const pendingOrders = s.pendingOrdersCount || 0;
          const safeId = escapeHtml(String(s.id));
          const totalSpentFormatted = Number(s.totalPurchasesAmount || 0).toFixed(2);

          return `
            <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition text-xs">
              <td class="p-3.5 font-bold text-slate-800 dark:text-slate-100">
                <div class="flex items-center gap-2">
                  <span class="text-base">🏭</span>
                  <span>${escapeHtml(s.name)}</span>
                </div>
              </td>
              <td class="p-3.5 text-slate-500 font-mono">${escapeHtml(s.phone || 'Non renseigné')}</td>
              <td class="p-3.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">${totalSpentFormatted} DA</td>
              <td class="p-3.5 text-center font-bold">${s.ordersCount || 0}</td>
              <td class="p-3.5 text-center">
                ${pendingOrders > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">${pendingOrders} en cours</span>` : '<span class="text-slate-400">0</span>'}
              </td>
              <td class="p-3.5 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <button onclick="openSupplierPurchasesModal('${safeId}')" class="p-1.5 px-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 font-bold text-xs transition flex items-center gap-1" title="Voir l'historique de tous les achats auprès de ce fournisseur">
                    <span>📦</span> <span>Achats</span>
                  </button>
                  <button onclick="openSupplierModal('${safeId}')" class="p-1.5 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs transition flex items-center gap-1" title="Modifier">
                    <span>✏️</span>
                  </button>
                  <button onclick="handleDeleteSupplier('${safeId}')" class="p-1.5 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 text-slate-400 hover:text-rose-600 text-xs transition" title="Supprimer">
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.error('Suppliers workspace render error:', err);
  }
}
window.renderSuppliersWorkspace = renderSuppliersWorkspace;

// Supplier Purchases History Modal (Task: Display all purchases per supplier)
async function openSupplierPurchasesModal(supplierId) {
  const modal = document.getElementById('supplier-purchases-modal');
  const title = document.getElementById('supplier-purchases-modal-title');
  const statsContainer = document.getElementById('supplier-purchases-modal-stats');
  const listContainer = document.getElementById('supplier-purchases-modal-list');

  if (!modal || !listContainer) return;

  modal.classList.remove('hidden');
  listContainer.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400 text-xs">Chargement des achats...</td></tr>';

  try {
    const data = await window.SupplierService.getSupplierPurchases(supplierId);
    const supplier = data.supplier;
    const purchases = data.purchases || [];

    if (title) {
      title.innerHTML = `<span>🏭</span> Historique des Achats — ${escapeHtml(supplier ? supplier.name : 'Fournisseur')}`;
    }

    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl border border-indigo-100 dark:border-indigo-900 flex flex-col">
          <span class="text-[10px] uppercase font-bold text-indigo-500">Total Dépensé</span>
          <span class="text-base font-black font-mono text-indigo-700 dark:text-indigo-300">${Number(data.totalSpentAmount || 0).toFixed(2)} DA</span>
        </div>
        <div class="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col">
          <span class="text-[10px] uppercase font-bold text-slate-400">Nombre de Factures / Commandes</span>
          <span class="text-base font-black text-slate-800 dark:text-slate-100 font-mono">${data.totalPurchasesCount || 0}</span>
        </div>
        <div class="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col">
          <span class="text-[10px] uppercase font-bold text-slate-400">Téléphone Contact</span>
          <span class="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">${escapeHtml(supplier?.phone || 'Non renseigné')}</span>
        </div>
      `;
    }

    if (purchases.length === 0) {
      listContainer.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400 text-xs">Aucun achat ou commande enregistré pour ce fournisseur.</td></tr>';
    } else {
      listContainer.innerHTML = purchases.map(p => {
        const dateStr = p.date || (p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '');
        const isScanIQ = p.type === 'scaniq';
        const badge = isScanIQ
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700">⚡ Facture Validée</span>'
          : (p.status === 'received'
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">🟢 Réceptionné</span>'
          : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">🟡 En Attente</span>');

        const safeId = escapeHtml(String(p.id));

        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
            <td class="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">${escapeHtml(p.orderRef || p.invoiceNumber)}</td>
            <td class="p-3 font-mono text-slate-500">${dateStr}</td>
            <td class="p-3 text-center font-semibold">${p.itemsCount} article(s)</td>
            <td class="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">${Number(p.totalAmount).toFixed(2)} DA</td>
            <td class="p-3 text-center">${badge}</td>
            <td class="p-3 text-right">
              <button onclick="openOrderDetailsModal('${isScanIQ ? 'purch_' + safeId : safeId}')" class="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition">
                <span>👁️</span> <span>Détails</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching supplier purchases:', err);
    showToast('Erreur lors du chargement des achats: ' + err.message, 'error');
  }
}
window.openSupplierPurchasesModal = openSupplierPurchasesModal;

// Order / Purchase Details Modal
async function openOrderDetailsModal(rawId) {
  const modal = document.getElementById('purchase-details-modal');
  const title = document.getElementById('purchase-details-modal-title');
  const metaContainer = document.getElementById('purchase-details-modal-meta');
  const itemsContainer = document.getElementById('purchase-details-modal-items');

  if (!modal || !itemsContainer) return;

  modal.classList.remove('hidden');
  itemsContainer.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400 text-xs">Chargement des détails...</td></tr>';

  try {
    const d = window.FlexiDB.db;
    let orderRef = '';
    let supplierName = 'Fournisseur';
    let dateStr = '';
    let items = [];
    let subtotal = 0;
    let discount = 0;
    let total = 0;
    let statusBadge = '';

    if (String(rawId).startsWith('purch_')) {
      const pId = Number(String(rawId).replace('purch_', ''));
      const p = await d.purchases.get(pId);
      if (p) {
        orderRef = p.invoiceNumber || `FAC-${p.id}`;
        supplierName = p.supplierName || 'Fournisseur';
        dateStr = p.date || (p.createdAt ? p.createdAt.slice(0, 10) : '');
        items = p.items || [];
        subtotal = Number(p.subtotal) || 0;
        discount = Number(p.discount) || 0;
        total = Number(p.total) || (subtotal - discount);
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700">⚡ FACTURE SCANÉE</span>';
      }
    } else {
      const poData = await window.SupplierService.getPurchaseOrderById(rawId);
      if (poData) {
        const order = poData.order || poData;
        orderRef = order.orderRef || `DZ-PO-${order.id}`;
        supplierName = order.supplierName || 'Fournisseur';
        dateStr = order.expectedDate || (order.createdAt ? order.createdAt.slice(0, 10) : '');
        items = (poData.items || []).map(it => ({
          description: it.productName || it.description || 'Article',
          quantity: it.quantityOrdered,
          unitPrice: it.unitCost,
          total: (Number(it.quantityOrdered) || 0) * (Number(it.unitCost) || 0)
        }));
        subtotal = items.reduce((s, it) => s + it.total, 0);
        total = order.totalAmount != null ? Number(order.totalAmount) : subtotal;
        statusBadge = order.status === 'received'
          ? '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">🟢 RÉCEPTIONNÉ</span>'
          : '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">🟡 EN ATTENTE</span>';
      }
    }

    if (title) title.innerHTML = `<span>📑</span> Détails Commande / Facture — ${escapeHtml(orderRef)}`;

    if (metaContainer) {
      metaContainer.innerHTML = `
        <div class="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
          <div class="flex items-center gap-4">
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold block">Fournisseur</span>
              <span class="font-bold text-slate-800 dark:text-slate-100">🏭 ${escapeHtml(supplierName)}</span>
            </div>
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold block">Date</span>
              <span class="font-mono text-slate-600 dark:text-slate-300">${dateStr}</span>
            </div>
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }

    if (items.length === 0) {
      itemsContainer.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 text-xs">Aucun article dans cette commande.</td></tr>';
    } else {
      itemsContainer.innerHTML = items.map(it => {
        const qty = Number(it.quantity) || 1;
        const price = Number(it.unitPrice) || 0;
        const lineTot = Number(it.total) || (qty * price);
        const packInfo = it.packMultiplier > 1 ? `<span class="text-[10px] text-indigo-500 font-bold block">Pack x${it.packMultiplier}</span>` : '';

        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
            <td class="p-3 font-semibold text-slate-800 dark:text-slate-200">
              ${escapeHtml(it.description || 'Article')}
              ${packInfo}
            </td>
            <td class="p-3 text-center font-mono font-bold">${qty}</td>
            <td class="p-3 text-right font-mono">${price.toFixed(2)} DA</td>
            <td class="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">${lineTot.toFixed(2)} DA</td>
          </tr>
        `;
      }).join('');
    }

    // Update Totals Summary
    const subtotalEl = document.getElementById('purchase-details-subtotal');
    const discountEl = document.getElementById('purchase-details-discount');
    const totalEl = document.getElementById('purchase-details-total');

    if (subtotalEl) subtotalEl.innerText = `${subtotal.toFixed(2)} DA`;
    if (discountEl) discountEl.innerText = `${discount.toFixed(2)} DA`;
    if (totalEl) totalEl.innerText = `${total.toFixed(2)} DA`;

  } catch (err) {
    console.error('Error opening order details:', err);
    showToast('Erreur détails commande: ' + err.message, 'error');
  }
}
window.openOrderDetailsModal = openOrderDetailsModal;

// Supplier Modal & Form Handlers
async function openSupplierModal(supplierId = null) {
  const modal = document.getElementById('supplier-form-modal');
  const title = document.getElementById('supplier-modal-title');
  const idInput = document.getElementById('supplier-form-id');
  const nameInput = document.getElementById('supplier-form-name');
  const phoneInput = document.getElementById('supplier-form-phone');

  if (!modal) return;

  if (supplierId) {
    try {
      const s = await window.SupplierService.getSupplierById(supplierId);
      if (s) {
        if (title) title.innerHTML = '<span>✏️</span> Modifier le Fournisseur';
        if (idInput) idInput.value = s.id;
        if (nameInput) nameInput.value = s.name;
        if (phoneInput) phoneInput.value = s.phone || '';
      }
    } catch (e) {
      showToast('Fournisseur introuvable', 'error');
      return;
    }
  } else {
    if (title) title.innerHTML = '<span>🏭</span> Ajouter un Fournisseur';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
  }

  modal.classList.remove('hidden');
  nameInput?.focus();
}
window.openSupplierModal = openSupplierModal;

async function handleSupplierSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('supplier-form-id')?.value;
  const name = (document.getElementById('supplier-form-name')?.value || '').trim();
  const phone = (document.getElementById('supplier-form-phone')?.value || '').trim();

  if (!name) {
    showToast('Le nom du fournisseur est obligatoire', 'error');
    return;
  }

  try {
    if (id) {
      await window.SupplierService.updateSupplier(id, { name, phone });
      showToast(`Fournisseur "${name}" mis à jour`);
    } else {
      await window.SupplierService.createSupplier({ name, phone });
      showToast(`Fournisseur "${name}" ajouté avec succès`);
    }
    document.getElementById('supplier-form-modal')?.classList.add('hidden');
    await renderSuppliersWorkspace();
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
window.handleSupplierSubmit = handleSupplierSubmit;

async function handleDeleteSupplier(supplierId) {
  if (!confirm('Confirmez-vous la suppression de ce fournisseur ?')) return;
  try {
    await window.SupplierService.deleteSupplier(supplierId);
    showToast('Fournisseur supprimé');
    await renderSuppliersWorkspace();
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
window.handleDeleteSupplier = handleDeleteSupplier;

// Purchase Order Creation Modal
async function openPurchaseOrderModal() {
  const modal = document.getElementById('po-form-modal');
  const supplierSelect = document.getElementById('po-form-supplier');
  const itemsContainer = document.getElementById('po-form-items-container');
  const dateInput = document.getElementById('po-form-date');

  if (!modal || !supplierSelect || !itemsContainer) return;

  try {
    const suppliers = await window.SupplierService.getAllSuppliers();
    supplierSelect.innerHTML = '<option value="">Sélectionner un fournisseur...</option>' + suppliers.map(s => `
      <option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name)}</option>
    `).join('');

    // Default expected date to in 3 days
    if (dateInput) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      dateInput.value = d.toISOString().split('T')[0];
    }

    itemsContainer.innerHTML = '';
    await addPoItemRow();

    modal.classList.remove('hidden');
  } catch (e) {
    showToast('Erreur chargement fournisseurs: ' + e.message, 'error');
  }
}
window.openPurchaseOrderModal = openPurchaseOrderModal;

let cachedPoProducts = [];

async function addPoItemRow() {
  const container = document.getElementById('po-form-items-container');
  if (!container) return;

  try {
    if (!cachedPoProducts || cachedPoProducts.length === 0) {
      if (window.FlexiDB?.db) {
        cachedPoProducts = await window.FlexiDB.db.products.toArray();
      }
    }

    const row = document.createElement('div');
    row.className = 'po-item-row p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 grid grid-cols-12 gap-2 items-center text-xs';
    row.innerHTML = `
      <div class="col-span-5">
        <label class="block text-[10px] text-slate-400 font-bold mb-0.5">Produit *</label>
        <select class="po-row-product w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold" onchange="onPoProductSelectChange(this)">
          <option value="">Sélectionner produit...</option>
          ${cachedPoProducts.map(p => `
            <option value="${escapeHtml(String(p.id))}" data-cost="${p.costPrice || 0}">${escapeHtml(p.name)}</option>
          `).join('')}
        </select>
      </div>
      <div class="col-span-3">
        <label class="block text-[10px] text-slate-400 font-bold mb-0.5">Qté Commandée *</label>
        <input type="number" min="1" value="10" class="po-row-qty w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-center">
      </div>
      <div class="col-span-3">
        <label class="block text-[10px] text-slate-400 font-bold mb-0.5">Coût Unitaire (DA)</label>
        <input type="number" min="0" step="1" value="0" class="po-row-cost w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-right font-mono">
      </div>
      <div class="col-span-1 flex items-end justify-center pt-3">
        <button type="button" onclick="removePoItemRow(this)" class="p-1.5 text-slate-400 hover:text-rose-600 font-bold text-sm">✕</button>
      </div>
    `;

    container.appendChild(row);
  } catch (e) {
    console.warn('Error adding PO item row:', e);
  }
}
window.addPoItemRow = addPoItemRow;

function onPoProductSelectChange(selectEl) {
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const cost = selectedOption?.dataset?.cost || '0';
  const row = selectEl.closest('.po-item-row');
  const costInput = row?.querySelector('.po-row-cost');
  if (costInput) costInput.value = cost;
}
window.onPoProductSelectChange = onPoProductSelectChange;

function removePoItemRow(btn) {
  const rows = document.querySelectorAll('.po-item-row');
  if (rows.length <= 1) {
    showToast('Le bon de commande doit contenir au moins un article', 'error');
    return;
  }
  btn.closest('.po-item-row')?.remove();
}
window.removePoItemRow = removePoItemRow;

async function handlePurchaseOrderSubmit(event) {
  event.preventDefault();
  const supplierId = document.getElementById('po-form-supplier')?.value;
  const expectedDate = document.getElementById('po-form-date')?.value || null;
  const rows = document.querySelectorAll('.po-item-row');

  if (!supplierId) {
    showToast('Veuillez sélectionner un fournisseur', 'error');
    return;
  }

  const items = [];
  for (const row of rows) {
    const productId = row.querySelector('.po-row-product')?.value;
    const quantity = parseInt(row.querySelector('.po-row-qty')?.value, 10) || 0;
    const unitCost = parseFloat(row.querySelector('.po-row-cost')?.value) || 0;

    if (productId && quantity > 0) {
      items.push({ productId, quantityOrdered: quantity, quantity, unitCost });
    }
  }

  if (items.length === 0) {
    showToast('Veuillez ajouter au moins un produit avec une quantité valide', 'error');
    return;
  }

  try {
    const po = await window.SupplierService.createPurchaseOrder({
      supplierId,
      expectedDate,
      items
    });

    showToast(`Bon de commande #${po.orderRef} créé avec succès !`);
    document.getElementById('po-form-modal')?.classList.add('hidden');
    await renderSuppliersWorkspace();
  } catch (e) {
    showToast('Erreur création BC: ' + e.message, 'error');
  }
}
window.handlePurchaseOrderSubmit = handlePurchaseOrderSubmit;

// Delivery Receiving Modal
async function openReceiveDeliveryModal(poId) {
  const modal = document.getElementById('po-receive-modal');
  const idInput = document.getElementById('po-receive-id');
  const subtitle = document.getElementById('po-receive-subtitle');
  const container = document.getElementById('po-receive-items-container');

  if (!modal || !idInput || !container) return;

  try {
    const data = await window.SupplierService.getPurchaseOrderById(poId);
    if (!data) {
      showToast('Bon de commande introuvable', 'error');
      return;
    }

    const order = data.order || data;
    const items = data.items || [];
    idInput.value = order.id;
    if (subtitle) subtitle.innerText = `BC #${order.orderRef} — Fournisseur: ${order.supplierName || 'Fournisseur'}`;

    container.innerHTML = items.map(item => `
      <div class="receive-row p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col gap-2.5" 
           data-item-id="${escapeHtml(String(item.id))}" 
           data-product-id="${escapeHtml(String(item.productId))}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">${item.icon || '📦'}</span>
            <div>
              <span class="font-bold text-slate-800 dark:text-slate-100 text-xs">${escapeHtml(item.productName || 'Produit')}</span>
              <span class="text-[10px] text-slate-400 block font-mono">Stock en rayon : <strong class="text-slate-700 dark:text-slate-300">${item.currentStock || 0} u.</strong></span>
            </div>
          </div>
          <div class="text-right font-mono text-[11px]">
            <span class="text-slate-500">Commandé : <strong class="text-slate-800 dark:text-slate-200">${item.quantityOrdered}</strong></span>
            ${(item.quantityReceived || 0) > 0 ? `<span class="text-emerald-600 block text-[10px] font-bold">Déjà reçu : ${item.quantityReceived}</span>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
          <div>
            <label class="block text-[10px] text-slate-400 font-bold mb-0.5">Qté à Réceptionner *</label>
            <input type="number" min="0" value="${Math.max(0, (item.quantityOrdered || 0) - (item.quantityReceived || 0))}" class="receive-item-qty w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-center text-xs">
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 font-bold mb-0.5">Prix d'Achat (DA)</label>
            <input type="number" min="0" step="1" value="${item.unitCost || 0}" class="receive-item-cost w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-right font-mono text-xs" title="Mettre à jour le prix de revient">
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 font-bold mb-0.5">Prix de Vente (DA)</label>
            <input type="number" min="0" step="1" value="${item.sellingPrice || ''}" placeholder="Inchangé" class="receive-item-selling-price w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-right font-mono text-xs" title="Modifier le prix de vente en caisse si besoin">
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 font-bold mb-0.5">Date Péremption</label>
            <input type="date" class="receive-item-expiry w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono">
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 font-bold mb-0.5">N° de Lot (Batch)</label>
            <input type="text" placeholder="ex: LOT-${new Date().getFullYear()}" class="receive-item-batch w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono">
          </div>
        </div>
      </div>
    `).join('');

    modal.classList.remove('hidden');
  } catch (e) {
    showToast('Erreur ouverture réception: ' + e.message, 'error');
  }
}
window.openReceiveDeliveryModal = openReceiveDeliveryModal;

async function handleReceiveDeliverySubmit(event) {
  event.preventDefault();
  const poId = document.getElementById('po-receive-id')?.value;
  const rows = document.querySelectorAll('.receive-row');

  if (!poId) return;

  const items = [];
  rows.forEach(row => {
    const itemId = row.dataset.itemId;
    const productId = row.dataset.productId;
    const receivedQuantity = parseInt(row.querySelector('.receive-item-qty')?.value, 10) || 0;
    const unitCost = parseFloat(row.querySelector('.receive-item-cost')?.value) || 0;
    const sellingPrice = parseFloat(row.querySelector('.receive-item-selling-price')?.value) || null;
    const expiryDate = row.querySelector('.receive-item-expiry')?.value || null;
    const batchNumber = (row.querySelector('.receive-item-batch')?.value || '').trim() || null;

    if (productId && receivedQuantity > 0) {
      items.push({
        itemId,
        productId,
        quantityReceived: receivedQuantity,
        receivedQuantity,
        unitCost,
        sellingPrice,
        expiryDate,
        batchNumber
      });
    }
  });

  if (items.length === 0) {
    showToast('Veuillez renseigner au moins un article avec une quantité reçue > 0', 'error');
    return;
  }

  try {
    const res = await window.SupplierService.receiveDelivery(poId, { items });
    const statusLabel = res.status === 'received' ? 'RÉCEPTIONNÉ' : 'PARTIEL';
    showToast(`Livraison validée avec succès ! Commande passée à "${statusLabel}".`);
    document.getElementById('po-receive-modal')?.classList.add('hidden');
    
    // Refresh all affected workspaces and in-memory caches
    await renderSuppliersWorkspace();
    if (window.renderInventoryWorkspace) await window.renderInventoryWorkspace();
    if (window.loadPosProducts) await window.loadPosProducts();
    if (window.POS?.loadProducts) await window.POS.loadProducts();
    if (window.POS?.updateExpiryBadge) await window.POS.updateExpiryBadge();
    if (window.renderAnalyticsWorkspace) await window.renderAnalyticsWorkspace();
  } catch (e) {
    showToast('Erreur réception livraison: ' + e.message, 'error');
  }
}
window.handleReceiveDeliverySubmit = handleReceiveDeliverySubmit;

async function handleCancelPurchaseOrder(poId) {
  if (!confirm('Confirmez-vous l\'annulation de ce bon de commande ?')) return;
  try {
    await window.SupplierService.cancelPurchaseOrder(poId);
    showToast('Bon de commande annulé');
    await renderSuppliersWorkspace();
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}
window.handleCancelPurchaseOrder = handleCancelPurchaseOrder;

// ==========================================
// DOM READY INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Settings Workspace Terminal ID Save Listener
  document.getElementById('settings-save-terminal-btn')?.addEventListener('click', saveTerminalIdSetting);
  // Sidebar Navigation Click Listeners
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.workspace || 'pos';
      switchAppMode(mode);
    });
  });

  // Mobile Sidebar Toggle
  document.getElementById('open-sidebar-btn')?.addEventListener('click', openMobileSidebar);
  document.getElementById('close-sidebar-btn')?.addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  // Desktop Minimized / Compact Sidebar Toggle
  const sidebar = document.getElementById('app-sidebar');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const toggleSidebarIcon = document.getElementById('toggle-sidebar-icon');

  function updateSidebarState(compact) {
    if (!sidebar) return;
    if (compact) {
      sidebar.classList.add('sidebar-compact');
      if (toggleSidebarIcon) toggleSidebarIcon.innerText = '»';
      if (toggleSidebarBtn) toggleSidebarBtn.title = 'Déplier la barre latérale';
    } else {
      sidebar.classList.remove('sidebar-compact');
      if (toggleSidebarIcon) toggleSidebarIcon.innerText = '«';
      if (toggleSidebarBtn) toggleSidebarBtn.title = 'Réduire la barre latérale';
    }
    localStorage.setItem('sidebar_minimized', compact ? 'true' : 'false');
  }

  // Default to minimized / compact
  const isSidebarMinimized = localStorage.getItem('sidebar_minimized') !== 'false';
  updateSidebarState(isSidebarMinimized);

  toggleSidebarBtn?.addEventListener('click', () => {
    const currentlyCompact = sidebar?.classList.contains('sidebar-compact');
    updateSidebarState(!currentlyCompact);
  });

  // Dark Mode Toggle
  const themeToggleBtn = document.getElementById('theme-toggle');
  themeToggleBtn?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }

  // Start Live System Clock
  startLiveClock();

  // Keyboard Shortcuts (F1: Mobile Transfer Drop, F2: POS, F3: Inventory, F4: Analytics, F5: Print Hub, F6: Merge, F7: QR, F8: Debts)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      switchAppMode('transfer');
    } else if (e.key === 'F2') {
      e.preventDefault();
      switchAppMode('pos');
    } else if (e.key === 'F3') {
      e.preventDefault();
      switchAppMode('inventory');
    } else if (e.key === 'F4') {
      e.preventDefault();
      switchAppMode('analytics');
    } else if (e.key === 'F5') {
      e.preventDefault();
      switchAppMode('print');
    } else if (e.key === 'F6') {
      e.preventDefault();
      switchAppMode('merge');
    } else if (e.key === 'F7') {
      e.preventDefault();
      switchAppMode('qr');
    } else if (e.key === 'F8') {
      e.preventDefault();
      switchAppMode('debts');
    }  

  });

  // Inventory Search & Filter Listeners
  let invSearchTimer = null;
  document.getElementById('inventory-search-input')?.addEventListener('input', () => {
    clearTimeout(invSearchTimer);
    invSearchTimer = setTimeout(renderInventoryWorkspace, 250);
  });
  document.getElementById('inventory-category-filter')?.addEventListener('change', renderInventoryWorkspace);
  document.getElementById('inventory-stock-filter')?.addEventListener('change', renderInventoryWorkspace);

  // Analytics Period Filter Listeners
  document.querySelectorAll('.analytics-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.analytics-filter-btn').forEach(b => {
        b.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
        b.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
      });
      btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
      btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');

      const windowVal = btn.dataset.window || '30days';
      renderAnalyticsWorkspace(windowVal);
    });
  });

  // PDF Merge Studio Action Buttons & Local File Upload
  document.getElementById('studio-upload-pdf-input')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach(file => {
      studioMergeQueue.push({
        name: file.name,
        path: `[Local] ${file.name}`,
        fileBlob: file,
        isLocal: true
      });
    });
    showToast(`Added ${files.length} local file(s) to merge queue`);
    renderMergeStudioWorkspace();
    e.target.value = '';
  });

  document.getElementById('studio-clear-queue-btn')?.addEventListener('click', () => {
    studioMergeQueue = [];
    if (window.FileBrowser?.clearSelection) window.FileBrowser.clearSelection();
    renderMergeStudioWorkspace();
    showToast('Merge queue cleared');
  });

  document.getElementById('studio-merge-download-btn')?.addEventListener('click', () => {
    executeStudioMerge('download');
  });
  document.getElementById('studio-merge-print-btn')?.addEventListener('click', () => {
    executeStudioMerge('print');
  });
  document.getElementById('studio-merge-save-btn')?.addEventListener('click', () => {
    executeStudioMerge('save');
  });

  // Default to Mobile Transfer DropZone Workspace immediately for instant UI responsiveness
  switchAppMode('transfer');

  // Initialize Core Modules Asynchronously
  try {
    if (window.FlexiDB?.init) {
      await window.FlexiDB.init().catch(e => console.warn('FlexiDB init non-fatal:', e));
    }
  } catch (e) {
    console.warn('FlexiDB initialization non-fatal:', e);
  }

  try {
    if (window.POS?.init) {
      await window.POS.init();
    } else if (window.POS?.loadProducts) {
      await window.POS.loadProducts();
    }
  } catch (e) {
    console.error('POS initialization error:', e);
  }

  // Debts Workspace Listeners
  let debtSearchTimer = null;
  document.getElementById('debts-search-input')?.addEventListener('input', () => {
    clearTimeout(debtSearchTimer);
    debtSearchTimer = setTimeout(renderDebtsWorkspace, 120);
  });

  document.querySelectorAll('.debt-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.debt-filter-btn').forEach(b => {
        b.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
        b.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
      });
      btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
      btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
      activeDebtFilter = btn.dataset.filter || 'all';
      renderDebtsWorkspace();
    });
  });

  document.getElementById('debts-manual-btn')?.addEventListener('click', openManualDebtModal);
  document.getElementById('debts-close-manual-btn')?.addEventListener('click', () => {
    document.getElementById('debt-manual-modal')?.classList.add('hidden');
  });
  document.getElementById('debts-cancel-manual-btn')?.addEventListener('click', () => {
    document.getElementById('debt-manual-modal')?.classList.add('hidden');
  });
  document.getElementById('debts-save-manual-btn')?.addEventListener('click', saveManualDebt);

  document.getElementById('debts-close-customer-modal-btn')?.addEventListener('click', () => {
    document.getElementById('debt-customer-modal')?.classList.add('hidden');
  });

  document.getElementById('debts-close-pay-btn')?.addEventListener('click', () => {
    document.getElementById('debt-payment-modal')?.classList.add('hidden');
  });
  document.getElementById('debts-cancel-pay-btn')?.addEventListener('click', () => {
    document.getElementById('debt-payment-modal')?.classList.add('hidden');
  });
  document.getElementById('debts-confirm-pay-btn')?.addEventListener('click', confirmPaymentRecord);

  document.getElementById('debts-export-csv-btn')?.addEventListener('click', () => {
    window.DebtService?.exportDebtsToCsv();
  });
  document.getElementById('export-debts-csv-btn')?.addEventListener('click', () => {
    window.DebtService?.exportDebtsToCsv();
  });
  document.getElementById('export-debt-payments-csv-btn')?.addEventListener('click', () => {
    window.DebtService?.exportDebtPaymentsToCsv();
  });

  // ScanIQ Invoice Scanner Launcher
  const scaniqLaunchBtn = document.getElementById('scaniq-launch-btn');
  const scaniqFileInput = document.getElementById('scaniq-file-input');

  scaniqLaunchBtn?.addEventListener('click', () => {
    scaniqFileInput?.click();
  });

  scaniqFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      showToast('⚡ ScanIQ : Analyse de la facture en cours...', 'info');
      const scanData = await window.ScanIQService.processInvoiceFile(file);
      await window.ScanIQService.renderScanValidationModal(scanData);
      showToast(`Facture de "${scanData.supplier}" analysée avec succès !`, 'success');
    } catch (err) {
      console.error('[ScanIQ Error]', err);
      showToast('Erreur ScanIQ : ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  // Stock Conflicts Modal Listeners
  document.getElementById('close-conflict-modal-btn')?.addEventListener('click', () => {
    document.getElementById('stock-conflict-modal')?.classList.add('hidden');
  });
  document.getElementById('cancel-conflict-modal-btn')?.addEventListener('click', () => {
    document.getElementById('stock-conflict-modal')?.classList.add('hidden');
  });

  if (window.QRGenerator?.init) window.QRGenerator.init();
  if (window.FileBrowser?.init) window.FileBrowser.init();
  if (window.Printing?.init) window.Printing.init();
});


