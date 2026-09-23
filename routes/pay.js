const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();
const PAY_TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'pay.html');

// In-memory payment transactions & session tokens store: orderId -> { token, expiresAt, amount, method, status, authCode, timestamp }
const payments = new Map();
const PAYMENT_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

// HTML escaping helper to prevent Reflected XSS
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// Periodic cleanup of expired payment sessions to prevent memory leaks
const paymentCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, session] of payments.entries()) {
    if (session.expiresAt && now > session.expiresAt) {
      payments.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (paymentCleanupInterval.unref) paymentCleanupInterval.unref();

function getOrCreatePaymentSession(orderId, amount = 0, existingToken = null) {
  const now = Date.now();
  let payment = payments.get(orderId);
  if (!payment) {
    const token = existingToken || crypto.randomBytes(16).toString('hex');
    payment = {
      orderId,
      token,
      amount: parseFloat(amount || 0),
      expiresAt: now + PAYMENT_SESSION_TTL_MS,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    payments.set(orderId, payment);
  } else if (payment.expiresAt && now > payment.expiresAt) {
    // Renew expired session securely
    payment.token = existingToken || crypto.randomBytes(16).toString('hex');
    payment.expiresAt = now + PAYMENT_SESSION_TTL_MS;
    payment.status = 'PENDING';
    payment.amount = parseFloat(amount || payment.amount || 0);
  }
  // Active session tokens cannot be overwritten by unauthorized callers
  return payment;
}

// GET /pay?amount=XXX&order=DZ-XXX&token=YYYYYY (Customer-facing payment portal)
router.get('/pay', (req, res) => {
  const amount = Math.max(0, parseFloat(req.query.amount || 0)).toFixed(2);
  const orderId = String(req.query.order || ('DZ-' + Date.now())).slice(0, 64);
  const token = String(req.query.token || crypto.randomBytes(16).toString('hex')).slice(0, 64);
  const store = String(req.query.store || 'Millora Store Alger').slice(0, 80);

  // Register payment intent session with token & TTL
  const session = getOrCreatePaymentSession(orderId, amount, token);

  try {
    let html = fs.readFileSync(PAY_TEMPLATE_PATH, 'utf8');
    html = html.replace(/{{STORE}}/g, escapeHtml(store))
               .replace(/{{AMOUNT}}/g, escapeHtml(amount))
               .replace(/{{ORDER_ID}}/g, escapeHtml(orderId))
               .replace(/{{TOKEN}}/g, escapeHtml(session.token));
    res.send(html);
  } catch (err) {
    res.status(500).send('Erreur lors du chargement du portail de paiement: ' + escapeHtml(err.message));
  }
});

// GET /api/pay/token/:orderId (Generates/retrieves token for POS QR code generation)
router.get('/api/pay/token/:orderId', (req, res) => {
  const { orderId } = req.params;
  const amount = parseFloat(req.query.amount || 0);
  const session = getOrCreatePaymentSession(orderId, amount);
  res.json({ success: true, orderId, token: session.token, expiresAt: session.expiresAt });
});

// POST /api/pay/process (Process payment confirmation from mobile client - REQUIRES VALID TOKEN)
router.post('/api/pay/process', (req, res) => {
  const { orderId, amount, method, cardLast4, cardHolder } = req.body;
  const providedToken = req.body.token || req.headers['x-session-token'] || req.query.token;

  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Order ID is required' });
  }

  const payment = payments.get(orderId);
  const now = Date.now();

  // Strict token validation
  if (!payment || !payment.token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Payment session not found or expired'
    });
  }

  if (!providedToken || providedToken !== payment.token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid payment security token'
    });
  }

  if (payment.expiresAt && now > payment.expiresAt) {
    payments.delete(orderId);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Payment session has expired (15m limit)'
    });
  }

  const authCode = (method && method.includes('BaridiMob') ? 'BM-' : 'SATIM-') + Math.floor(100000 + Math.random() * 900000);
  
  // Update payment session to PAID status
  payment.amount = parseFloat(amount || payment.amount || 0);
  payment.method = method || 'CIB / Edahabia';
  payment.status = 'PAID';
  payment.cardLast4 = cardLast4 || null;
  payment.cardHolder = cardHolder || null;
  payment.authCode = authCode;
  payment.paidAt = new Date().toISOString();

  payments.set(orderId, payment);

  res.json({
    success: true,
    message: 'Payment verified and confirmed',
    authCode: authCode,
    orderId: orderId
  });
});

// GET /api/pay/status/:orderId (Check payment status for POS real-time auto-confirmation)
router.get('/api/pay/status/:orderId', (req, res) => {
  const { orderId } = req.params;
  const payment = payments.get(orderId);
  if (payment && payment.status === 'PAID') {
    return res.json({ success: true, paid: true, payment });
  }
  return res.json({ success: true, paid: false });
});

module.exports = router;
module.exports.getOrCreatePaymentSession = getOrCreatePaymentSession;
