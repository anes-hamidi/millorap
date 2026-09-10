// ==========================================
// LOCAL FILE BROWSER MODULE (LAZY LOADED)
// ==========================================
(function() {
  let activeShopFilePath = '';
  const loadedFolders = new Map(); // path -> items[]
  const loadingFolders = new Set(); // set of paths currently fetching
  const openFolders = new Set();    // set of paths currently expanded
  let currentNavPath = '';
  let searchResults = null;
  let searchTimeout = null;
  let explorerControlsBound = false;

  async function init() {
    await fetchShopFiles();
    setupExplorerControls();
  }

  // Fetch items for a specific folder path
  async function fetchFolderItems(folderPath = '') {
    if (loadedFolders.has(folderPath)) {
      return loadedFolders.get(folderPath);
    }

    loadingFolders.add(folderPath);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(folderPath)}`);
      if (!res.ok) throw new Error('API server error');
      const data = await res.json();
      
      const folderPathDisp = document.getElementById('docs-folder-path');
      if (data.docsDir && folderPathDisp && !folderPath) {
        folderPathDisp.innerText = data.docsDir;
      }

      const items = data.items || [];
      loadedFolders.set(folderPath, items);
      loadingFolders.delete(folderPath);
      return items;
    } catch (err) {
      console.warn(`Error loading folder ${folderPath}:`, err);
      loadingFolders.delete(folderPath);
      return [];
    }
  }

  // Initial load of root folder
  async function fetchShopFiles() {
    const container = document.getElementById('file-tree-container');
    if (!container) return;

    loadedFolders.clear();
    loadingFolders.clear();
    searchResults = null;

    try {
      const rootItems = await fetchFolderItems('');
      renderShopTree();
      renderBreadcrumbs();
      updateExplorerStats();
    } catch (err) {
      console.warn('Shop files fetch error:', err);
      container.innerHTML = `<div class="p-3 text-rose-500 text-xs text-center">Could not load files from server. Ensure Node server is running on port 3000.</div>`;
    }
  }

  function updateExplorerStats(customText) {
    const statsEl = document.getElementById('file-explorer-stats');
    if (!statsEl) return;
    if (customText) {
      statsEl.innerText = customText;
      return;
    }
    const rootItems = loadedFolders.get('') || [];
    const folders = rootItems.filter(i => i.type === 'folder').length;
    const files = rootItems.filter(i => i.type === 'file').length;
    statsEl.innerText = `${folders} folders • ${files} files at root`;
  }

  // Breadcrumb Navigation
  function renderBreadcrumbs() {
    const container = document.getElementById('file-breadcrumbs');
    const upBtn = document.getElementById('nav-up-btn');
    if (!container) return;

    container.innerHTML = '';

    // Root button
    const rootBtn = document.createElement('button');
    const isRootActive = !currentNavPath && !activeShopFilePath && !searchResults;
    rootBtn.className = `breadcrumb-pill px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold transition ${
      isRootActive
        ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
    }`;
    rootBtn.innerHTML = `<span>🏠</span> <span>Root</span>`;
    rootBtn.onclick = () => navigateToFolder('');
    container.appendChild(rootBtn);

    // If searching
    if (searchResults !== null) {
      const sep = document.createElement('span');
      sep.className = 'text-slate-400 dark:text-slate-600 text-[10px] select-none';
      sep.innerText = '›';
      container.appendChild(sep);

      const searchPill = document.createElement('span');
      searchPill.className = 'px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 text-[11px] border border-amber-200 dark:border-amber-800/80';
      searchPill.innerHTML = `<span>🔍</span> <span>Search Results</span>`;
      container.appendChild(searchPill);

      if (upBtn) {
        upBtn.disabled = true;
        upBtn.onclick = null;
      }
      return;
    }

    // If we have a folder path
    if (currentNavPath) {
      const parts = currentNavPath.split('/').filter(Boolean);
      let cumulative = '';

      parts.forEach((part, idx) => {
        cumulative = cumulative ? `${cumulative}/${part}` : part;
        const currentCum = cumulative;
        const isLastPart = idx === parts.length - 1 && !activeShopFilePath;

        const sep = document.createElement('span');
        sep.className = 'text-slate-400 dark:text-slate-600 text-[10px] select-none';
        sep.innerText = '›';
        container.appendChild(sep);

        const pill = document.createElement('button');
        pill.className = `breadcrumb-pill px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium transition truncate max-w-[120px] ${
          isLastPart
            ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        }`;
        pill.title = part;
        pill.innerHTML = `<span>📁</span> <span class="truncate">${window.escapeHtml(part)}</span>`;
        pill.onclick = () => navigateToFolder(currentCum);
        container.appendChild(pill);
      });
    }

    // If an active file is selected
    if (activeShopFilePath) {
      const fileName = activeShopFilePath.split('/').pop();
      const sep = document.createElement('span');
      sep.className = 'text-slate-400 dark:text-slate-600 text-[10px] select-none';
      sep.innerText = '›';
      container.appendChild(sep);

      const filePill = document.createElement('span');
      filePill.className = 'px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 font-bold flex items-center gap-1 truncate max-w-[140px] border border-indigo-200 dark:border-indigo-800/80';
      filePill.title = fileName;
      filePill.innerHTML = `<span>📄</span> <span class="truncate">${window.escapeHtml(fileName)}</span>`;
      container.appendChild(filePill);
    }

    // Up button state
    if (upBtn) {
      if (currentNavPath) {
        upBtn.disabled = false;
        upBtn.onclick = () => {
          const parts = currentNavPath.split('/').filter(Boolean);
          parts.pop();
          navigateToFolder(parts.join('/'));
        };
      } else {
        upBtn.disabled = true;
        upBtn.onclick = null;
      }
    }
  }

  async function navigateToFolder(folderPath) {
    searchResults = null;
    const searchInput = document.getElementById('file-search-input');
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('file-search-clear');
    if (searchClear) searchClear.classList.add('hidden');

    currentNavPath = folderPath;
    if (folderPath) {
      const parts = folderPath.split('/').filter(Boolean);
      let cur = '';
      for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p;
        openFolders.add(cur);
        if (!loadedFolders.has(cur)) {
          await fetchFolderItems(cur);
        }
      }
    }

    renderShopTree();
    renderBreadcrumbs();

    if (folderPath) {
      setTimeout(() => {
        const folderEl = document.querySelector(`[data-folder-path="${CSS.escape(folderPath)}"]`);
        if (folderEl) {
          folderEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }

  async function toggleFolder(folderPath, event) {
    if (event) event.stopPropagation();

    if (openFolders.has(folderPath)) {
      openFolders.delete(folderPath);
      renderShopTree();
      renderBreadcrumbs();
    } else {
      openFolders.add(folderPath);
      currentNavPath = folderPath;
      renderShopTree();
      renderBreadcrumbs();

      if (!loadedFolders.has(folderPath)) {
        await fetchFolderItems(folderPath);
        renderShopTree();
      }
    }
  }

  function renderShopTree() {
    const container = document.getElementById('file-tree-container');
    if (!container) return;

    container.innerHTML = '';

    // If showing search results
    if (searchResults !== null) {
      updateExplorerStats(`${searchResults.length} match${searchResults.length !== 1 ? 'es' : ''}`);

      if (searchResults.length === 0) {
        container.innerHTML = `
          <div class="text-slate-400 text-center py-6 text-xs flex flex-col items-center gap-1">
            <span>🔍</span>
            <span>No matching files or folders found</span>
          </div>
        `;
        return;
      }

      const ul = document.createElement('ul');
      ul.className = 'space-y-1';

      searchResults.forEach(item => {
        const li = document.createElement('li');
        li.className = 'tree-item text-xs select-none';

        if (item.type === 'folder') {
          li.innerHTML = `
            <div class="p-2 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300 flex items-center justify-between transition border border-slate-200/50 dark:border-slate-800/60">
              <div class="flex items-center gap-1.5 min-w-0 truncate">
                <span>📁</span>
                <span class="truncate font-semibold">${window.escapeHtml(item.name)}</span>
              </div>
              <span class="text-[10px] text-indigo-500 font-mono ml-2 shrink-0 truncate max-w-[120px]">${window.escapeHtml(item.path)}</span>
            </div>
          `;
          li.addEventListener('click', () => navigateToFolder(item.path));
        } else {
          const isActive = activeShopFilePath === item.path;
          li.innerHTML = `
            <div class="p-2 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/70 transition border flex items-center justify-between ${
              isActive
                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-semibold'
                : 'border-slate-200/50 dark:border-slate-800/60 text-slate-600 dark:text-slate-400'
            }">
              <div class="flex items-center gap-1.5 min-w-0 truncate">
                <span>${item.isPdf ? '📕' : '📄'}</span>
                <span class="truncate font-medium">${window.escapeHtml(item.name)}</span>
              </div>
              <span class="text-[10px] text-slate-400 font-mono ml-2 shrink-0 truncate max-w-[120px]">${window.escapeHtml(item.path)}</span>
            </div>
          `;
          li.addEventListener('click', () => selectShopFile(item.path));
        }

        ul.appendChild(li);
      });

      container.appendChild(ul);
      return;
    }

    // Normal lazy tree rendering
    updateExplorerStats();
    const rootItems = loadedFolders.get('') || [];

    if (rootItems.length === 0 && !loadingFolders.has('')) {
      container.innerHTML = `
        <div class="text-slate-400 text-center py-6 text-xs flex flex-col items-center gap-1">
          <span>📂</span>
          <span>No documents found in root folder</span>
        </div>
      `;
      return;
    }

    const ul = buildTreeUl('', 0);
    container.appendChild(ul);
  }

  function buildTreeUl(folderPath, depth) {
    const ul = document.createElement('ul');
    ul.className = depth === 0 ? 'space-y-1' : 'space-y-1 pl-3 border-l-2 border-slate-200/80 dark:border-slate-800 ml-2 mt-1';

    const items = loadedFolders.get(folderPath) || [];

    items.forEach(node => {
      const li = document.createElement('li');
      li.className = 'tree-item text-xs select-none';

      if (node.type === 'folder') {
        const isOpen = openFolders.has(node.path);
        const isLoading = loadingFolders.has(node.path);
        const isCurrentNav = currentNavPath === node.path;
        const itemCount = node.itemCount !== undefined ? node.itemCount : '';

        const folderRow = document.createElement('div');
        folderRow.setAttribute('data-folder-path', node.path);
        folderRow.className = `tree-folder-row group p-1.5 rounded-xl cursor-pointer flex items-center justify-between transition ${
          isCurrentNav
            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200/60 dark:border-indigo-800/60'
            : 'text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800/70'
        }`;

        folderRow.innerHTML = `
          <div class="flex items-center gap-1.5 min-w-0 truncate">
            <span class="tree-chevron text-[10px] text-slate-400 group-hover:text-indigo-500 transition-transform ${isOpen ? 'open' : ''}">▶</span>
            <span class="text-sm">${isOpen ? '📂' : '📁'}</span>
            <span class="truncate font-semibold">${window.escapeHtml(node.name)}</span>
          </div>
          ${
            itemCount !== ''
              ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono ml-2 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition shrink-0">${itemCount}</span>`
              : ''
          }
        `;

        folderRow.addEventListener('click', (e) => {
          toggleFolder(node.path, e);
        });

        li.appendChild(folderRow);

        if (isOpen) {
          const childWrapper = document.createElement('div');
          childWrapper.className = 'tree-children-container';

          if (isLoading) {
            childWrapper.innerHTML = `<div class="p-1.5 pl-6 text-slate-400 text-[11px] flex items-center gap-1.5"><span class="animate-spin">⏳</span> Loading contents...</div>`;
          } else if (loadedFolders.has(node.path)) {
            childWrapper.appendChild(buildTreeUl(node.path, depth + 1));
          } else {
            // Trigger fetch in background and update
            fetchFolderItems(node.path).then(() => renderShopTree());
            childWrapper.innerHTML = `<div class="p-1.5 pl-6 text-slate-400 text-[11px] flex items-center gap-1.5"><span class="animate-spin">⏳</span> Loading contents...</div>`;
          }

          li.appendChild(childWrapper);
        }
      } else {
        const cleanPath = node.path.replace(/\\/g, '/');
        const isActive = activeShopFilePath === cleanPath;

        const fileRow = document.createElement('div');
        fileRow.setAttribute('data-file-path', cleanPath);
        fileRow.className = `tree-file-row group p-1.5 rounded-xl cursor-pointer flex items-center justify-between transition ${
          isActive
            ? 'active'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
        }`;

        fileRow.innerHTML = `
          <span class="truncate flex items-center gap-1.5 min-w-0">
            <span class="text-sm shrink-0">${node.isPdf ? '📕' : '📄'}</span>
            <span class="truncate ${isActive ? 'font-bold' : 'font-medium'}">${window.escapeHtml(node.name)}</span>
          </span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono ml-2 shrink-0 opacity-80">${node.sizeMB || '0'} MB</span>
        `;

        fileRow.addEventListener('click', () => {
          selectShopFile(cleanPath);
        });

        li.appendChild(fileRow);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  async function selectShopFile(filePath) {
    activeShopFilePath = filePath;
    const cleanPath = filePath.replace(/\\/g, '/');

    // Update parent navigation folder
    const parts = cleanPath.split('/');
    if (parts.length > 1) {
      parts.pop();
      const parentDir = parts.join('/');
      currentNavPath = parentDir;

      let cur = '';
      for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p;
        openFolders.add(cur);
        if (!loadedFolders.has(cur)) {
          await fetchFolderItems(cur);
        }
      }
    }

    const selectedDisp = document.getElementById('selected-file-display');
    const iframe = document.getElementById('pdf-viewer-iframe');
    const placeholder = document.getElementById('pdf-viewer-placeholder');
    const badge = document.getElementById('viewer-pdf-badge');
    const subtext = document.getElementById('viewer-file-subtext');

    const fileName = cleanPath.split('/').pop();
    const isPdf = fileName.toLowerCase().endsWith('.pdf');

    if (selectedDisp) selectedDisp.innerText = fileName;
    if (badge) {
      badge.classList.toggle('hidden', !isPdf);
    }
    if (subtext) {
      subtext.innerText = `Location: /${cleanPath}`;
    }

    if (iframe && placeholder) {
      placeholder.classList.add('hidden');
      iframe.classList.remove('hidden');
      iframe.src = `/api/view?file=${encodeURIComponent(cleanPath)}`;
    }

    renderShopTree();
    renderBreadcrumbs();
  }

  function setupExplorerControls() {
    if (explorerControlsBound) return;
    explorerControlsBound = true;

    // Expand all currently loaded folders
    document.getElementById('expand-all-btn')?.addEventListener('click', async () => {
      for (const [folderPath, items] of loadedFolders.entries()) {
        if (folderPath) openFolders.add(folderPath);
        if (items) {
          for (const item of items) {
            if (item.type === 'folder') {
              openFolders.add(item.path);
              if (!loadedFolders.has(item.path)) {
                fetchFolderItems(item.path).then(() => renderShopTree());
              }
            }
          }
        }
      }
      renderShopTree();
      window.showToast('Expanded active folders');
    });

    // Collapse all button
    document.getElementById('collapse-all-btn')?.addEventListener('click', () => {
      openFolders.clear();
      currentNavPath = '';
      searchResults = null;
      renderShopTree();
      renderBreadcrumbs();
      window.showToast('All folders collapsed');
    });

    // Fast search with debounce
    const searchInput = document.getElementById('file-search-input');
    const searchClear = document.getElementById('file-search-clear');

    searchInput?.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      if (searchClear) {
        if (term) searchClear.classList.remove('hidden');
        else searchClear.classList.add('hidden');
      }

      if (searchTimeout) clearTimeout(searchTimeout);

      if (!term) {
        searchResults = null;
        renderShopTree();
        renderBreadcrumbs();
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/files/search?q=${encodeURIComponent(term)}`);
          const data = await res.json();
          searchResults = data.results || [];
          renderShopTree();
          renderBreadcrumbs();
        } catch (err) {
          console.warn('Search error:', err);
        }
      }, 250);
    });

    searchClear?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchResults = null;
      searchClear.classList.add('hidden');
      renderShopTree();
      renderBreadcrumbs();
      searchInput?.focus();
    });
  }

  // Export FileBrowser module API
  window.FileBrowser = {
    init: init,
    fetchFiles: fetchShopFiles,
    getSelectedFile: () => activeShopFilePath,
    selectFile: selectShopFile,
    navigateToFolder: navigateToFolder
  };
  window.selectShopFile = selectShopFile;
})();
