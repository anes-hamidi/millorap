const express = require('express');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env if present
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch (e) {
  console.warn('Could not auto-load .env file:', e.message);
}

const filesRouter = require('./routes/files');
const posRouter = require('./routes/pos');
const payRouter = require('./routes/pay');
const transferRouter = require('./routes/transfer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Enable CORS for Tauri desktop app & LAN requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// SECURITY: Only serve static assets from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Routers
app.use('/api', filesRouter);
app.use('/api/pos', posRouter);
app.use('/api', posRouter);
app.use('/api', transferRouter);
app.use('/', transferRouter);
app.use('/', payRouter);

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  const ip = posRouter.getLocalIp ? posRouter.getLocalIp() : '127.0.0.1';
  console.log(`Millora Server running at: http://localhost:${PORT}`);
  console.log(`Mobile Payment Portal URL: http://${ip}:${PORT}/pay`);
  console.log(`Mobile File Transfer URL: http://${ip}:${PORT}/transfer`);
});

module.exports = app;
