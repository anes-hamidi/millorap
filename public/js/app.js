// ==========================================
// APPLICATION ORCHESTRATOR & COMMON UTILITIES
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

// App Mode Switcher (QR Generator / Shop Print Center / POS Terminal)
function switchAppMode(targetMode) {
  const viewQrAppBtn = document.getElementById('view-qr-app');
  const viewPrintAppBtn = document.getElementById('view-print-app');
  const viewPosAppBtn = document.getElementById('view-pos-app');
  const sectionQrApp = document.getElementById('section-qr-app');
  const sectionPrintApp = document.getElementById('section-print-app');
  const sectionPosApp = document.getElementById('section-pos-app');

  // Buttons state
  if (viewQrAppBtn) viewQrAppBtn.classList.toggle('active', targetMode === 'qr');
  if (viewPrintAppBtn) viewPrintAppBtn.classList.toggle('active', targetMode === 'print');
  if (viewPosAppBtn) viewPosAppBtn.classList.toggle('active', targetMode === 'pos');

  // Sections visibility
  if (sectionQrApp) sectionQrApp.classList.toggle('hidden', targetMode !== 'qr');
  if (sectionPrintApp) sectionPrintApp.classList.toggle('hidden', targetMode !== 'print');
  if (sectionPosApp) sectionPosApp.classList.toggle('hidden', targetMode !== 'pos');

  if (targetMode === 'print') {
    if (window.FileBrowser?.fetchFiles) window.FileBrowser.fetchFiles();
    if (window.Printing?.fetchPrinters) window.Printing.fetchPrinters();
  } else if (targetMode === 'pos') {
    if (window.POS?.init) window.POS.init();
  }
}
window.switchAppMode = switchAppMode;

// DOMContentLoaded Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  // Setup App Mode Navigation Buttons
  document.getElementById('view-qr-app')?.addEventListener('click', () => switchAppMode('qr'));
  document.getElementById('view-print-app')?.addEventListener('click', () => switchAppMode('print'));
  document.getElementById('view-pos-app')?.addEventListener('click', () => switchAppMode('pos'));

  // Dark Mode Theme Toggle
  const themeToggleBtn = document.getElementById('theme-toggle');
  themeToggleBtn?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }

  // Initialize Modules
  if (window.QRGenerator?.init) window.QRGenerator.init();
  if (window.FileBrowser?.init) window.FileBrowser.init();
  if (window.Printing?.init) window.Printing.init();
  if (window.POS?.init) window.POS.init();

  // Default to POS Terminal Mode
  switchAppMode('pos');
});
