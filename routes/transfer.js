const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const router = express.Router();

// Dedicated UNIQUE uploads directory (separate from dzexams_downloaded_pdfs)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory transfer sessions tracking
const transferSessions = new Map(); // sessionId -> { files: [], connected: boolean, lastUpdated }

// Multer storage engine saving directly to unique 'uploads' directory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // Preserve original name safely while preventing collisions
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(original);
    const base = path.basename(original, ext).replace(/[<>:"/\\|?*]+/g, '_');
    
    let targetName = `${base}${ext}`;
    let counter = 1;
    while (fs.existsSync(path.join(UPLOADS_DIR, targetName))) {
      targetName = `${base}_${counter}${ext}`;
      counter++;
    }
    cb(null, targetName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 250 * 1024 * 1024 } // 250 MB per file limit
});

const TRANSFER_TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'transfer.html');

// GET /transfer?session=TR-XXXXXX (Page opened by scanning QR with Mobile Phone)
router.get('/transfer', (req, res) => {
  const sessionId = req.query.session || ('TR-' + Date.now().toString().slice(-6));
  const store = req.query.store || 'Millora Print & POS';

  try {
    let html = fs.readFileSync(TRANSFER_TEMPLATE_PATH, 'utf8');
    html = html.replace(/{{STORE}}/g, store)
               .replace(/{{SESSION_ID}}/g, sessionId);
    res.send(html);
  } catch (err) {
    res.status(500).send('Erreur lors du chargement de la page de transfert: ' + err.message);
  }
});

// POST /api/transfer/upload (Receives files from mobile phone)
router.post('/transfer/upload', upload.array('files'), (req, res) => {
  const sessionId = req.body.sessionId || 'default';
  const uploadedFiles = (req.files || []).map(f => ({
    name: f.filename,
    originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    size: f.size,
    sizeMB: (f.size / (1024 * 1024)).toFixed(2),
    mimetype: f.mimetype,
    isPdf: f.filename.toLowerCase().endsWith('.pdf'),
    path: `uploads/${f.filename}`,
    timestamp: new Date().toISOString()
  }));

  if (!transferSessions.has(sessionId)) {
    transferSessions.set(sessionId, { files: [], lastUpdated: Date.now() });
  }

  const session = transferSessions.get(sessionId);
  session.files.push(...uploadedFiles);
  session.lastUpdated = Date.now();

  res.json({
    success: true,
    message: `Received ${uploadedFiles.length} file(s) into uploads directory`,
    files: uploadedFiles
  });
});

// GET /api/transfer/status/:sessionId (Polled by PC to auto-detect received files)
router.get('/transfer/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = transferSessions.get(sessionId);
  if (session && session.files.length > 0) {
    const files = [...session.files];
    // Clear reported files so they aren't processed twice
    session.files = [];
    return res.json({ success: true, hasFiles: true, files });
  }
  return res.json({ success: true, hasFiles: false, files: [] });
});

module.exports = router;
module.exports.UPLOADS_DIR = UPLOADS_DIR;
