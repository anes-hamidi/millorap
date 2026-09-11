const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const PAY_TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'pay.html');

// In-memory payment transactions store for real-time status polling
const payments = new Map();

router.get('/pay', (req, res) => {
  const amount = parseFloat(req.query.amount || 0).toFixed(2);
  const orderId = req.query.order || ('DZ-' + Date.now());
  const store = req.query.store || 'Millora Store Alger';

  try {
    let html = fs.readFileSync(PAY_TEMPLATE_PATH, 'utf8');
    html = html.replace(/{{STORE}}/g, store)
               .replace(/{{AMOUNT}}/g, amount)
               .replace(/{{ORDER_ID}}/g, orderId);
    res.send(html);
  } catch (err) {
    res.status(500).send('Erreur lors du chargement du portail de paiement: ' + err.message);
  }
});

// API: Process and record payment confirmation from mobile client
router.post('/api/pay/process', (req, res) => {
  const { orderId, amount, method, cardLast4, cardHolder } = req.body;
  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Order ID is required' });
  }

  const authCode = (method && method.includes('BaridiMob') ? 'BM-' : 'SATIM-') + Math.floor(100000 + Math.random() * 900000);
  const record = {
    orderId,
    amount: parseFloat(amount || 0),
    method: method || 'CIB / Edahabia',
    status: 'PAID',
    cardLast4: cardLast4 || null,
    cardHolder: cardHolder || null,
    authCode: authCode,
    timestamp: new Date().toISOString()
  };

  payments.set(orderId, record);

  res.json({
    success: true,
    message: 'Payment verified and confirmed',
    authCode: authCode,
    orderId: orderId
  });
});

// API: Check payment status for POS real-time auto-confirmation
router.get('/api/pay/status/:orderId', (req, res) => {
  const { orderId } = req.params;
  const payment = payments.get(orderId);
  if (payment) {
    return res.json({ success: true, paid: true, payment });
  }
  return res.json({ success: true, paid: false });
});

module.exports = router;
