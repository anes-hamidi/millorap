// ==============================================================================
// BACKGROUND SEARCH WORKER (OFF-MAIN-THREAD SEARCH INDEX FOR 42,000+ PRODUCTS)
// ==============================================================================
// Memory target: < 5MB for 42,000 items.
// Speed target:  < 5ms per query, zero main-thread UI impact.
// ==============================================================================

(function() {
  // In-memory compact item index
  // Each item: { id, b: barcode, n: normalizedName, c: category, s: stock, t: threshold }
  let items = [];
  const idMap = new Map();
  // Inverted 3-character token index: prefix -> Array of item indices
  const tokenIndex = new Map();

  function normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim();
  }

  function indexItem(idx, item) {
    const normName = normalize(item.name || '');
    const barcode = (item.barcode ? String(item.barcode).toLowerCase().trim() : '');
    const tokens = normName.split(/\s+/).filter(Boolean);

    // Index tokens
    const seen = new Set();
    for (const token of tokens) {
      // Index prefixes from length 2 to min(token.length, 6)
      for (let len = 2; len <= Math.min(token.length, 6); len++) {
        const prefix = token.slice(0, len);
        if (!seen.has(prefix)) {
          seen.add(prefix);
          let list = tokenIndex.get(prefix);
          if (!list) {
            list = [];
            tokenIndex.set(prefix, list);
          }
          list.push(idx);
        }
      }
    }

    // Index barcode prefixes
    if (barcode.length >= 3) {
      for (let len = 3; len <= Math.min(barcode.length, 8); len++) {
        const bPref = 'b:' + barcode.slice(0, len);
        if (!seen.has(bPref)) {
          seen.add(bPref);
          let list = tokenIndex.get(bPref);
          if (!list) {
            list = [];
            tokenIndex.set(bPref, list);
          }
          list.push(idx);
        }
      }
    }
  }

  function buildFullIndex(rawItems) {
    items = [];
    idMap.clear();
    tokenIndex.clear();

    const len = rawItems.length;
    items = new Array(len);

    for (let i = 0; i < len; i++) {
      const p = rawItems[i];
      const entry = {
        id: p.id,
        b: p.barcode ? String(p.barcode).trim() : '',
        n: normalize(p.name || ''),
        c: p.category || '',
        s: Number(p.currentStock) || 0,
        t: Number(p.lowStockThreshold != null ? p.lowStockThreshold : 10)
      };
      items[i] = entry;
      idMap.set(entry.id, i);
      indexItem(i, p);
    }
  }

  function search({ query = '', category = 'all', stockFilter = 'all', page = 0, pageSize = 36 }) {
    const cleanQ = normalize(query);
    const isCategoryFilter = category && category !== 'all';
    const isStockFilter = stockFilter && stockFilter !== 'all';

    // If query is empty, filter sequentially or return slice
    if (!cleanQ) {
      let matchedIndices = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (isCategoryFilter && it.c.toLowerCase() !== category.toLowerCase()) continue;
        if (isStockFilter) {
          if (stockFilter === 'in_stock' && it.s <= it.t) continue;
          if (stockFilter === 'low_stock' && (it.s <= 0 || it.s > it.t)) continue;
          if (stockFilter === 'out_of_stock' && it.s > 0) continue;
        }
        matchedIndices.push(it.id);
      }
      const total = matchedIndices.length;
      const start = page * pageSize;
      const pagedIds = matchedIndices.slice(start, start + pageSize);
      return { ids: pagedIds, total, page, pageSize, hasMore: (start + pageSize) < total };
    }

    const queryTokens = cleanQ.split(/\s+/).filter(Boolean);
    const isBarcode = /^\d{3,}$/.test(cleanQ);

    let candidateIndices = null;

    if (isBarcode) {
      const bKey = 'b:' + cleanQ.slice(0, Math.min(cleanQ.length, 8));
      const bMatches = tokenIndex.get(bKey);
      if (bMatches) {
        candidateIndices = bMatches;
      }
    }

    if (!candidateIndices) {
      // Find candidate indices using inverted index intersection
      for (const t of queryTokens) {
        const key = t.slice(0, Math.min(t.length, 6));
        const posting = tokenIndex.get(key);
        if (!posting) {
          candidateIndices = [];
          break;
        }
        if (candidateIndices === null) {
          candidateIndices = posting;
        } else if (posting.length < candidateIndices.length) {
          // Keep smaller set and filter
          const set = new Set(candidateIndices);
          candidateIndices = posting.filter(idx => set.has(idx));
        } else {
          const set = new Set(posting);
          candidateIndices = candidateIndices.filter(idx => set.has(idx));
        }
        if (candidateIndices.length === 0) break;
      }
    }

    // Fallback if token wasn't indexed (e.g. 1-character search)
    const listToScan = (candidateIndices && candidateIndices.length > 0) ? candidateIndices : (cleanQ.length <= 1 ? [] : null);

    const results = [];
    if (listToScan !== null) {
      for (let i = 0; i < listToScan.length; i++) {
        const idx = listToScan[i];
        const it = items[idx];
        if (!it) continue;

        if (isCategoryFilter && it.c.toLowerCase() !== category.toLowerCase()) continue;
        if (isStockFilter) {
          if (stockFilter === 'in_stock' && it.s <= it.t) continue;
          if (stockFilter === 'low_stock' && (it.s <= 0 || it.s > it.t)) continue;
          if (stockFilter === 'out_of_stock' && it.s > 0) continue;
        }

        // Exact substring verification
        let match = true;
        for (const t of queryTokens) {
          if (!it.n.includes(t) && !it.b.toLowerCase().includes(t)) {
            match = false;
            break;
          }
        }
        if (match) results.push(it.id);
      }
    } else {
      // Broad scan across items (capped)
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (isCategoryFilter && it.c.toLowerCase() !== category.toLowerCase()) continue;
        if (isStockFilter) {
          if (stockFilter === 'in_stock' && it.s <= it.t) continue;
          if (stockFilter === 'low_stock' && (it.s <= 0 || it.s > it.t)) continue;
          if (stockFilter === 'out_of_stock' && it.s > 0) continue;
        }

        let match = true;
        for (const t of queryTokens) {
          if (!it.n.includes(t) && !it.b.toLowerCase().includes(t)) {
            match = false;
            break;
          }
        }
        if (match) results.push(it.id);
      }
    }

    const total = results.length;
    const start = page * pageSize;
    const pagedIds = results.slice(start, start + pageSize);

    return {
      ids: pagedIds,
      total,
      page,
      pageSize,
      hasMore: (start + pageSize) < total
    };
  }

  // Handle incoming messages from the Main Thread
  self.onmessage = function(e) {
    const { action, payload, requestId } = e.data || {};

    if (action === 'INIT_INDEX') {
      const startTime = performance.now();
      buildFullIndex(payload.items || []);
      const elapsed = Math.round(performance.now() - startTime);
      self.postMessage({
        action: 'INIT_COMPLETE',
        count: items.length,
        timeMs: elapsed
      });
    } else if (action === 'SEARCH') {
      const startTime = performance.now();
      const res = search(payload || {});
      const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
      self.postMessage({
        action: 'SEARCH_RESULT',
        requestId,
        result: res,
        timeMs: elapsed
      });
    } else if (action === 'UPSERT') {
      const p = payload;
      if (!p || !p.id) return;
      let existingIdx = idMap.get(p.id);
      const entry = {
        id: p.id,
        b: p.barcode ? String(p.barcode).trim() : '',
        n: normalize(p.name || ''),
        c: p.category || '',
        s: Number(p.currentStock) || 0,
        t: Number(p.lowStockThreshold != null ? p.lowStockThreshold : 10)
      };
      if (existingIdx !== undefined) {
        items[existingIdx] = entry;
      } else {
        const newIdx = items.length;
        items.push(entry);
        idMap.set(p.id, newIdx);
        indexItem(newIdx, p);
      }
    } else if (action === 'DELETE') {
      const id = payload;
      const idx = idMap.get(id);
      if (idx !== undefined) {
        items[idx] = null; // Mark as tombstone
        idMap.delete(id);
      }
    }
  };
})();
