const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

let printFn = null;
let getPrintersFn = null;

try {
  const pdfToPrinter = require('pdf-to-printer');
  printFn = pdfToPrinter.print;
  getPrintersFn = pdfToPrinter.getPrinters;
} catch (e) {
  console.warn('pdf-to-printer module optional fallback:', e.message);
}

// Path to local files on PC (creates folder if it does not exist)
const DOCS_DIR = process.env.DOCS_DIR || path.join(__dirname, '..', 'dzexams_downloaded_pdfs');

if (!fs.existsSync(DOCS_DIR)) {
  try {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    console.log(`Created local documents folder at: ${DOCS_DIR}`);
  } catch (err) {
    console.warn(`Could not create ${DOCS_DIR}, falling back to local folder`);
  }
}

const EFFECTIVE_DOCS_DIR = fs.existsSync(DOCS_DIR) ? DOCS_DIR : path.join(__dirname, '..', 'dzexams_downloaded_pdfs');
if (!fs.existsSync(EFFECTIVE_DOCS_DIR)) {
  try {
    fs.mkdirSync(EFFECTIVE_DOCS_DIR, { recursive: true });
  } catch (e) {}
}

// Security check helper to prevent path traversal
function getSafePath(relativePath) {
  const safeRelativePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(EFFECTIVE_DOCS_DIR, safeRelativePath);
  if (!fullPath.startsWith(path.resolve(EFFECTIVE_DOCS_DIR))) {
    throw new Error('Access denied: Invalid path traversal attempt');
  }
  return fullPath;
}

// Shallow non-recursive scan of a single folder level
function scanDirectoryShallow(dirPath, relativePath = '') {
  if (!fs.existsSync(dirPath)) return [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  let folders = [];
  let files = [];

  items.forEach((item) => {
    const itemRelativePath = path.join(relativePath, item.name).replace(/\\/g, '/');
    const itemFullPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      let itemCount = 0;
      try {
        itemCount = fs.readdirSync(itemFullPath).length;
      } catch (e) {}
      folders.push({
        name: item.name,
        type: 'folder',
        path: itemRelativePath,
        itemCount: itemCount,
      });
    } else if (item.isFile()) {
      const isPdf = item.name.toLowerCase().endsWith('.pdf');
      let sizeMB = '0.00';
      let modified = null;
      try {
        const stats = fs.statSync(itemFullPath);
        sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        modified = stats.mtime;
      } catch (e) {}
      files.push({
        name: item.name,
        type: 'file',
        isPdf: isPdf,
        path: itemRelativePath,
        sizeMB: sizeMB,
        modified: modified
      });
    }
  });

  // Sort folders then files naturally
  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return [...folders, ...files];
}

// API: Lazy fetch items of a specific folder level (default: root)
router.get('/files', (req, res) => {
  try {
    const relPath = (req.query.path || '').trim();
    const fullPath = getSafePath(relPath);
    const items = scanDirectoryShallow(fullPath, relPath);
    res.json({ success: true, docsDir: EFFECTIVE_DOCS_DIR, path: relPath, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Fast search across documents (capped at 50 matches to prevent blocking)
router.get('/files/search', (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  if (!query) return res.json({ success: true, results: [] });

  try {
    let results = [];
    const MAX_RESULTS = 50;

    function searchDir(dirPath, relPath = '', depth = 0) {
      if (results.length >= MAX_RESULTS || depth > 5) return;
      if (!fs.existsSync(dirPath)) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) break;
        const itemRelPath = path.join(relPath, entry.name).replace(/\\/g, '/');
        const itemFullPath = path.join(dirPath, entry.name);

        if (entry.name.toLowerCase().includes(query)) {
          if (entry.isDirectory()) {
            results.push({ name: entry.name, type: 'folder', path: itemRelPath });
          } else if (entry.isFile()) {
            results.push({
              name: entry.name,
              type: 'file',
              isPdf: entry.name.toLowerCase().endsWith('.pdf'),
              path: itemRelPath
            });
          }
        }

        if (entry.isDirectory()) {
          searchDir(itemFullPath, itemRelPath, depth + 1);
        }
      }
    }

    searchDir(EFFECTIVE_DOCS_DIR);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Serve PDF or document for inline browser viewing
router.get('/view', (req, res) => {
  try {
    const relativePath = req.query.file;
    if (!relativePath) return res.status(400).json({ error: 'File path required' });
    const filePath = getSafePath(relativePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// API: Direct Print Command via pdf-to-printer
router.post('/print', async (req, res) => {
  const { filePath, copies, printer } = req.body;
  if (!filePath) return res.status(400).json({ success: false, error: 'File path required' });

  try {
    const fullPath = getSafePath(filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, error: 'File not found' });

    if (!printFn) {
      return res.status(501).json({ 
        success: false, 
        error: 'pdf-to-printer module is not available on this environment. Use browser print dialog.' 
      });
    }

    const options = {
      copies: parseInt(copies, 10) || 1,
    };
    if (printer) options.printer = printer;

    await printFn(fullPath, options);
    res.json({ success: true, message: 'Print job sent successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: List connected printers
router.get('/printers', async (req, res) => {
  try {
    if (!getPrintersFn) {
      return res.json({ success: true, printers: [] });
    }
    const printers = await getPrintersFn();
    res.json({ success: true, printers });
  } catch (err) {
    res.json({ success: true, printers: [], error: err.message });
  }
});

module.exports = router;
