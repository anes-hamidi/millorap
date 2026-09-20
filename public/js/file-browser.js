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

  // Multi-file Selection State
  let multiSelectMode = false;
  const selectedFiles = new Set(); // set of relative file paths
  const selectedFilesInfo = new Map(); // path -> { name, isPdf, sizeMB }

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
          const isSelected = selectedFiles.has(item.path);
          li.innerHTML = `
            <div class="tree-file-row p-2 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/70 transition border flex items-center justify-between ${
              isSelected
                ? 'is-selected font-semibold'
                : isActive
                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-semibold'
                : 'border-slate-200/50 dark:border-slate-800/60 text-slate-600 dark:text-slate-400'
            }">
              <div class="flex items-center gap-2 min-w-0 truncate">
                ${multiSelectMode || selectedFiles.size > 0 ? `
                  <input type="checkbox" class="file-checkbox w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700" ${isSelected ? 'checked' : ''}>
                ` : ''}
                <span>${item.isPdf ? '📕' : '📄'}</span>
                <span class="truncate font-medium">${window.escapeHtml(item.name)}</span>
              </div>
              <span class="text-[10px] text-slate-400 font-mono ml-2 shrink-0 truncate max-w-[120px]">${window.escapeHtml(item.path)}</span>
            </div>
          `;

          const checkbox = li.querySelector('.file-checkbox');
          if (checkbox) {
            checkbox.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleSelectFile(item.path, { name: item.name, isPdf: item.isPdf });
            });
          }

          li.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (multiSelectMode) {
              toggleSelectFile(item.path, { name: item.name, isPdf: item.isPdf });
            } else {
              selectShopFile(item.path);
            }
          });
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
        const isSelected = selectedFiles.has(cleanPath);

        const fileRow = document.createElement('div');
        fileRow.setAttribute('data-file-path', cleanPath);
        fileRow.className = `tree-file-row group p-1.5 rounded-xl cursor-pointer flex items-center justify-between transition ${
          isSelected
            ? 'is-selected font-semibold'
            : isActive
            ? 'active'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
        }`;

        fileRow.innerHTML = `
          <div class="truncate flex items-center gap-2 min-w-0">
            ${multiSelectMode || selectedFiles.size > 0 ? `
              <input type="checkbox" class="file-checkbox w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700" ${isSelected ? 'checked' : ''}>
            ` : ''}
            <span class="text-sm shrink-0">${node.isPdf ? '📕' : '📄'}</span>
            <span class="truncate ${isActive || isSelected ? 'font-bold' : 'font-medium'}">${window.escapeHtml(node.name)}</span>
          </div>
          <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono ml-2 shrink-0 opacity-80">${node.sizeMB || '0'} MB</span>
        `;

        const checkbox = fileRow.querySelector('.file-checkbox');
        if (checkbox) {
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSelectFile(cleanPath, node);
          });
        }

        fileRow.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT') return;
          if (multiSelectMode) {
            toggleSelectFile(cleanPath, node);
          } else {
            selectShopFile(cleanPath);
          }
        });

        li.appendChild(fileRow);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  // --- Multi-Select Helper Functions ---
  function toggleSelectFile(filePath, meta = {}) {
    const cleanPath = filePath.replace(/\\/g, '/');
    if (selectedFiles.has(cleanPath)) {
      selectedFiles.delete(cleanPath);
      selectedFilesInfo.delete(cleanPath);
    } else {
      selectedFiles.add(cleanPath);
      selectedFilesInfo.set(cleanPath, {
        path: cleanPath,
        name: meta.name || cleanPath.split('/').pop(),
        isPdf: meta.isPdf !== undefined ? meta.isPdf : cleanPath.toLowerCase().endsWith('.pdf'),
        sizeMB: meta.sizeMB || '0'
      });
    }

    updateMultiSelectUI();
    const target = document.querySelector(`[data-file-path="${CSS.escape(cleanPath)}"]`);
    if (target) {
      const isSel = selectedFiles.has(cleanPath);
      target.classList.toggle('is-selected', isSel);
      target.classList.toggle('font-semibold', isSel);
      const cb = target.querySelector('.file-checkbox');
      if (cb) cb.checked = isSel;
    } else {
      renderShopTree();
    }
  }

  function clearAllSelectedFiles() {
    selectedFiles.clear();
    selectedFilesInfo.clear();
    updateMultiSelectUI();
    renderShopTree();
    window.showToast('File selection cleared');
  }

  function updateMultiSelectUI() {
    const bar = document.getElementById('multi-select-bar');
    const countEl = document.getElementById('multi-selected-count');
    const viewerMergeBtn = document.getElementById('viewer-merge-btn');
    const viewerMergeCount = document.getElementById('viewer-merge-count');
    const toggleBtn = document.getElementById('multi-select-toggle-btn');
    const toggleLabel = document.getElementById('multi-select-toggle-label');

    const count = selectedFiles.size;

    if (bar) {
      if (count > 0) {
        bar.classList.remove('hidden');
        if (countEl) countEl.innerText = `${count} file${count !== 1 ? 's' : ''} selected`;
      } else {
        bar.classList.add('hidden');
      }
    }

    if (viewerMergeBtn) {
      if (count >= 1) {
        viewerMergeBtn.classList.remove('hidden');
        if (viewerMergeCount) viewerMergeCount.innerText = count;
      } else {
        viewerMergeBtn.classList.add('hidden');
      }
    }

    const navMergeBadge = document.getElementById('nav-merge-badge');
    if (navMergeBadge) {
      if (count > 0) {
        navMergeBadge.classList.remove('hidden');
        navMergeBadge.innerText = count;
      } else {
        navMergeBadge.classList.add('hidden');
      }
    }

    if (window.renderMergeStudioWorkspace) {
      window.renderMergeStudioWorkspace();
    }

    if (toggleBtn && toggleLabel) {
      if (multiSelectMode) {
        toggleBtn.classList.add('bg-indigo-600', 'text-white');
        toggleBtn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
        toggleLabel.innerText = 'Exit Multi';
      } else {
        toggleBtn.classList.remove('bg-indigo-600', 'text-white');
        toggleBtn.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
        toggleLabel.innerText = 'Multi-Select';
      }
    }
  }

  // --- Merge Modal Management ---
  function openMergeModal() {
    if (selectedFiles.size < 1) {
      window.showToast('Please select at least 1 document to merge', 'error');
      return;
    }

    const modal = document.getElementById('pdf-merge-modal');
    const countEl = document.getElementById('merge-modal-count');
    const listEl = document.getElementById('merge-files-list');
    const filenameInput = document.getElementById('merge-output-filename');
    const targetFolderInput = document.getElementById('merge-target-folder');
    const statusBox = document.getElementById('merge-status-box');

    if (!modal) return;

    if (statusBox) statusBox.classList.add('hidden');

    if (countEl) countEl.innerText = selectedFiles.size;

    // Suggest intelligent merged file name based on selected items
    const selectedArray = Array.from(selectedFiles);
    const firstInfo = selectedFilesInfo.get(selectedArray[0]);
    if (filenameInput) {
      if (selectedArray.length === 1 && firstInfo) {
        filenameInput.value = `Copy_${firstInfo.name.replace(/\.pdf$/i, '')}.pdf`;
      } else if (firstInfo) {
        filenameInput.value = `Merged_${firstInfo.name.replace(/\.pdf$/i, '').substring(0, 20)}_and_${selectedArray.length - 1}_more.pdf`;
      } else {
        filenameInput.value = `Merged_Documents_${Date.now().toString().slice(-4)}.pdf`;
      }
    }

    if (targetFolderInput) {
      targetFolderInput.value = currentNavPath || '';
    }

    renderMergeModalList();
    modal.classList.remove('hidden');
  }

  function renderMergeModalList() {
    const listEl = document.getElementById('merge-files-list');
    const countEl = document.getElementById('merge-modal-count');
    if (!listEl) return;

    const filesArray = Array.from(selectedFiles);
    if (countEl) countEl.innerText = filesArray.length;

    if (filesArray.length === 0) {
      listEl.innerHTML = `<div class="text-slate-400 text-center py-4">No files selected.</div>`;
      return;
    }

    listEl.innerHTML = filesArray.map((path, idx) => {
      const info = selectedFilesInfo.get(path) || { name: path.split('/').pop(), isPdf: true };
      const isFirst = idx === 0;
      const isLast = idx === filesArray.length - 1;

      return `
        <div class="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 shadow-sm">
          <div class="flex items-center gap-2 min-w-0 flex-1 truncate">
            <span class="font-mono text-[10px] text-slate-400 font-bold w-4">${idx + 1}.</span>
            <span class="text-sm">${info.isPdf ? '📕' : '📄'}</span>
            <span class="font-medium text-slate-800 dark:text-slate-200 truncate">${window.escapeHtml(info.name)}</span>
            <span class="text-[9px] text-slate-400 font-mono truncate hidden sm:inline">/${window.escapeHtml(path)}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="window.FileBrowser.moveMergeItem(${idx}, -1)" ${isFirst ? 'disabled' : ''} class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-20" title="Move Up">▲</button>
            <button onclick="window.FileBrowser.moveMergeItem(${idx}, 1)" ${isLast ? 'disabled' : ''} class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-20" title="Move Down">▼</button>
            <button onclick="window.FileBrowser.removeMergeItem('${path.replace(/'/g, "\\'")}')" class="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-500 font-bold ml-1" title="Remove">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function moveMergeItem(index, delta) {
    const filesArray = Array.from(selectedFiles);
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= filesArray.length) return;

    const temp = filesArray[index];
    filesArray[index] = filesArray[targetIdx];
    filesArray[targetIdx] = temp;

    selectedFiles.clear();
    filesArray.forEach(p => selectedFiles.add(p));
    renderMergeModalList();
    updateMultiSelectUI();
  }

  function removeMergeItem(path) {
    selectedFiles.delete(path);
    selectedFilesInfo.delete(path);
    renderMergeModalList();
    updateMultiSelectUI();
    renderShopTree();
  }

  // --- Perform Merge Action (Save | Print | Download) ---
  async function executeMerge(actionType) {
    const filesArray = Array.from(selectedFiles);
    if (filesArray.length === 0) {
      window.showToast('No files to merge', 'error');
      return;
    }

    const filenameInput = document.getElementById('merge-output-filename');
    const targetFolderInput = document.getElementById('merge-target-folder');
    const statusBox = document.getElementById('merge-status-box');
    const statusText = document.getElementById('merge-status-text');

    let saveName = (filenameInput?.value || 'Merged_Documents.pdf').trim();
    if (!saveName.toLowerCase().endsWith('.pdf')) saveName += '.pdf';
    const targetFolder = (targetFolderInput?.value || '').trim();

    if (statusBox) statusBox.classList.remove('hidden');
    if (statusText) {
      statusText.innerText = actionType === 'save'
        ? `Merging and saving "${saveName}"...`
        : actionType === 'print'
        ? `Preparing merged document for printing...`
        : `Building merged PDF for download...`;
    }

    try {
      if (actionType === 'save') {
        const res = await fetch('/api/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: filesArray,
            saveName: saveName,
            targetFolder: targetFolder,
            action: 'save'
          })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Server merge failed');

        window.showToast(`Saved: ${data.fileName}`);

        // Close modal
        document.getElementById('pdf-merge-modal')?.classList.add('hidden');

        // Reload the affected folder and select newly created merged file
        if (data.savedPath) {
          await fetchFolderItems(targetFolder);
          await selectShopFile(data.savedPath);
        } else {
          await fetchShopFiles();
        }

      } else if (actionType === 'download') {
        const res = await fetch('/api/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: filesArray,
            saveName: saveName,
            action: 'download'
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Download failed');
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = saveName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        window.showToast(`Downloaded: ${saveName}`);
        document.getElementById('pdf-merge-modal')?.classList.add('hidden');

      } else if (actionType === 'print') {
        // Fetch merged file as blob and load into iframe or new tab to print
        const res = await fetch('/api/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: filesArray,
            saveName: saveName,
            action: 'view'
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Print generation failed');
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Load into main viewer iframe
        const iframe = document.getElementById('pdf-viewer-iframe');
        const placeholder = document.getElementById('pdf-viewer-placeholder');
        const selectedDisp = document.getElementById('selected-file-display');
        const subtext = document.getElementById('viewer-file-subtext');
        const badge = document.getElementById('viewer-pdf-badge');

        if (selectedDisp) selectedDisp.innerText = `Merged: ${saveName}`;
        if (badge) badge.classList.remove('hidden');
        if (subtext) subtext.innerText = `Combined ${filesArray.length} files (Ready to print)`;

        if (iframe && placeholder) {
          placeholder.classList.add('hidden');
          iframe.classList.remove('hidden');
          iframe.src = blobUrl;
        }

        document.getElementById('pdf-merge-modal')?.classList.add('hidden');
        window.showToast('Merged preview loaded. Opening print dialog...');

        // Trigger print after short delay
        setTimeout(() => {
          try {
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
            } else {
              window.open(blobUrl, '_blank');
            }
          } catch (e) {
            window.open(blobUrl, '_blank');
          }
        }, 500);
      }
    } catch (err) {
      console.error('Merge execution error:', err);
      window.showToast(`Error: ${err.message}`, 'error');
    } finally {
      if (statusBox) statusBox.classList.add('hidden');
    }
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

    const prevActive = document.querySelector('.tree-file-row.active');
    if (prevActive) prevActive.classList.remove('active');
    const target = document.querySelector(`[data-file-path="${CSS.escape(cleanPath)}"]`);
    if (target) {
      target.classList.add('active');
    } else {
      renderShopTree();
    }
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

    // Multi-Select toggle button
    document.getElementById('multi-select-toggle-btn')?.addEventListener('click', () => {
      multiSelectMode = !multiSelectMode;
      updateMultiSelectUI();
      renderShopTree();
      window.showToast(multiSelectMode ? 'Multi-select enabled: Click files or boxes to select' : 'Multi-select disabled');
    });

    // Clear selection
    document.getElementById('clear-selection-btn')?.addEventListener('click', clearAllSelectedFiles);

    // Open merge studio buttons (direct navigation to dedicated Merge Studio workspace)
    const handleOpenMergeStudio = () => {
      if (selectedFiles.size === 0 && activeShopFilePath && activeShopFilePath.toLowerCase().endsWith('.pdf')) {
        selectedFiles.add(activeShopFilePath);
        selectedFilesInfo.set(activeShopFilePath, {
          name: activeShopFilePath.split('/').pop(),
          isPdf: true,
          sizeMB: '0.00'
        });
      }
      if (typeof window.switchAppMode === 'function') {
        window.switchAppMode('merge');
      } else {
        openMergeModal();
      }
    };
    document.getElementById('open-merge-modal-btn')?.addEventListener('click', handleOpenMergeStudio);
    document.getElementById('viewer-merge-btn')?.addEventListener('click', handleOpenMergeStudio);

    // Close merge modal
    document.getElementById('close-merge-modal-btn')?.addEventListener('click', () => {
      document.getElementById('pdf-merge-modal')?.classList.add('hidden');
    });

    // Use current folder shortcut in merge modal
    document.getElementById('merge-use-current-folder')?.addEventListener('click', () => {
      const folderInput = document.getElementById('merge-target-folder');
      if (folderInput) folderInput.value = currentNavPath || '';
    });

    // Merge execution buttons
    document.getElementById('merge-save-btn')?.addEventListener('click', () => executeMerge('save'));
    document.getElementById('merge-download-btn')?.addEventListener('click', () => executeMerge('download'));
    document.getElementById('merge-print-btn')?.addEventListener('click', () => executeMerge('print'));

    // Mobile File Receiver Modal Controls
    setupTransferReceiverControls();
  }

  // --- Mobile-to-PC File Receiver via QR Code ---
  let transferPollInterval = null;
  let activeTransferSession = null;
  let activeTransferUrl = '';
  let transferQrInstance = null;

  function setupTransferReceiverControls() {
    const modal = document.getElementById('file-transfer-modal');
    const openBtn = document.getElementById('open-transfer-modal-btn');
    const closeBtn = document.getElementById('close-transfer-modal-btn');
    const openPortalBtn = document.getElementById('transfer-open-portal-btn');

    openBtn?.addEventListener('click', openTransferReceiverModal);
    closeBtn?.addEventListener('click', closeTransferReceiverModal);

    openPortalBtn?.addEventListener('click', () => {
      if (activeTransferUrl) {
        window.open(activeTransferUrl, '_blank');
      }
    });
  }

  async function openTransferReceiverModal() {
    const modal = document.getElementById('file-transfer-modal');
    const qrCanvas = document.getElementById('transfer-qr-canvas');
    const statusText = document.getElementById('transfer-status-text');
    const statusBadge = document.getElementById('transfer-status-badge');
    const receivedBox = document.getElementById('transfer-received-box');
    const receivedList = document.getElementById('transfer-received-list');
    const receivedCount = document.getElementById('transfer-received-count');

    if (!modal || !qrCanvas) return;

    modal.classList.remove('hidden');
    if (receivedBox) receivedBox.classList.add('hidden');
    if (receivedList) receivedList.innerHTML = '';
    if (receivedCount) receivedCount.innerText = '0';

    if (statusBadge) {
      statusBadge.className = 'px-4 py-1.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-2 animate-pulse';
    }
    if (statusText) statusText.innerText = 'En attente de connexion du téléphone...';

    // Generate unique session id
    activeTransferSession = 'TR-' + Date.now().toString().slice(-6);

    // Resolve host address for QR code
    let baseOrigin = window.location.origin;
    try {
      const res = await fetch('/api/pos/info');
      const data = await res.json();
      if (data.baseUrl) baseOrigin = data.baseUrl;
    } catch (e) {}

    activeTransferUrl = `${baseOrigin}/transfer?session=${encodeURIComponent(activeTransferSession)}`;

    // Render transfer connection QR
    qrCanvas.innerHTML = '';
    transferQrInstance = new QRCodeStyling({
      width: 190,
      height: 190,
      data: activeTransferUrl,
      dotsOptions: { color: '#4338ca', type: 'rounded' },
      cornersSquareOptions: { color: '#3730a3', type: 'extra-rounded' },
      backgroundOptions: { color: '#ffffff' }
    });
    transferQrInstance.append(qrCanvas);

    // Start Real-Time Receiver Polling for incoming files from mobile
    if (transferPollInterval) clearInterval(transferPollInterval);
    transferPollInterval = setInterval(async () => {
      if (!activeTransferSession) {
        clearInterval(transferPollInterval);
        return;
      }

      try {
        const res = await fetch(`/api/transfer/status/${encodeURIComponent(activeTransferSession)}`);
        const data = await res.json();

        if (data.success && data.hasFiles && data.files.length > 0) {
          handleReceivedMobileFiles(data.files);
        }
      } catch (err) {}
    }, 2000);
  }

  async function handleReceivedMobileFiles(files) {
    const statusText = document.getElementById('transfer-status-text');
    const statusBadge = document.getElementById('transfer-status-badge');
    const receivedBox = document.getElementById('transfer-received-box');
    const receivedList = document.getElementById('transfer-received-list');
    const receivedCount = document.getElementById('transfer-received-count');

    if (statusBadge) {
      statusBadge.className = 'px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-2';
    }
    if (statusText) statusText.innerText = `Reçu ${files.length} nouveau(x) fichier(s) !`;

    if (receivedBox) receivedBox.classList.remove('hidden');
    if (receivedCount) receivedCount.innerText = files.length;

    if (receivedList) {
      files.forEach(f => {
        const row = document.createElement('div');
        row.className = 'p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between';
        row.innerHTML = `
          <div class="flex items-center gap-1.5 truncate min-w-0">
            <span>${f.isPdf ? '📕' : '📄'}</span>
            <span class="font-bold text-slate-800 dark:text-slate-200 truncate">${window.escapeHtml(f.originalName || f.name)}</span>
          </div>
          <span class="text-[10px] font-mono text-indigo-500 font-bold ml-2 shrink-0">${f.sizeMB} MB</span>
        `;
        receivedList.appendChild(row);
      });
    }

    window.showToast(`Reçu ${files.length} document(s) dans uploads/ !`);

    // Invalidate and refresh loaded folders so 'uploads' folder updates live
    loadedFolders.delete('');
    loadedFolders.delete('uploads');
    await fetchFolderItems('');
    await fetchFolderItems('uploads');
    renderShopTree();

    // Automatically load the first received document in the main viewer
    if (files.length > 0) {
      const first = files[0];
      setTimeout(async () => {
        await selectShopFile(first.path);
      }, 500);
    }
  }

  function closeTransferReceiverModal() {
    document.getElementById('file-transfer-modal')?.classList.add('hidden');
    if (transferPollInterval) {
      clearInterval(transferPollInterval);
      transferPollInterval = null;
    }
  }

  // Export FileBrowser module API
  window.FileBrowser = {
    init: init,
    fetchFiles: fetchShopFiles,
    getSelectedFile: () => activeShopFilePath,
    selectFile: selectShopFile,
    navigateToFolder: navigateToFolder,
    getSelectedFiles: () => Array.from(selectedFiles),
    openMergeModal: openMergeModal,
    moveMergeItem: moveMergeItem,
    removeMergeItem: removeMergeItem,
    clearSelection: clearAllSelectedFiles,
    openTransferReceiver: openTransferReceiverModal
  };
  window.selectShopFile = selectShopFile;
})();
