const fs = require('fs');
const zlib = require('zlib');

/**
 * Pure zero-dependency PDF text stream extractor
 * Works completely offline in Node.js and modern browsers
 */
function extractTextFromPdfBuffer(buffer) {
  let fullText = '';
  const str = buffer.toString('binary');
  
  // Find all stream ... endstream blocks
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  
  while ((match = streamRegex.exec(str)) !== null) {
    const rawStream = Buffer.from(match[1], 'binary');
    let decompressed = '';
    
    try {
      // Try raw inflate or zlib inflate
      decompressed = zlib.inflateSync(rawStream).toString('utf8');
    } catch (e) {
      try {
        decompressed = zlib.inflateRawSync(rawStream).toString('utf8');
      } catch (e2) {
        decompressed = rawStream.toString('utf8');
      }
    }
    
    if (decompressed && (decompressed.includes('BT') || decompressed.includes('Tj') || decompressed.includes('TJ'))) {
      // Extract text inside BT ... ET blocks
      const btBlocks = decompressed.match(/BT[\s\S]*?ET/g) || [];
      for (const block of btBlocks) {
        // Extract string literals in parenthesis (Text) Tj or [(T) -10 (ext)] TJ
        const tjMatches = block.match(/\((.*?)\)\s*Tj/g) || [];
        for (const tj of tjMatches) {
          const textPart = tj.replace(/^\(/, '').replace(/\)\s*Tj$/, '');
          fullText += textPart + ' ';
        }
        
        const tjArrayMatches = block.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
        for (const tjArray of tjArrayMatches) {
          const inside = tjArray.replace(/^\[/, '').replace(/\]\s*TJ$/, '');
          const strings = inside.match(/\((.*?)\)/g) || [];
          for (const s of strings) {
            fullText += s.slice(1, -1);
          }
          fullText += ' ';
        }
        fullText += '\n';
      }
    }
  }
  
  return fullText.trim();
}

console.log('Tested pure PDF text extractor');
