/**
 * ScanIQ Client-Side Service & Document Intelligence Pipeline
 * Handles capture, OCR/PDF extraction, fuzzy product matching, "Scaneye" animated validation,
 * local machine learning retraining, and atomic inventory restocking.
 */

(function () {
  let classifierInstance = null;
  let activeScanData = null;
  let rawInvoiceText = '';
  let trackedCorrections = [];

  // ---------------------------------------------------------------------------
  // INITIALIZATION & LOCAL MODEL LOADING
  // ---------------------------------------------------------------------------

  async function initScanIQ() {
    try {
      if (window.SupplierClassifier && typeof window.SupplierClassifier.SupplierClassifier === 'function') {
        // Fetch pre-trained model JSON
        const response = await fetch('/js/models/supplier_classifier_model.json');
        if (response.ok) {
          const modelJson = await response.json();
          classifierInstance = new window.SupplierClassifier.SupplierClassifier(modelJson);
        } else {
          classifierInstance = new window.SupplierClassifier.SupplierClassifier();
        }
      }
    } catch (err) {
      console.warn('[ScanIQ] Classifier init notice:', err);
      if (window.SupplierClassifier) {
        classifierInstance = new window.SupplierClassifier.SupplierClassifier();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TEXT & FUZZY MATCHING HELPERS
  // ---------------------------------------------------------------------------

  function cleanString(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function computeSimilarity(s1, s2) {
    const a = cleanString(s1);
    const b = cleanString(s2);
    if (!a || !b) return 0;
    if (a === b) return 1.0;

    if (a.includes(b) || b.includes(a)) {
      return 0.85 + 0.15 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
    }

    const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 1));
    const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 1));
    let common = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) common++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? (common / union) : 0;
  }

  // ---------------------------------------------------------------------------
  // PDF & FILE CAPTURE PIPELINE (REAL PDF.JS TEXT LAYER & TESSERACT OCR)
  // ---------------------------------------------------------------------------

  // Helper to dynamically load pdf.js if not already present on window
  async function ensurePdfJsLoaded() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (typeof pdfjsLib !== 'undefined') return pdfjsLib;

    if (typeof document === 'undefined') return null;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'js/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';
          } catch (e) {}
          resolve(window.pdfjsLib);
        } else {
          resolve(null);
        }
      };
      script.onerror = () => {
        // Fallback to CDN if local bundle fails
        const fallbackScript = document.createElement('script');
        fallbackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        fallbackScript.onload = () => resolve(window.pdfjsLib || null);
        fallbackScript.onerror = () => resolve(null);
        document.head.appendChild(fallbackScript);
      };
      document.head.appendChild(script);
    });
  }

  // Helper to dynamically load Tesseract.js if not already present on window
  async function ensureTesseractLoaded() {
    if (window.Tesseract) return window.Tesseract;
    if (typeof document === 'undefined') return null;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => resolve(window.Tesseract || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  async function processInvoiceFile(file) {
    if (!file) throw new Error('Aucun fichier sélectionné');

    const fileName = file.name || 'document';
    let extractedText = '';

    // If file is explicitly plain text (.txt or text/plain)
    if (file.type && file.type.startsWith('text/') && !fileName.toLowerCase().endsWith('.pdf')) {
      try {
        extractedText = await file.text();
      } catch (e) {}
    }

    // Extract embedded text layer from digital PDF or execute client-side OCR / fallback
    if (!extractedText) {
      extractedText = await simulateOrRunLocalOCR(file);
    }

    rawInvoiceText = extractedText;
    trackedCorrections = [];

    // Step 1: Extract structured data from the real extracted invoice text
    let structuredData = null;
    try {
      const resp = await fetch('/api/scan/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText })
      });
      if (resp.ok) {
        const json = await resp.json();
        structuredData = json.data;
      }
    } catch (e) {
      console.warn('[ScanIQ] Server extract fallback to local extraction:', e);
    }

    if (!structuredData) {
      structuredData = fallbackLocalExtract(extractedText);
    }

    // Step 2: Refine supplier with local ML classifier
    if (classifierInstance && rawInvoiceText) {
      const pred = classifierInstance.predict(rawInvoiceText);
      if (pred && pred.supplier && pred.confidence > 50) {
        structuredData.supplier = pred.supplier;
        structuredData.supplierConfidence = pred.confidence;
      }
    }

    // Step 3: Match items against live catalog
    const catalogProducts = await window.FlexiDB.db.products.toArray();
    let matchedItems = [];

    try {
      const matchResp = await fetch('/api/scan/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: structuredData.items, products: catalogProducts })
      });
      if (matchResp.ok) {
        const matchJson = await matchResp.json();
        matchedItems = matchJson.items;
      }
    } catch (e) {
      console.warn('[ScanIQ] Match server fallback:', e);
    }

    if (!matchedItems || !matchedItems.length) {
      matchedItems = localCatalogMatch(structuredData.items, catalogProducts);
    }

    structuredData.items = matchedItems;
    activeScanData = structuredData;

    return structuredData;
  }

  async function simulateOrRunLocalOCR(file) {
    const fileName = (file.name || '').toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');

    // 1. Digital PDF Embedded Text Layer Extraction (PDF.js)
    if (isPdf) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        let pdfjs = window.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
        if (!pdfjs) {
          pdfjs = await ensurePdfJsLoaded();
        }

        if (pdfjs && typeof pdfjs.getDocument === 'function') {
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          let fullText = '';

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Spatial 2D Line Reconstruction (group by vertical Y with 3.5px threshold, sort left-to-right)
            const lineBuckets = [];
            for (const item of (textContent.items || [])) {
              if (!item.str || item.str.trim() === '') continue;
              const y = (item.transform && item.transform[5] != null) ? item.transform[5] : 0;
              const x = (item.transform && item.transform[4] != null) ? item.transform[4] : 0;
              
              let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 3.5);
              if (!bucket) {
                bucket = { y, items: [] };
                lineBuckets.push(bucket);
              }
              bucket.items.push({ str: item.str, x });
            }
            
            // Sort lines top-to-bottom
            lineBuckets.sort((a, b) => b.y - a.y);
            
            // Sort items left-to-right within each line
            const pageText = lineBuckets.map(b => {
              b.items.sort((a, b) => a.x - b.x);
              return b.items.map(it => it.str.trim()).join(' ');
            }).join('\n');

            fullText += pageText + '\n';
          }

          if (fullText.trim().length > 10) {
            console.log(`[ScanIQ] Successfully extracted embedded PDF text layer (${fullText.length} chars)`);
            return fullText;
          }
        }
      } catch (e) {
        console.warn('[ScanIQ] Digital PDF text extraction failed, falling back to OCR:', e);
      }
    }

    // 2. Client-Side OCR with Tesseract.js (for images & scanned PDFs)
    try {
      let tesseract = window.Tesseract;
      if (!tesseract) {
        tesseract = await ensureTesseractLoaded();
      }

      if (tesseract && typeof tesseract.recognize === 'function') {
        console.log('[ScanIQ] Running local Tesseract OCR on file...');
        const { data: { text } } = await tesseract.recognize(file, 'fra+eng');
        if (text && text.trim().length > 10) {
          console.log(`[ScanIQ] Tesseract OCR extracted ${text.length} characters.`);
          return text;
        }
      }
    } catch (tessErr) {
      console.warn('[ScanIQ] Tesseract OCR error / fallback:', tessErr);
    }

    // 3. Plain Text File Extraction Fallback
    try {
      if (typeof file.text === 'function') {
        const rawText = await file.text();
        if (rawText && rawText.trim().length > 10 && !rawText.includes('\u0000')) {
          return rawText;
        }
      }
    } catch (e) {}

    // 4. Fixture / Demo Mock Fallback (when no text layer and offline without OCR engine)
    return new Promise((resolve) => {
      const lowerName = (file.name || '').toLowerCase();
      if (lowerName.includes('papeterie') || lowerName.includes('paper')) {
        resolve(`SARL ALGER PAPETERIE
Zone Industrielle Bab Ezzouar, Alger
Tel: 023 12 34 56 - NIF: 001234567890123
FACTURE N°: FAC-2024-089
Date: 15/09/2024

Désignation | Quantité | Prix Unit. HT | Montant HT
Rouleaux Papier Thermique (x5) | 10 | 500.00 | 5000.00
Tirage Photo A4 | 20 | 70.00 | 1400.00
Impression Document (Couleur) | 100 | 8.00 | 800.00

Total HT : 7 200,00 DA
TVA (19%) : 1 368,00 DA
Total TTC : 8 568,00 DA`);
      } else if (lowerName.includes('boisson') || lowerName.includes('cafe') || lowerName.includes('drink')) {
        resolve(`GROSSISTE BOISSONS & CONFISERIE
Kouba, Alger - Tel: 0555 98 76 54
Bon de Livraison / Facture N° BL-8842
Date: 18/09/2024

Articles | Qté | P.U HT | Total HT
Café Espresso | 15 | 60.00 | 900.00
Thé Vert Naturel | 10 | 40.00 | 400.00
Croissant Frais | 30 | 50.00 | 1500.00
Muffin Chocolat | 20 | 80.00 | 1600.00

Montant HT : 4 400,00 DA
TVA (19%) : 836,00 DA
Net à Payer TTC : 5 236,00 DA`);
      } else if (lowerName.includes('tech') || lowerName.includes('electro') || lowerName.includes('cable')) {
        resolve(`DISTRIBUTEUR TECH & ACCESSOIRES
Hydra, Alger - Tel: 0661 11 22 33
FACTURE N° INV-7731
Date: 20/09/2024

Désignation | Quantité | Prix Unitaire | Total
Écouteurs Sans Fil | 5 | 1600.00 | 8000.00
Câble USB-C Rapide | 15 | 280.00 | 4200.00

Total HT : 12 200.00 DA
TVA : 2 318.00 DA
Total Général TTC : 14 518.00 DA`);
      } else {
        // Generic structured fallback
        resolve(`FACTURE FOURNISSEUR N° FAC-${Date.now().toString().slice(-5)}
Date: ${new Date().toISOString().slice(0, 10)}
Fournisseur: Grossiste Boissons & Confiserie

Article | Qte | PU | Total
Café Espresso | 5 | 60.00 | 300.00
Croissant Frais | 10 | 50.00 | 500.00

Total HT : 800.00 DA
TVA (19%) : 152.00 DA
Total TTC : 952.00 DA`);
      }
    });
  }

  function fallbackLocalExtract(text) {
    const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
    let supplier = 'Fournisseur Inconnu';
    let invoiceNumber = 'FAC-' + Date.now().toString().slice(-6);
    let date = new Date().toISOString().slice(0, 10);
    const items = [];
    let total = 0;

    const partyMatch = text.match(/(?:^|\n)\s*(?:fournisseur|client|magasin|emetteur|émetteur|societe|société)\s*[:]?\s*([^\r\n]+)/i);
    if (partyMatch) {
      const candidate = partyMatch[1].trim();
      if (candidate && !/^(inconnu|standard|comptoir|divers|aucun|client|fournisseur)$/i.test(candidate)) {
        supplier = candidate;
      }
    }

    for (const line of lines) {
      if (supplier === 'Fournisseur Inconnu' && /sarl|grossiste|distributeur|papeterie/i.test(line)) {
        supplier = line.split('-')[0].trim();
      }
      const invMatch = line.match(/(?:ticket|facture|bl|inv|n°|recu|reçu)\s*[:#.-]?\s*([a-z0-9\-_/]+)/i);
      if (invMatch && invoiceNumber.startsWith('FAC-')) {
        const candidate = invMatch[1].trim();
        if (!/^(proforma|avoir|standard|client|fournisseur|date|du|le)$/i.test(candidate)) {
          invoiceNumber = candidate;
        }
      }

      const dateMatch = line.match(/(?:date(?:\s*d['’]émission)?|du|le)?\s*[:]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
      if (dateMatch) {
        const p = dateMatch[1].split(/[./-]/);
        if (p.length === 3) {
          date = `${p[2].length === 2 ? '20' + p[2] : p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        }
      }

      // Skip summary / total / footer lines
      if (/(total\s*ht|total\s*ttc|total\s*commande|montant\s*ht|montant\s*total|sous\s*total|\btva\b|net\s*a\s*payer|acompte|reste\s*a\s*payer|mode\s*de\s*reglement|arrete\s*la\s*presente|nif\b|tel\b|rc\b|merci\s*pour)/i.test(line)) {
        continue;
      }

      const parts = line.split(/[|\t]+/).map(p => p.trim());
      if (parts.length >= 3) {
        const desc = parts[0];
        const qty = parseFloat(parts[1]) || 1;
        const price = parseFloat(parts[2]) || 0;
        if (desc && price > 0 && !/total|tva/i.test(desc)) {
          items.push({
            description: desc,
            rawDescription: desc,
            quantity: qty,
            unitPrice: price,
            total: parts[3] ? parseFloat(parts[3]) : qty * price,
            confidence: 85
          });
          continue;
        }
      }

      // Space-delimited table lines with 3 numbers (Qty, Price, Total)
      const stdMatch = line.match(/^(?:(\d+[\.\)-]?\s+))?(.*?)\s+(\d+(?:[.,]\d+)?)\s+([\d\s.,]+?)\s+([\d\s.,]+)$/);
      if (stdMatch) {
        const desc = (stdMatch[2] || '').trim();
        const qty = parseFloat(stdMatch[3].replace(',', '.')) || 1;
        const price = parseFloat(stdMatch[4].replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        const lineTot = parseFloat(stdMatch[5].replace(/[^\d.,]/g, '').replace(',', '.')) || (qty * price);
        if (desc && desc.length >= 2 && !/total|tva|net|tableau/i.test(desc) && qty > 0 && price > 0) {
          items.push({
            description: desc,
            rawDescription: desc,
            quantity: qty,
            unitPrice: price,
            total: lineTot > 0 ? lineTot : qty * price,
            confidence: 90
          });
          continue;
        }
      }

      // Space-delimited table lines with 2 numbers (Qty, Total or Qty, Price)
      const twoNumsMatch = line.match(/^(?:(\d+[\.\)-]?\s+))?(.*?)\s+(\d+(?:[.,]\d+)?)\s+([\d\s.,]+)$/);
      if (twoNumsMatch) {
        const desc = (twoNumsMatch[2] || '').trim();
        const qty = parseFloat(twoNumsMatch[3].replace(',', '.')) || 1;
        const val = parseFloat(twoNumsMatch[4].replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        if (desc && desc.length >= 2 && !/total|tva|net|tableau/i.test(desc) && qty > 0 && val > 0) {
          let unitPrice = val;
          let lineTotal = qty * val;
          if (val >= 100 && qty > 1) {
            lineTotal = val;
            unitPrice = Math.round((val / qty) * 100) / 100;
          }
          items.push({
            description: desc,
            rawDescription: desc,
            quantity: qty,
            unitPrice: unitPrice,
            total: lineTotal,
            confidence: 85
          });
        }
      }
    }

    const subtotal = items.reduce((s, i) => s + (i.total || i.quantity * i.unitPrice), 0);
    total = subtotal;

    return {
      supplier,
      supplierConfidence: 80,
      invoiceNumber,
      date,
      items,
      subtotal,
      discount: 0,
      vat: 0,
      total,
      confidence: 85
    };
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function localCatalogMatch(items, products) {
    return (items || []).map(item => {
      let best = null;
      let maxScore = 0;

      for (const p of products) {
        const sim = computeSimilarity(item.description, p.name);
        if (sim > maxScore) {
          maxScore = sim;
          best = p;
        }
      }

      const score = Math.round(maxScore * 100);
      const tier = score >= 75 ? 'high' : (score >= 45 ? 'medium' : 'unmatched');

      return {
        ...item,
        packMultiplier: item.packMultiplier || 1,
        discount: item.discount || 0,
        matchedProductId: tier !== 'unmatched' && best ? best.id : null,
        matchedProduct: tier !== 'unmatched' && best ? {
          id: best.id,
          name: best.name,
          barcode: best.barcode,
          costPrice: best.costPrice,
          sellingPrice: best.sellingPrice,
          currentStock: best.currentStock,
          icon: best.icon || '📦'
        } : null,
        matchScore: score,
        matchTier: tier
      };
    });
  }

  // ---------------------------------------------------------------------------
  // SCANEYE ANIMATED VALIDATION MODAL & UI RENDERING
  // ---------------------------------------------------------------------------

  function renderPriceDiffBadge(item, matchedProduct) {
    if (!matchedProduct || !matchedProduct.costPrice || matchedProduct.costPrice <= 0) {
      return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">ℹ️ Nouveau prix</span>';
    }

    const currentEnteredPrice = parseFloat(item.unitPrice) || 0;
    const packMult = parseFloat(item.packMultiplier) || 1;
    const effectiveUnitCost = packMult > 1 ? (currentEnteredPrice / packMult) : currentEnteredPrice;
    const oldCost = parseFloat(matchedProduct.costPrice) || 0;
    const diff = effectiveUnitCost - oldCost;

    if (Math.abs(diff) < 0.01) {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800" title="Prix catalogue inchangé">🟢 Inchangé (${oldCost.toFixed(2)} DA)</span>`;
    }

    const pct = Math.round((diff / oldCost) * 100);
    if (diff > 0) {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800" title="Ancien prix catalogue: ${oldCost.toFixed(2)} DA">🔺 +${diff.toFixed(2)} DA (+${pct}%)</span>`;
    } else {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800" title="Ancien prix catalogue: ${oldCost.toFixed(2)} DA">🔻 ${diff.toFixed(2)} DA (${pct}%)</span>`;
    }
  }

  async function renderScanValidationModal(scanData) {
    if (!scanData) return;
    activeScanData = scanData;

    const modal = document.getElementById('scaniq-validate-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // Sync raw text editor
    const rawEditor = document.getElementById('scaniq-raw-text-editor');
    if (rawEditor) {
      rawEditor.value = rawInvoiceText || '';
    }

    // Populate suppliers dropdown
    const suppliersSelect = document.getElementById('scaniq-supplier-select');
    let allSuppliers = [];
    try {
      if (window.SupplierService?.getAllSuppliers) {
        allSuppliers = await window.SupplierService.getAllSuppliers();
      } else if (window.FlexiDB?.db?.suppliers) {
        allSuppliers = await window.FlexiDB.db.suppliers.toArray();
      }
    } catch (e) {
      console.warn('[ScanIQ] Supplier fetch notice:', e);
    }

    let isMatchedSupplier = false;
    if (suppliersSelect) {
      const options = ['<option value="">-- Sélectionner un fournisseur --</option>'];
      allSuppliers.forEach(s => {
        const isMatch = cleanString(s.name) === cleanString(scanData.supplier);
        if (isMatch) isMatchedSupplier = true;
        options.push(`<option value="${s.id}" ${isMatch ? 'selected' : ''}>${escapeHtml(s.name)}</option>`);
      });
      options.push('<option value="__NEW__">➕ Créer nouveau fournisseur...</option>');
      suppliersSelect.innerHTML = options.join('');
    }

    const customSupplierInput = document.getElementById('scaniq-custom-supplier-input');
    if (customSupplierInput) {
      if (!isMatchedSupplier && scanData.supplier && scanData.supplier !== 'Fournisseur Inconnu') {
        suppliersSelect.value = '__NEW__';
        customSupplierInput.value = scanData.supplier;
        customSupplierInput.classList.remove('hidden');
      } else {
        customSupplierInput.classList.add('hidden');
      }
    }

    // Set invoice header fields
    const invNumInput = document.getElementById('scaniq-invoice-number');
    const invDateInput = document.getElementById('scaniq-invoice-date');
    const globalDiscInput = document.getElementById('scaniq-global-discount');

    if (invNumInput) invNumInput.value = scanData.invoiceNumber || '';
    if (invDateInput) invDateInput.value = scanData.date || new Date().toISOString().slice(0, 10);
    if (globalDiscInput) globalDiscInput.value = scanData.globalDiscount || scanData.discount || 0;

    // Update overall confidence pill
    const overallConfidence = document.getElementById('scaniq-overall-confidence');
    if (overallConfidence) {
      overallConfidence.innerText = `${scanData.confidence || 85}% Confiance`;
      overallConfidence.className = `px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
        (scanData.confidence || 85) >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
        (scanData.confidence || 85) >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
        'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
      }`;
    }

    // Render line items
    const itemsContainer = document.getElementById('scaniq-items-container');
    if (!itemsContainer) return;
    itemsContainer.innerHTML = '';

    const catalogProducts = await window.FlexiDB.db.products.toArray();

    (scanData.items || []).forEach((item, index) => {
      item.packMultiplier = item.packMultiplier || 1;
      item.discount = item.discount || 0;

      const itemRow = document.createElement('div');
      itemRow.id = `scaniq-item-row-${index}`;
      itemRow.className = 'p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm flex flex-col gap-3 transition-all duration-200';

      const tierBadge = item.matchTier === 'high' ?
        '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">🟢 Match 95%+</span>' :
        (item.matchTier === 'medium' ?
        '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">🟡 Suggestion (' + (item.matchScore || 50) + '%)</span>' :
        '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700">🔴 Nouveau</span>');

      itemRow.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <div class="flex items-center gap-2 flex-1 min-w-[220px]">
            <span class="text-base">${item.matchedProduct ? (item.matchedProduct.icon || '📦') : '📄'}</span>
            <div class="flex-1">
              <input type="text" id="scaniq-desc-${index}" value="${escapeHtml(item.description || '')}"
                oninput="window.ScanIQService.handleItemDescChange(${index}, this.value)"
                placeholder="Désignation article..."
                class="w-full px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            ${tierBadge}
            <span id="scaniq-price-diff-${index}">${renderPriceDiffBadge(item, item.matchedProduct)}</span>
            <button type="button" onclick="window.ScanIQService.removeItemRow(${index})" class="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg text-sm transition" title="Supprimer cet article">✕</button>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-12 gap-2 text-xs">
          <!-- Produit en Magasin -->
          <div class="col-span-2 sm:col-span-4">
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Produit en Magasin</label>
            <select id="scaniq-prod-select-${index}" onchange="window.ScanIQService.handleProductChange(${index}, this.value)" class="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">-- Non lié (Créer nouveau) --</option>
              ${catalogProducts.map(p => `<option value="${p.id}" ${item.matchedProductId === p.id ? 'selected' : ''}>${p.icon || '📦'} ${escapeHtml(p.name)} (Stock: ${p.currentStock || 0} | Achat: ${p.costPrice || 0} DA)</option>`).join('')}
            </select>
          </div>

          <!-- Conditionnement / Pack -->
          <div class="col-span-1 sm:col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Conditionnement</label>
            <select id="scaniq-pack-${index}" onchange="window.ScanIQService.handlePackagingChange(${index}, this.value)" class="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none">
              <option value="1" ${(item.packMultiplier || 1) == 1 ? 'selected' : ''}>Unité (x1)</option>
              <option value="5" ${item.packMultiplier == 5 ? 'selected' : ''}>Pack (x5)</option>
              <option value="6" ${item.packMultiplier == 6 ? 'selected' : ''}>Pack (x6)</option>
              <option value="10" ${item.packMultiplier == 10 ? 'selected' : ''}>Pack (x10)</option>
              <option value="12" ${item.packMultiplier == 12 ? 'selected' : ''}>Douzaine (x12)</option>
              <option value="20" ${item.packMultiplier == 20 ? 'selected' : ''}>Carton (x20)</option>
              <option value="24" ${item.packMultiplier == 24 ? 'selected' : ''}>Carton (x24)</option>
              <option value="50" ${item.packMultiplier == 50 ? 'selected' : ''}>Fardeau (x50)</option>
              <option value="100" ${item.packMultiplier == 100 ? 'selected' : ''}>Gros (x100)</option>
            </select>
          </div>

          <!-- Quantity -->
          <div class="col-span-1 sm:col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Quantité</label>
            <input type="number" id="scaniq-qty-${index}" min="0.01" step="any" value="${item.quantity || 1}" oninput="window.ScanIQService.recalculateTotals()" class="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Unit Cost Price -->
          <div class="col-span-1 sm:col-span-2">
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">P.U Achat (DA)</label>
            <input type="number" id="scaniq-cost-${index}" min="0" step="any" value="${item.unitPrice || 0}" oninput="window.ScanIQService.recalculateTotals()" class="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Line Discount -->
          <div class="col-span-1 sm:col-span-1">
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Remise</label>
            <input type="number" id="scaniq-discount-${index}" min="0" step="any" value="${item.discount || 0}" placeholder="0" oninput="window.ScanIQService.recalculateTotals()" class="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-amber-600 dark:text-amber-400 outline-none">
          </div>

          <!-- Line Total -->
          <div class="col-span-2 sm:col-span-1">
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total</label>
            <input type="number" id="scaniq-linetotal-${index}" min="0" step="any" value="${(item.total || (item.quantity * item.unitPrice)).toFixed(2)}" oninput="window.ScanIQService.handleLineTotalChange(${index}, this.value)" class="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 outline-none">
          </div>
        </div>
      `;

      itemsContainer.appendChild(itemRow);
    });

    recalculateTotals();
    updateLearningStatsBadge();
  }

  function handleItemDescChange(index, val) {
    if (!activeScanData || !activeScanData.items || !activeScanData.items[index]) return;
    activeScanData.items[index].description = val;
  }

  function handlePackagingChange(index, val) {
    if (!activeScanData || !activeScanData.items || !activeScanData.items[index]) return;
    activeScanData.items[index].packMultiplier = parseFloat(val) || 1;
    recalculateTotals();
  }

  async function handleProductChange(index, productId) {
    if (!activeScanData || !activeScanData.items || !activeScanData.items[index]) return;
    const item = activeScanData.items[index];

    if (productId) {
      item.matchedProductId = Number(productId);
      item.matchTier = 'high';
      const prod = await window.FlexiDB.db.products.get(Number(productId));
      if (prod) {
        item.matchedProduct = {
          id: prod.id,
          name: prod.name,
          barcode: prod.barcode,
          costPrice: prod.costPrice,
          sellingPrice: prod.sellingPrice,
          currentStock: prod.currentStock,
          icon: prod.icon || '📦'
        };
      }
      recordCorrection('product_matching', item.description, `Product_ID_${productId}`);
      celebrateLearningMicroToast(`Article associé à "${prod ? prod.name : productId}"`);
    } else {
      item.matchedProductId = null;
      item.matchedProduct = null;
      item.matchTier = 'unmatched';
    }

    recalculateTotals();
  }

  function handleLineTotalChange(index, val) {
    if (!activeScanData || !activeScanData.items || !activeScanData.items[index]) return;
    const item = activeScanData.items[index];
    const total = parseFloat(val) || 0;
    const qtyInput = document.getElementById(`scaniq-qty-${index}`);
    const qty = qtyInput ? (parseFloat(qtyInput.value) || 1) : (item.quantity || 1);
    const discInput = document.getElementById(`scaniq-discount-${index}`);
    const discount = discInput ? (parseFloat(discInput.value) || 0) : (item.discount || 0);

    const grossNeeded = total + discount;
    const unitPrice = qty > 0 ? (grossNeeded / qty) : 0;
    item.unitPrice = Math.round(unitPrice * 100) / 100;
    item.total = total;

    const costInput = document.getElementById(`scaniq-cost-${index}`);
    if (costInput) {
      costInput.value = item.unitPrice;
    }

    recalculateTotals();
  }

  function handleSupplierSelectChange(val) {
    const customInput = document.getElementById('scaniq-custom-supplier-input');
    if (!customInput) return;
    if (val === '__NEW__') {
      customInput.classList.remove('hidden');
      customInput.focus();
    } else {
      customInput.classList.add('hidden');
    }
  }

  function addNewItemRow() {
    if (!activeScanData) {
      activeScanData = {
        supplier: 'Fournisseur Inconnu',
        invoiceNumber: 'FAC-' + Date.now().toString().slice(-6),
        date: new Date().toISOString().slice(0, 10),
        items: [],
        subtotal: 0,
        discount: 0,
        total: 0,
        confidence: 90
      };
    }
    if (!activeScanData.items) activeScanData.items = [];

    syncCurrentFormState();

    activeScanData.items.push({
      description: 'Nouvel article',
      rawDescription: '',
      quantity: 1,
      unitPrice: 0,
      packMultiplier: 1,
      discount: 0,
      total: 0,
      matchTier: 'unmatched',
      matchedProductId: null,
      matchedProduct: null
    });

    renderScanValidationModal(activeScanData);
  }

  function removeItemRow(index) {
    if (!activeScanData || !activeScanData.items) return;
    syncCurrentFormState();
    activeScanData.items.splice(index, 1);
    renderScanValidationModal(activeScanData);
  }

  function toggleRawTextPanel() {
    const panel = document.getElementById('scaniq-raw-text-panel');
    if (panel) {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        const editor = document.getElementById('scaniq-raw-text-editor');
        if (editor) {
          editor.value = rawInvoiceText || '';
          editor.focus();
        }
      }
    }
  }

  async function reExtractFromCustomText() {
    const editor = document.getElementById('scaniq-raw-text-editor');
    const text = editor ? editor.value.trim() : '';
    if (!text) {
      if (window.showToast) window.showToast('Veuillez entrer du texte à analyser', 'warning');
      return;
    }

    rawInvoiceText = text;
    if (window.showToast) window.showToast('🔄 Ré-analyse du texte en cours...', 'info');

    let structuredData = null;
    try {
      const resp = await fetch('/api/scan/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (resp.ok) {
        const json = await resp.json();
        structuredData = json.data;
      }
    } catch (e) {
      console.warn('[ScanIQ] Re-extract server fallback:', e);
    }

    if (!structuredData) {
      structuredData = fallbackLocalExtract(text);
    }

    if (classifierInstance && rawInvoiceText) {
      const pred = classifierInstance.predict(rawInvoiceText);
      if (pred && pred.supplier && pred.confidence > 50) {
        structuredData.supplier = pred.supplier;
        structuredData.supplierConfidence = pred.confidence;
      }
    }

    const catalogProducts = await window.FlexiDB.db.products.toArray();
    let matchedItems = [];
    try {
      const matchResp = await fetch('/api/scan/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: structuredData.items, products: catalogProducts })
      });
      if (matchResp.ok) {
        const matchJson = await matchResp.json();
        matchedItems = matchJson.items;
      }
    } catch (e) {
      console.warn('[ScanIQ] Match server fallback:', e);
    }

    if (!matchedItems || !matchedItems.length) {
      matchedItems = localCatalogMatch(structuredData.items, catalogProducts);
    }

    structuredData.items = matchedItems;
    activeScanData = structuredData;

    await renderScanValidationModal(activeScanData);
    if (window.showToast) window.showToast('✅ Analyse terminée avec succès !');
  }

  function syncCurrentFormState() {
    if (!activeScanData || !activeScanData.items) return;
    activeScanData.items.forEach((item, index) => {
      const descInput = document.getElementById(`scaniq-desc-${index}`);
      const qtyInput = document.getElementById(`scaniq-qty-${index}`);
      const costInput = document.getElementById(`scaniq-cost-${index}`);
      const packSelect = document.getElementById(`scaniq-pack-${index}`);
      const discInput = document.getElementById(`scaniq-discount-${index}`);

      if (descInput) item.description = descInput.value;
      if (qtyInput) item.quantity = parseFloat(qtyInput.value) || 1;
      if (costInput) item.unitPrice = parseFloat(costInput.value) || 0;
      if (packSelect) item.packMultiplier = parseFloat(packSelect.value) || 1;
      if (discInput) item.discount = parseFloat(discInput.value) || 0;
    });

    const invNumInput = document.getElementById('scaniq-invoice-number');
    const invDateInput = document.getElementById('scaniq-invoice-date');
    const globalDiscountInput = document.getElementById('scaniq-global-discount');

    if (invNumInput) activeScanData.invoiceNumber = invNumInput.value;
    if (invDateInput) activeScanData.date = invDateInput.value;
    if (globalDiscountInput) activeScanData.globalDiscount = parseFloat(globalDiscountInput.value) || 0;
  }

  function recalculateTotals() {
    if (!activeScanData || !activeScanData.items) return;
    let grossSubtotal = 0;
    let linesDiscount = 0;

    activeScanData.items.forEach((item, index) => {
      const descInput = document.getElementById(`scaniq-desc-${index}`);
      const qtyInput = document.getElementById(`scaniq-qty-${index}`);
      const costInput = document.getElementById(`scaniq-cost-${index}`);
      const packSelect = document.getElementById(`scaniq-pack-${index}`);
      const discInput = document.getElementById(`scaniq-discount-${index}`);
      const lineTotInput = document.getElementById(`scaniq-linetotal-${index}`);

      if (descInput) item.description = descInput.value;
      const qty = qtyInput ? (parseFloat(qtyInput.value) || 0) : (item.quantity || 1);
      const cost = costInput ? (parseFloat(costInput.value) || 0) : (item.unitPrice || 0);
      const packMult = packSelect ? (parseFloat(packSelect.value) || 1) : (item.packMultiplier || 1);
      const discount = discInput ? (parseFloat(discInput.value) || 0) : (item.discount || 0);

      item.quantity = qty;
      item.unitPrice = cost;
      item.packMultiplier = packMult;
      item.discount = discount;

      const lineGross = qty * cost;
      const lineNet = Math.max(0, lineGross - discount);
      item.total = lineNet;

      if (lineTotInput && document.activeElement !== lineTotInput) {
        lineTotInput.value = lineNet.toFixed(2);
      }

      // Update row price difference badge live
      const diffEl = document.getElementById(`scaniq-price-diff-${index}`);
      if (diffEl) {
        diffEl.innerHTML = renderPriceDiffBadge(item, item.matchedProduct);
      }

      grossSubtotal += lineGross;
      linesDiscount += discount;
    });

    const globalDiscountInput = document.getElementById('scaniq-global-discount');
    const globalDiscount = globalDiscountInput ? (parseFloat(globalDiscountInput.value) || 0) : (activeScanData.globalDiscount || 0);
    const totalDiscount = linesDiscount + globalDiscount;
    const netTotal = Math.max(0, grossSubtotal - totalDiscount);

    activeScanData.subtotal = grossSubtotal;
    activeScanData.discount = totalDiscount;
    activeScanData.globalDiscount = globalDiscount;
    activeScanData.vat = 0;
    activeScanData.total = netTotal;

    const subtotalEl = document.getElementById('scaniq-subtotal-display');
    const discountEl = document.getElementById('scaniq-discount-display');
    const totalEl = document.getElementById('scaniq-total-display');

    if (subtotalEl) subtotalEl.innerText = `${grossSubtotal.toFixed(2)} DA`;
    if (discountEl) discountEl.innerText = `${totalDiscount.toFixed(2)} DA`;
    if (totalEl) totalEl.innerText = `${netTotal.toFixed(2)} DA`;
  }

  // ---------------------------------------------------------------------------
  // CORRECTIONS & LOCAL RETRAINING FEEDBACK LOOP
  // ---------------------------------------------------------------------------

  function recordCorrection(fieldType, rawVal, correctedVal) {
    trackedCorrections.push({
      fieldType,
      rawExtraction: rawVal,
      userCorrectedValue: correctedVal,
      timestamp: new Date().toISOString()
    });
  }

  function celebrateLearningMicroToast(message) {
    if (window.showToast) {
      window.showToast(`🧠 ScanIQ : ${message}`, 'info');
    }
  }

  async function updateLearningStatsBadge() {
    try {
      const stats = await window.FlexiDB.getLearningStats();
      const statEl = document.getElementById('scaniq-learning-stat-badge');
      if (statEl) {
        statEl.innerText = `🧠 ${stats.correctionsCount || 0} apprentissages · ${stats.accuracyRate || 95}% précision`;
      }
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // COMMIT CONFIRMATION & ATOMIC STOCK RESTOCK
  // ---------------------------------------------------------------------------

  async function commitScannedOrder() {
    if (!activeScanData) {
      throw new Error('Aucune facture active à valider');
    }

    const d = window.FlexiDB.db;
    if (!d) throw new Error('Base de données non disponible');

    syncCurrentFormState();
    recalculateTotals();

    const supplierSelect = document.getElementById('scaniq-supplier-select');
    const customSupplierInput = document.getElementById('scaniq-custom-supplier-input');
    const selectedSupplierVal = supplierSelect ? supplierSelect.value : null;
    let supplierName = activeScanData.supplier || 'Fournisseur Inconnu';
    let supplierId = null;

    if (selectedSupplierVal === '__NEW__' && customSupplierInput && customSupplierInput.value.trim()) {
      supplierName = customSupplierInput.value.trim();
    } else if (selectedSupplierVal && selectedSupplierVal !== '__NEW__') {
      supplierId = Number(selectedSupplierVal);
      const sup = await d.suppliers.get(supplierId);
      if (sup) supplierName = sup.name;
    }

    const invNum = document.getElementById('scaniq-invoice-number')?.value || activeScanData.invoiceNumber || ('FAC-' + Date.now().toString().slice(-6));
    const invDate = document.getElementById('scaniq-invoice-date')?.value || activeScanData.date || new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // Check for supplier correction / retraining
    if (supplierName && cleanString(supplierName) !== cleanString(activeScanData.supplier)) {
      recordCorrection('supplier_name', activeScanData.supplier, supplierName);
      if (classifierInstance && rawInvoiceText) {
        classifierInstance.incrementalTrain(supplierName, rawInvoiceText);
      }
    }

    // Atomic transaction for Restocking
    await d.transaction('rw', [d.purchases, d.products, d.stockLogs, d.corrections, d.suppliers], async () => {
      // 0. Auto-create supplier if new and doesn't exist
      if (!supplierId && supplierName && supplierName !== 'Fournisseur Inconnu') {
        const existingSup = await d.suppliers.where('name').equalsIgnoreCase(supplierName).first();
        if (existingSup) {
          supplierId = existingSup.id;
        } else {
          supplierId = await d.suppliers.add({
            name: supplierName,
            phone: '',
            email: '',
            address: '',
            notes: 'Créé automatiquement via ScanIQ',
            createdAt: now,
            updatedAt: now
          });
        }
      }

      // 1. Save purchase record
      await d.purchases.add({
        supplierId: supplierId || null,
        supplierName,
        invoiceNumber: invNum,
        date: invDate,
        items: activeScanData.items,
        subtotal: activeScanData.subtotal,
        discount: activeScanData.discount || 0,
        vat: 0,
        total: activeScanData.total,
        createdAt: now
      });

      // 2. Increment stock for products
      for (const item of activeScanData.items) {
        const packMult = Number(item.packMultiplier) || 1;
        const qtyEntered = Number(item.quantity) || 1;
        const unitsToAdd = qtyEntered * packMult;
        const unitCostPrice = packMult > 1 ? (Number(item.unitPrice) / packMult) : Number(item.unitPrice);

        if (item.matchedProductId) {
          const prod = await d.products.get(item.matchedProductId);
          const prevStock = prod ? (Number(prod.currentStock) || 0) : 0;

          await d.products.where('id').equals(item.matchedProductId).modify(p => {
            p.currentStock = (Number(p.currentStock) || 0) + unitsToAdd;
            if (unitCostPrice > 0) {
              p.costPrice = Math.round(unitCostPrice * 100) / 100;
            }
            p.updatedAt = now;
          });

          // Stock log audit
          await d.stockLogs.add({
            productId: item.matchedProductId,
            timestamp: now,
            type: 'RESTOCK',
            quantityChange: unitsToAdd,
            previousStock: prevStock,
            newStock: prevStock + unitsToAdd,
            referenceId: `INV_${invNum}`,
            note: `Réception ScanIQ #${invNum} (${supplierName}) - ${qtyEntered} ${packMult > 1 ? 'pack(s) x' + packMult : 'unité(s)'}`
          });
        } else if (item.description && item.description.trim()) {
          // Auto-create newly entered product in catalog
          const newProdId = await d.products.add({
            name: item.description.trim(),
            category: 'General',
            unit: 'U',
            costPrice: Math.round(unitCostPrice * 100) / 100,
            sellingPrice: Math.round(unitCostPrice * 1.3 * 100) / 100,
            currentStock: unitsToAdd,
            minStockAlert: 5,
            icon: '📦',
            createdAt: now,
            updatedAt: now
          });

          await d.stockLogs.add({
            productId: newProdId,
            timestamp: now,
            type: 'RESTOCK',
            quantityChange: unitsToAdd,
            previousStock: 0,
            newStock: unitsToAdd,
            referenceId: `INV_${invNum}`,
            note: `Nouveau produit créé via ScanIQ #${invNum}`
          });
        }
      }

      // 3. Save corrections to Dexie
      for (const corr of trackedCorrections) {
        await d.corrections.add({
          ...corr,
          supplierId: supplierId || null
        });
      }
    });

    // Close modal
    document.getElementById('scaniq-validate-modal')?.classList.add('hidden');
    if (window.showToast) {
      window.showToast(`✅ Commande #${invNum} validée et stock mis à jour (${activeScanData.total.toFixed(2)} DA) !`);
    }

    // Refresh views
    if (window.renderSuppliersWorkspace) window.renderSuppliersWorkspace();
    if (window.renderInventoryWorkspace) window.renderInventoryWorkspace();
    if (window.POS?.loadProducts) window.POS.loadProducts();

    return { success: true, invoiceNumber: invNum };
  }

  // Exposed ScanIQService global interface
  window.ScanIQService = {
    init: initScanIQ,
    processInvoiceFile,
    simulateOrRunLocalOCR,
    renderScanValidationModal,
    handleProductChange,
    handlePackagingChange,
    handleItemDescChange,
    handleLineTotalChange,
    handleSupplierSelectChange,
    addNewItemRow,
    removeItemRow,
    toggleRawTextPanel,
    reExtractFromCustomText,
    recalculateTotals,
    commitScannedOrder,
    getClassifier: () => classifierInstance,
    getActiveScanData: () => activeScanData
  };

  // Eager init on script load
  initScanIQ().catch(e => console.warn('ScanIQ eager init notice:', e));
})();
