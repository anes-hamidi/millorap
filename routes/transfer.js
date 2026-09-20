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

// GET /api/transfer/files (Lists all files currently in the uploads directory)
router.get('/transfer/files', (req, res) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      return res.json({ success: true, count: 0, files: [] });
    }

    const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(UPLOADS_DIR, entry.name);
        let size = 0;
        let mtime = new Date();
        try {
          const st = fs.statSync(fullPath);
          size = st.size;
          mtime = st.mtime;
        } catch (e) {}

        const isPdf = entry.name.toLowerCase().endsWith('.pdf');
        files.push({
          name: entry.name,
          size: size,
          sizeMB: (size / (1024 * 1024)).toFixed(2),
          isPdf: isPdf,
          path: `uploads/${entry.name}`,
          url: `/api/view?file=${encodeURIComponent(`uploads/${entry.name}`)}`,
          downloadUrl: `/api/files/download?path=${encodeURIComponent(`uploads/${entry.name}`)}`,
          mtime: mtime
        });
      }
    }

    // Sort by modification time (newest first)
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

    res.json({ success: true, count: files.length, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/transfer/files/:filename (Deletes a specific uploaded file)
router.delete('/transfer/files/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const fullPath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    fs.unlinkSync(fullPath);
    res.json({ success: true, message: `Deleted ${filename}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/transfer/clear (Clears all files in uploads directory)
router.post('/transfer/clear', (req, res) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      return res.json({ success: true, count: 0 });
    }

    const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, entry.name));
          count++;
        } catch (e) {}
      }
    }
    res.json({ success: true, message: `Cleared ${count} file(s)`, count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.UPLOADS_DIR = UPLOADS_DIR;
