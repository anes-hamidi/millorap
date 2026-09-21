// ==========================================
// CLIENT-SIDE DEBT / CUSTOMER CREDIT SERVICE
// ==========================================
(function () {
  function db() {
    return window.FlexiDB && window.FlexiDB.db;
  }

  // ── CUSTOMER MANAGEMENT ─────────────────────────────────────────────────────

  /**
   * Find an existing customer by name+phone (case-insensitive dedup) or create new.
   */
  async function findOrCreateCustomer(name, phone, debtLimit = 0) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const cleanName  = (name  || '').trim();
    const cleanPhone = (phone || '').trim();
    if (!cleanName) throw new Error('Customer name is required');

    const all = await d.customers.toArray();
    const existing = all.find(c =>
      c.name.toLowerCase() === cleanName.toLowerCase() &&
      (c.phone || '') === cleanPhone
    );
    if (existing) {
      if (debtLimit > 0 && (!existing.debtLimit || existing.debtLimit === 0)) {
        await d.customers.update(existing.id, { debtLimit: Number(debtLimit) });
        existing.debtLimit = Number(debtLimit);
      }
      return { customer: existing, isNew: false };
    }

    const id = await d.customers.add({
      name:      cleanName,
      phone:     cleanPhone || null,
      debtLimit: Math.max(0, Number(debtLimit) || 0),
      status:    'active',
      notes:     null,
      createdAt: new Date().toISOString()
    });
    const customer = await d.customers.get(id);
    return { customer, isNew: true };
  }

  /**
   * Standalone customer creation with explicit debt limit and notes.
   */
  async function createCustomer({ name, phone, debtLimit = 0, notes = '' }) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const cleanName = (name || '').trim();
    const cleanPhone = (phone || '').trim();
    if (!cleanName) throw new Error('Le nom du client est obligatoire');

    const all = await d.customers.toArray();
    const existing = all.find(c =>
      c.name.toLowerCase() === cleanName.toLowerCase() &&
      (c.phone || '') === cleanPhone
    );
    if (existing) {
      throw new Error(`Un client avec ce nom (${cleanName}) et ce numéro existe déjà`);
    }

    const id = await d.customers.add({
      name:      cleanName,
      phone:     cleanPhone || null,
      debtLimit: Math.max(0, Number(debtLimit) || 0),
      status:    'active',
      notes:     (notes || '').trim() || null,
      createdAt: new Date().toISOString()
    });
    return await d.customers.get(id);
  }

  /**
   * Update an existing customer profile (name, phone, debtLimit, notes).
   */
  async function updateCustomer(id, { name, phone, debtLimit, notes }) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const custId = Number(id);
    const existing = await d.customers.get(custId);
    if (!existing) throw new Error('Client introuvable');

    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Le nom du client est obligatoire');

    const updates = {
      name: cleanName,
      phone: (phone || '').trim() || null,
      debtLimit: Math.max(0, Number(debtLimit) || 0),
      notes: (notes || '').trim() || null
    };

    await d.customers.update(custId, updates);
    return await d.customers.get(custId);
  }

  /**
   * Return all customers enriched with balance, oldest debt date, debt limit, and sleep mode status.
   * Customers in sleep mode or with open debts appear first.
   */
  async function getAllCustomers() {
    const d = db();
    if (!d) return [];
    const [customers, debts] = await Promise.all([
      d.customers.toArray(),
      d.debts.toArray()
    ]);

    return customers
      .map(c => {
        const cDebts    = debts.filter(de => de.customerId === c.id);
        const openDebts = cDebts.filter(de => de.status === 'open');
        const totalOwed      = cDebts.reduce((s, de) => s + (Number(de.amount) || 0), 0);
        const totalRemaining = openDebts.reduce((s, de) => s + (Number(de.remainingAmount) || 0), 0);
        const oldestDate = openDebts.reduce((oldest, de) =>
          !oldest || de.createdAt < oldest ? de.createdAt : oldest, null);
        
        const debtLimit = Math.max(0, Number(c.debtLimit) || 0);
        const isSleeping = debtLimit > 0 && totalRemaining >= debtLimit;
        const currentStatus = isSleeping ? 'sleeping' : (c.status || 'active');

        return {
          ...c,
          debtLimit,
          isSleeping,
          status: currentStatus,
          totalOwed,
          totalRemaining,
          oldestDebtDate: oldestDate,
          openCount: openDebts.length
        };
      })
      .sort((a, b) => {
        // Sleeping accounts first
        if (a.isSleeping !== b.isSleeping) return a.isSleeping ? -1 : 1;
        // Then largest remaining debt
        if (b.totalRemaining !== a.totalRemaining) return b.totalRemaining - a.totalRemaining;
        // Then by name
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Get a single customer with their full debt + payment history.
   */
  async function getCustomerById(customerId) {
    const d = db();
    if (!d) return null;
    const [customer, debts] = await Promise.all([
      d.customers.get(customerId),
      d.debts.where('customerId').equals(customerId).toArray()
    ]);
    if (!customer) return null;

    const debtIds = debts.map(de => de.id);
    const allPayments = debtIds.length > 0
      ? await d.debtPayments.where('debtId').anyOf(debtIds).toArray()
      : [];

    const debtsWithPayments = debts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(de => ({
        ...de,
        payments: allPayments.filter(p => p.debtId === de.id)
                             .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      }));

    return { customer, debts: debtsWithPayments };
  }

  // ── DEBT RECORDING ──────────────────────────────────────────────────────────

  /**
   * Record a new debt linked to a POS sale.
   */
  async function recordDebt({ customerId, saleId, orderRef, amount, amountPaidNow, discountPercent, note }) {
    const d = db();
    if (!d) throw new Error('Database not ready');

    const custId = Number(customerId);
    const customer = await d.customers.get(custId);
    if (!customer) throw new Error('Client introuvable');

    const totalAmount = Math.max(0, Number(amount) || 0);
    const paidNow     = Math.min(totalAmount, Math.max(0, Number(amountPaidNow) || 0));
    const remaining   = totalAmount - paidNow;
    const status      = remaining <= 0 ? 'paid' : 'open';
    const now         = new Date().toISOString();

    // Check debt limit and sleep mode interlock
    const debtLimit = Math.max(0, Number(customer.debtLimit) || 0);
    if (debtLimit > 0 && remaining > 0) {
      const openDebts = await d.debts.where('customerId').equals(custId).filter(de => de.status === 'open').toArray();
      const currentRemaining = openDebts.reduce((s, de) => s + (Number(de.remainingAmount) || 0), 0);
      const projectedRemaining = currentRemaining + remaining;
      
      if (projectedRemaining > debtLimit + 0.001) {
        // Customer is or will be placed into sleep mode
        await d.customers.update(custId, { status: 'sleeping' });
        throw new Error(`Plafond de dette dépassé ! Le solde restant (${projectedRemaining.toFixed(2)} DA) dépassera le plafond autorisé (${debtLimit.toFixed(2)} DA). Client en Mode Veille jusqu'au prochain règlement.`);
      }
    }

    const debtId = await d.transaction('rw', d.debts, d.debtPayments, d.customers, async () => {
      const id = await d.debts.add({
        customerId:      custId,
        saleId:          saleId  || null,
        orderRef:        orderRef || null,
        amount:          totalAmount,
        remainingAmount: remaining,
        discountPercent: Number(discountPercent) || 0,
        note:            note || (saleId ? ('Vente ' + (orderRef || '')) : 'Créance manuelle'),
        createdAt:       now,
        status
      });

      if (paidNow > 0) {
        await d.debtPayments.add({
          debtId: id,
          amount: paidNow,
          paidAt: now,
          note:   note ? ('Acompte initial : ' + note) : 'Paiement partiel à l\'encaissement'
        });
      }

      // Check if this new debt pushes customer to exact limit (enters sleep mode)
      if (debtLimit > 0) {
        const allOpen = await d.debts.where('customerId').equals(custId).filter(de => de.status === 'open').toArray();
        const totalOpen = allOpen.reduce((s, de) => s + (Number(de.remainingAmount) || 0), 0);
        if (totalOpen >= debtLimit - 0.001) {
          await d.customers.update(custId, { status: 'sleeping' });
        }
      }

      return id;
    });

    return await d.debts.get(debtId);
  }

  // ── PAYMENT RECORDING ───────────────────────────────────────────────────────

  /**
   * Record a repayment. Rejects if amount > remainingAmount.
   * Automatically awakens customer from Sleep Mode when balance falls below debtLimit.
   */
  async function recordPayment({ debtId, amount, note }) {
    const d = db();
    if (!d) throw new Error('Database not ready');

    const payAmount = Math.max(0, Number(amount) || 0);
    if (payAmount <= 0) throw new Error('Le montant doit etre superieur a zero');

    let awakened = false;
    let customerName = '';
    let customerNewRemaining = 0;
    let customerDebtLimit = 0;

    await d.transaction('rw', d.debts, d.debtPayments, d.customers, async () => {
      const debt = await d.debts.get(debtId);
      if (!debt) throw new Error('Dette introuvable');
      if (debt.status === 'paid')        throw new Error('Cette dette est deja soldee');
      if (debt.status === 'written_off') throw new Error('Cette dette a ete passee en pertes');

      if (payAmount > debt.remainingAmount + 0.001) {
        throw new Error('Paiement (' + payAmount.toFixed(2) + ' DA) superieur au solde restant (' + Number(debt.remainingAmount).toFixed(2) + ' DA)');
      }

      const newRemaining = Math.max(0, debt.remainingAmount - payAmount);
      const newStatus    = newRemaining <= 0 ? 'paid' : 'open';
      const now          = new Date().toISOString();

      await d.debtPayments.add({ debtId, amount: payAmount, paidAt: now, note: note || null });
      await d.debts.update(debtId, { remainingAmount: newRemaining, status: newStatus });

      // Check customer awakening from sleep mode
      const customer = await d.customers.get(debt.customerId);
      if (customer) {
        customerName = customer.name;
        customerDebtLimit = Math.max(0, Number(customer.debtLimit) || 0);
        const allOpen = await d.debts.where('customerId').equals(customer.id).filter(de => de.status === 'open').toArray();
        customerNewRemaining = allOpen.reduce((s, de) => s + (Number(de.remainingAmount) || 0), 0);
        
        if (customerDebtLimit > 0 && customerNewRemaining < customerDebtLimit) {
          if (customer.status === 'sleeping') {
            await d.customers.update(customer.id, { status: 'active' });
            awakened = true;
          }
        }
      }
    });

    const resDebt = await d.debts.get(debtId);
    return {
      ...resDebt,
      awakened,
      customerName,
      customerNewRemaining,
      customerDebtLimit
    };
  }

  /**
   * Lump-sum FIFO payment: applies an overall payment amount across all open customer debts.
   */
  async function recordCustomerLumpSumPayment(customerId, amount, note = '') {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const custId = Number(customerId);
    const customer = await d.customers.get(custId);
    if (!customer) throw new Error('Client introuvable');

    let totalToDistribute = Math.max(0, Number(amount) || 0);
    if (totalToDistribute <= 0) throw new Error('Le montant doit être supérieur à zéro');

    const openDebts = await d.debts.where('customerId').equals(custId).filter(de => de.status === 'open').toArray();
    // Sort oldest first (FIFO)
    openDebts.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    const totalOpenBalance = openDebts.reduce((s, de) => s + (Number(de.remainingAmount) || 0), 0);
    if (totalToDistribute > totalOpenBalance + 0.001) {
      throw new Error(`Le montant (${totalToDistribute.toFixed(2)} DA) dépasse le solde total dû (${totalOpenBalance.toFixed(2)} DA).`);
    }

    let awakened = false;
    const paymentRecords = [];
    const now = new Date().toISOString();

    await d.transaction('rw', d.debts, d.debtPayments, d.customers, async () => {
      let remainingPayment = totalToDistribute;

      for (const debt of openDebts) {
        if (remainingPayment <= 0.001) break;
        const curDebtRemaining = Number(debt.remainingAmount) || 0;
        const allocated = Math.min(remainingPayment, curDebtRemaining);
        const newRemaining = Math.max(0, curDebtRemaining - allocated);
        const newStatus = newRemaining <= 0 ? 'paid' : 'open';

        await d.debtPayments.add({
          debtId: debt.id,
          amount: allocated,
          paidAt: now,
          note: note ? `${note} (Versement global)` : 'Versement global FIFO'
        });

        await d.debts.update(debt.id, {
          remainingAmount: newRemaining,
          status: newStatus
        });

        paymentRecords.push({ debtId: debt.id, allocated, orderRef: debt.orderRef });
        remainingPayment -= allocated;
      }

      // Check customer awakening
      const allOpen = await d.debts.where('customerId').equals(custId).filter(de => de.status === 'open').toArray();
      const customerNewRemaining = allOpen.reduce((s, de) => s + (Number(de.remainingAmount) || 0), 0);
      const customerDebtLimit = Math.max(0, Number(customer.debtLimit) || 0);

      if (customerDebtLimit > 0 && customerNewRemaining < customerDebtLimit) {
        if (customer.status === 'sleeping') {
          await d.customers.update(custId, { status: 'active' });
          awakened = true;
        }
      }
    });

    return {
      customerId: custId,
      customerName: customer.name,
      totalPaid: totalToDistribute,
      awakened,
      paymentsCount: paymentRecords.length
    };
  }

  // ── WRITE-OFF & REVERSAL ───────────────────────────────────────────────────

  async function writeOffDebt(debtId) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const debt = await d.debts.get(debtId);
    if (!debt) throw new Error('Dette introuvable');
    await d.debts.update(debtId, { status: 'written_off', remainingAmount: 0 });
    return await d.debts.get(debtId);
  }

  async function reverseWriteOff(debtId) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const debt = await d.debts.get(debtId);
    if (!debt) throw new Error('Dette introuvable');
    if (debt.status !== 'written_off') throw new Error('Cette dette n\'est pas passée en perte');

    // Recompute remaining from total amount minus payments
    const payments = await d.debtPayments.where('debtId').equals(debtId).toArray();
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const restoredRemaining = Math.max(0, (Number(debt.amount) || 0) - totalPaid);
    const newStatus = restoredRemaining <= 0 ? 'paid' : 'open';

    await d.debts.update(debtId, { status: newStatus, remainingAmount: restoredRemaining });
    return await d.debts.get(debtId);
  }

  async function deleteCustomer(customerId) {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const custId = Number(customerId);
    const debts = await d.debts.where('customerId').equals(custId).toArray();
    const openDebts = debts.filter(d => d.status === 'open');
    if (openDebts.length > 0) {
      throw new Error(`Impossible de supprimer : ce client a ${openDebts.length} créance(s) non soldée(s).`);
    }

    const debtIds = debts.map(d => d.id);
    await d.transaction('rw', d.customers, d.debts, d.debtPayments, async () => {
      if (debtIds.length > 0) {
        await d.debtPayments.where('debtId').anyOf(debtIds).delete();
        await d.debts.where('customerId').equals(custId).delete();
      }
      await d.customers.delete(custId);
    });
    return true;
  }

  // ── KPI / BADGE ─────────────────────────────────────────────────────────────

  async function getTotalOutstanding() {
    const d = db();
    if (!d) return 0;
    const openDebts = await d.debts.where('status').equals('open').toArray();
    return openDebts.reduce((s, de) => s + (Number(de.remainingAmount) || 0), 0);
  }

  async function refreshDebtBadge() {
    try {
      const total        = await getTotalOutstanding();
      const navBadge     = document.getElementById('nav-debts-badge');
      const headerBadge  = document.getElementById('debt-outstanding-badge');
      const headerAmount = document.getElementById('debt-outstanding-amount');

      if (navBadge) {
        if (total > 0) { navBadge.classList.remove('hidden'); navBadge.innerText = total.toFixed(0) + ' DA'; }
        else           { navBadge.classList.add('hidden'); }
      }
      if (headerBadge && headerAmount) {
        if (total > 0) {
          headerBadge.classList.remove('hidden');
          headerAmount.innerText = Math.round(total).toLocaleString() + ' DA';
        } else {
          headerBadge.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('[DebtService] refreshDebtBadge error:', e);
    }
  }

  // ── CSV EXPORTS ─────────────────────────────────────────────────────────────

  async function exportDebtsToCsv() {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const [debts, customers] = await Promise.all([d.debts.toArray(), d.customers.toArray()]);
    const custMap = new Map(customers.map(c => [c.id, c]));

    const headers = ['Debt ID', 'Customer Name', 'Phone', 'Order Ref', 'Total Amount (DA)', 'Remaining (DA)', 'Discount %', 'Status', 'Created At'];
    const rows = debts.map(de => {
      const c = custMap.get(de.customerId) || {};
      const safeName = '"' + String(c.name || '').replace(/"/g, '""') + '"';
      const safePhone = '"' + String(c.phone || '').replace(/"/g, '""') + '"';
      const safeRef = '"' + String(de.orderRef || '').replace(/"/g, '""') + '"';
      return [
        de.id,
        safeName,
        safePhone,
        safeRef,
        Number(de.amount || 0).toFixed(2),
        Number(de.remainingAmount || 0).toFixed(2),
        Number(de.discountPercent || 0).toFixed(1),
        de.status || 'open',
        de.createdAt || ''
      ];
    });
    _downloadCsv([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), 'debts_export_' + new Date().toISOString().slice(0, 10) + '.csv');
  }

  async function exportDebtPaymentsToCsv() {
    const d = db();
    if (!d) throw new Error('Database not ready');
    const [payments, debts, customers] = await Promise.all([d.debtPayments.toArray(), d.debts.toArray(), d.customers.toArray()]);
    const debtMap = new Map(debts.map(de => [de.id, de]));
    const custMap = new Map(customers.map(c => [c.id, c]));

    const headers = ['Payment ID', 'Debt ID', 'Customer Name', 'Order Ref', 'Amount (DA)', 'Paid At', 'Note'];
    const rows = payments.map(p => {
      const de = debtMap.get(p.debtId) || {};
      const c  = custMap.get(de.customerId) || {};
      const safeName = '"' + String(c.name || '').replace(/"/g, '""') + '"';
      const safeRef = '"' + String(de.orderRef || '').replace(/"/g, '""') + '"';
      const safeNote = '"' + String(p.note || '').replace(/"/g, '""') + '"';
      return [
        p.id,
        p.debtId,
        safeName,
        safeRef,
        Number(p.amount || 0).toFixed(2),
        p.paidAt || '',
        safeNote
      ];
    });
    _downloadCsv([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), 'debt_payments_export_' + new Date().toISOString().slice(0, 10) + '.csv');
  }

  function _downloadCsv(content, filename) {
    const blob = new Blob(['\uFEFF'+content], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────────────

  window.DebtService = {
    findOrCreateCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getAllCustomers,
    getCustomerById,
    recordDebt,
    recordPayment,
    recordCustomerLumpSumPayment,
    writeOffDebt,
    reverseWriteOff,
    getTotalOutstanding,
    refreshDebtBadge,
    exportDebtsToCsv,
    exportDebtPaymentsToCsv
  };
})();
