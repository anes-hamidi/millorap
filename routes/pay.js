const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const PAY_TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'pay.html');

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

module.exports = router;
