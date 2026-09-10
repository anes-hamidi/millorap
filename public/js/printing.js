// ==========================================
// SHOP PRINTING & PRINTER MANAGEMENT MODULE
// ==========================================
(function() {
  async function fetchPrinters() {
    const select = document.getElementById('printer-select');
    if (!select) return;
    try {
      const res = await fetch('/api/printers');
      const data = await res.json();
      if (data.printers && data.printers.length > 0) {
        select.innerHTML = '<option value="">Default Windows Printer</option>';
        data.printers.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.name || p;
          opt.textContent = p.name || p;
          select.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Printers fetch error:', e);
    }
  }

  document.getElementById('refresh-files-btn')?.addEventListener('click', () => {
    if (window.FileBrowser?.fetchFiles) window.FileBrowser.fetchFiles();
    fetchPrinters();
    showToast('Refreshed local documents folder');
  });



  // Open Document in New Tab
  document.getElementById('open-tab-btn')?.addEventListener('click', () => {
    const activeFile = window.FileBrowser?.getSelectedFile ? window.FileBrowser.getSelectedFile() : '';
    if (!activeFile) {
      showToast('Select a document first!', 'error');
      return;
    }
    const docUrl = `/api/view?file=${encodeURIComponent(activeFile)}`;
    window.open(docUrl, '_blank');
  });

  // Print Current Document
  document.getElementById('print-current-doc-btn')?.addEventListener('click', () => {
    const iframe = document.getElementById('pdf-viewer-iframe');
    const activeFile = window.FileBrowser?.getSelectedFile ? window.FileBrowser.getSelectedFile() : '';
    if (!activeFile && (!iframe || !iframe.src)) {
      showToast('Select a document first!', 'error');
      return;
    }

    try {
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } else {
        const docUrl = `/api/view?file=${encodeURIComponent(activeFile)}`;
        window.open(docUrl, '_blank');
      }
    } catch (e) {
      const docUrl = `/api/view?file=${encodeURIComponent(activeFile)}`;
      window.open(docUrl, '_blank');
    }
  });

  // Maximize / Fullscreen Viewer
  const maxBtn = document.getElementById('maximize-viewer-btn');
  const maxCard = document.getElementById('pdf-viewer-main-card');
  const maxIcon = document.getElementById('maximize-icon');
  const maxLabel = document.getElementById('maximize-label');

  function toggleMaximizeViewer() {
    if (!maxCard) return;
    const isMax = maxCard.classList.toggle('viewer-maximized');
    if (maxIcon && maxLabel) {
      maxIcon.innerText = isMax ? '✕' : '⛶';
      maxLabel.innerText = isMax ? 'Exit Fullscreen' : 'Maximize';
    }
    if (maxBtn) {
      maxBtn.className = isMax
        ? 'px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition flex items-center gap-1.5 shadow-md'
        : 'px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/30';
    }
    if (isMax) {
      showToast('Document viewer maximized (Press Esc to exit)');
    }
  }

  maxBtn?.addEventListener('click', toggleMaximizeViewer);

  // Esc key listener to exit maximize mode
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && maxCard?.classList.contains('viewer-maximized')) {
      toggleMaximizeViewer();
    }
  });



  window.Printing = {
    init: function() {
      fetchPrinters();
    },
    fetchPrinters: fetchPrinters,
    toggleMaximize: toggleMaximizeViewer
  };
})();
