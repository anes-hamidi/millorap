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

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (e) {}
}

// Security check helper to prevent path traversal
function getSafePath(relativePath) {
  const safeRelativePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');

  // If path refers to uploads folder or subfolder
  if (safeRelativePath === 'uploads' || safeRelativePath.startsWith('uploads/') || safeRelativePath.startsWith('uploads\\')) {
    const sub = safeRelativePath.replace(/^uploads[\/\\]?/, '');
    const fullPath = path.join(UPLOADS_DIR, sub);
    if (!fullPath.startsWith(path.resolve(UPLOADS_DIR))) {
      throw new Error('Access denied: Invalid path traversal attempt');
    }
    return fullPath;
  }

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
    let items = scanDirectoryShallow(fullPath, relPath);

    // If at root folder, always include the dedicated unique 'uploads' directory at top
    if (!relPath) {
      let uploadFilesCount = 0;
      try {
        uploadFilesCount = fs.readdirSync(UPLOADS_DIR).length;
      } catch (e) {}

      // Prepend uploads folder with unique styling flag
      items.unshift({
        name: 'uploads (Fichiers Reçus Mobile)',
        type: 'folder',
        path: 'uploads',
        isUploads: true,
        itemCount: uploadFilesCount
      });
    }

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

// API: Download document directly
router.get(['/files/download', '/download'], (req, res) => {
  try {
    const relativePath = req.query.path || req.query.file;
    if (!relativePath) return res.status(400).json({ success: false, error: 'File path required' });
    const filePath = getSafePath(relativePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found' });
    res.download(filePath, path.basename(filePath));
  } catch (err) {
    res.status(403).json({ success: false, error: err.message });
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

// API: List connected printers with robust Windows fallback
router.get('/printers', async (req, res) => {
  try {
    if (getPrintersFn) {
      try {
        const printers = await getPrintersFn();
        if (Array.isArray(printers) && printers.length > 0) {
          return res.json({ success: true, printers });
        }
      } catch (err) {
        console.warn('pdf-to-printer getPrinters failed, trying PowerShell fallback:', err.message);
      }
    }

    // Resilient fallback for Windows environments
    if (process.platform === 'win32') {
      const { exec } = require('child_process');
      exec('powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"', (err, stdout) => {
        if (!err && stdout) {
          const list = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          if (list.length > 0) {
            return res.json({ success: true, printers: list });
          }
        }
        res.json({ success: true, printers: [] });
      });
      return;
    }

    res.json({ success: true, printers: [] });
  } catch (err) {
    res.json({ success: true, printers: [], error: err.message });
  }
});

// API: Merge Multiple PDF Files into a single document
// Can either save with a new name in a folder, or return the merged PDF directly for viewing/printing/download
router.post('/merge', async (req, res) => {
  const { files, saveName, targetFolder, action } = req.body;
  // files: array of relative paths
  // saveName: string (optional, e.g. "merged_document.pdf")
  // targetFolder: string (optional relative path)
  // action: 'save' | 'download' | 'view'
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one file is required for merging' });
  }

  try {
    let PDFDocument;
    try {
      PDFDocument = require('pdf-lib').PDFDocument;
    } catch (e) {
      return res.status(500).json({ success: false, error: 'pdf-lib is not available on server: ' + e.message });
    }

    const mergedPdf = await PDFDocument.create();
    const loadedFiles = [];

    for (const relPath of files) {
      const fullPath = getSafePath(relPath);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, error: `File not found: ${relPath}` });
      }

      const fileBytes = fs.readFileSync(fullPath);
      try {
        const doc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        loadedFiles.push(relPath);
      } catch (docErr) {
        console.warn(`Could not merge ${relPath}:`, docErr.message);
        return res.status(400).json({ 
          success: false, 
          error: `Failed reading PDF "${path.basename(relPath)}": ${docErr.message}` 
        });
      }
    }

    const mergedPdfBytes = await mergedPdf.save();

    if (action === 'save' || (saveName && action !== 'download' && action !== 'view')) {
      let cleanName = (saveName || `Merged_${Date.now()}.pdf`).trim();
      if (!cleanName.toLowerCase().endsWith('.pdf')) cleanName += '.pdf';
      // Sanitize filename
      cleanName = cleanName.replace(/[<>:"/\\|?*]+/g, '_');

      const folderRel = (targetFolder || '').trim();
      const folderFull = getSafePath(folderRel);
      if (!fs.existsSync(folderFull)) {
        fs.mkdirSync(folderFull, { recursive: true });
      }

      const destFullPath = path.join(folderFull, cleanName);
      // Ensure target path is safe (within documents dir or uploads dir)
      const resolvedDest = path.resolve(destFullPath);
      const isDocs = resolvedDest.startsWith(path.resolve(EFFECTIVE_DOCS_DIR));
      const isUploads = resolvedDest.startsWith(path.resolve(UPLOADS_DIR));
      if (!isDocs && !isUploads) {
        throw new Error('Access denied: Invalid target folder');
      }

      fs.writeFileSync(destFullPath, mergedPdfBytes);
      const savedRelativePath = path.join(folderRel, cleanName).replace(/\\/g, '/');

      return res.json({
        success: true,
        message: `Successfully merged ${loadedFiles.length} files into "${cleanName}"`,
        savedPath: savedRelativePath,
        fileName: cleanName,
        sizeBytes: mergedPdfBytes.length
      });
    }

    // Default or action === 'download' / 'view'
    const fileName = (saveName || `Merged_${Date.now()}.pdf`).trim();
    const downloadName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    if (action === 'download') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(downloadName)}"`);
    }
    return res.send(Buffer.from(mergedPdfBytes));

  } catch (err) {
    console.error('PDF merge error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
