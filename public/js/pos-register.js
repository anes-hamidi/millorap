// ==========================================
// MILLORA POS — Barcode-Only Register Companion Script (v5.0)
// Focuses 100% on barcode scanner throughput & clean, fast cashier operations.
// ==========================================
(function () {
    'use strict';

    function toast(msg, type = 'info') {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    // -------------------------------------------------------------------------
    // 1. MIRROR TOTAL TO BIG DISPLAY
    // -------------------------------------------------------------------------
    let lastMirrored = '';
    function mirrorTotal() {
        const src = document.getElementById('pos-total');
        const dst = document.getElementById('reg-total-mirror');
        if (src && dst) {
            const txt = src.textContent.trim();
            if (txt !== lastMirrored) {
                lastMirrored = txt;
                dst.textContent = txt;
            }
        }
    }
    setInterval(mirrorTotal, 150);

    // -------------------------------------------------------------------------
    // 2. BARCODE INPUT & SUBMISSION ENGINE
    // -------------------------------------------------------------------------
    const searchInput = document.getElementById('pos-search-input');
    const searchClearBtn = document.getElementById('reg-search-clear-btn');

    function syncClearBtn() {
        if (!searchInput || !searchClearBtn) return;
        if (searchInput.value.trim().length > 0) {
            searchClearBtn.classList.remove('hidden');
        } else {
            searchClearBtn.classList.add('hidden');
        }
    }

    searchInput?.addEventListener('input', syncClearBtn);

    searchClearBtn?.addEventListener('click', () => {
        if (!searchInput) return;
        searchInput.value = '';
        syncClearBtn();
        searchInput.focus();
    });

    // Submit barcode from the input field
    function submitBarcode() {
        if (!searchInput) return;
        const code = searchInput.value.trim();
        if (!code) return;

        if (typeof window.handleScannedBarcode === 'function') {
            window.handleScannedBarcode(code);
        } else {
            // Fallback: dispatch enter keydown
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        }

        searchInput.value = '';
        syncClearBtn();
        searchInput.focus();
    }

    // Enter key inside barcode input
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            submitBarcode();
        }
    });

    // Auto-focus barcode input when clicking anywhere on the background (except buttons/inputs)
    document.getElementById('section-pos-app')?.addEventListener('click', (e) => {
        if (!e.target.closest('button, input, select, textarea, label')) {
            searchInput?.focus();
        }
    });

    // -------------------------------------------------------------------------
    // 3. NUMERIC KEYPAD (Manual barcode entry, void, customer, note, enter)
    // -------------------------------------------------------------------------
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.reg-keypad-btn[data-key]');
        if (!btn) return;
        const char = btn.dataset.key;
        if (!searchInput) return;

        searchInput.value += char;
        syncClearBtn();
        searchInput.focus();
    });

    // Backspace Button
    document.getElementById('reg-key-bksp')?.addEventListener('click', () => {
        if (!searchInput) return;
        searchInput.value = searchInput.value.slice(0, -1);
        syncClearBtn();
        searchInput.focus();
    });

    // Enter / Valider Button
    document.getElementById('reg-key-enter')?.addEventListener('click', () => {
        submitBarcode();
    });

    // -------------------------------------------------------------------------
    // 4. VOID LAST ITEM
    // -------------------------------------------------------------------------
    document.getElementById('reg-key-void')?.addEventListener('click', () => {
        const highlighted = document.querySelector('#pos-cart-items .pos-scan-highlight');
        const row = highlighted || document.querySelector('#pos-cart-items > div:last-child');
        if (!row) {
            toast('Aucun article à annuler dans le panier', 'warning');
            return;
        }
        const removeBtn = row.querySelector('button[onclick^="removeFromPosCart"]');
        if (!removeBtn) {
            toast('Impossible de cibler cet article', 'error');
            return;
        }
        const match = removeBtn.getAttribute('onclick').match(/removeFromPosCart\('([^']*)',\s*'([^']*)'\)/);
        if (!match) return;

        if (confirm('Voulez-vous annuler cet article du panier ?')) {
            window.removeFromPosCart(match[1], match[2]);
            toast('Article annulé');
        }
    });

    // -------------------------------------------------------------------------
    // 5. QUICK CUSTOMER DEBT LOOKUP
    // -------------------------------------------------------------------------
    document.getElementById('reg-key-customer')?.addEventListener('click', async () => {
        if (!window.DebtService || typeof window.DebtService.getAllCustomers !== 'function') {
            toast('Répertoire clients indisponible hors-ligne', 'warning');
            return;
        }
        const query = (prompt('Rechercher un client (Nom ou Téléphone) :') || '').trim().toLowerCase();
        if (!query) return;

        try {
            const customers = await window.DebtService.getAllCustomers();
            const match = customers.find(c =>
                (c.name || '').toLowerCase().includes(query) || (c.phone || '').toLowerCase().includes(query)
            );
            if (!match) {
                toast(`Aucun client trouvé pour "${query}"`, 'error');
                return;
            }
            const debt = Number(match.totalRemaining || 0).toFixed(2);
            const limit = match.debtLimit > 0 ? ` (Plafond : ${match.debtLimit} DA)` : '';
            toast(`Client : ${match.name} | Dette : ${debt} DA${limit}`);
        } catch (err) {
            toast('Erreur lors de la recherche client', 'error');
        }
    });

    // -------------------------------------------------------------------------
    // 6. ORDER NOTE
    // -------------------------------------------------------------------------
    document.getElementById('reg-key-note')?.addEventListener('click', () => {
        const el = document.getElementById('reg-order-note');
        if (!el) return;
        const currentNote = el.textContent.replace(/^📝\s*/, '') || '';
        const note = prompt('Ajouter une note pour ce ticket :', currentNote);
        if (note === null) return;
        if (note.trim() === '') {
            el.textContent = '';
            el.classList.remove('show');
        } else {
            el.textContent = '📝 ' + note.trim();
            el.classList.add('show');
            toast('Note enregistrée sur le ticket');
        }
    });

    const clearNote = () => {
        const el = document.getElementById('reg-order-note');
        if (el) {
            el.textContent = '';
            el.classList.remove('show');
        }
    };
    ['pos-clear-cart', 'pos-change-hud-dismiss-btn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', clearNote);
    });

    // -------------------------------------------------------------------------
    // 7. QUICK DISCOUNT CHIPS (5%, 10%, 0%)
    // -------------------------------------------------------------------------
    document.addEventListener('click', (e) => {
        const chip = e.target.closest('.reg-disc-chip');
        if (!chip) return;
        const val = parseInt(chip.dataset.disc, 10) || 0;
        const discInput = document.getElementById('pos-discount-input');
        if (discInput) {
            discInput.value = val;
            discInput.dispatchEvent(new Event('input', { bubbles: true }));
            toast(`Remise de ${val}% appliquée`);
        }
    });

    // Auto-focus barcode input when switching mode to pos
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#pos') {
            setTimeout(() => searchInput?.focus(), 100);
        }
    });

})();