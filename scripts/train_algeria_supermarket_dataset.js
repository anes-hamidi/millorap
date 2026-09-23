/**
 * ScanIQ & Millora — Algeria Supermarket Product Dataset Pipeline & ML Training Script
 * -------------------------------------------------------------------------------------
 * 1. Ingests 42,010 real Algerian supermarket products from Stock.json.
 * 2. Cleans designations, normalizes barcodes, categorizes items using domain heuristics.
 * 3. Skips the 'Tva' field completely (zero VAT policy).
 * 4. Generates an enriched multilingual Naive Bayes + TF-IDF training corpus.
 * 5. Trains and exports the compiled model to public/js/models/supplier_classifier_model.json.
 * 6. Exports the cleaned catalog to public/data/algeria_supermarket_products.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Candidate source dataset locations
const POSSIBLE_STOCK_PATHS = [
  'C:/Users/fethi/Downloads/json/Stock.json',
  path.join(__dirname, '../data/Stock.json'),
  path.join(__dirname, '../data/algeria_supermarket_stock.json')
];

let rawData = null;
let foundPath = null;

for (const p of POSSIBLE_STOCK_PATHS) {
  if (fs.existsSync(p)) {
    try {
      console.log(`[Dataset] Reading dataset from: ${p}`);
      rawData = JSON.parse(fs.readFileSync(p, 'utf8'));
      foundPath = p;
      break;
    } catch (e) {
      console.warn(`[Dataset] Failed reading from ${p}:`, e.message);
    }
  }
}

if (!rawData || !Array.isArray(rawData)) {
  console.error('[Dataset] Could not find or load Stock.json dataset.');
  process.exit(1);
}

console.log(`[Dataset] Loaded ${rawData.length} raw records successfully.`);

// ---------------------------------------------------------------------
// 1. Language-aware normalization & tokenization
// ---------------------------------------------------------------------

const ARABIC_DIGIT_MAP = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
function normalizeArabicDigits(text) {
  return text.replace(/[٠-٩]/g, d => ARABIC_DIGIT_MAP[d] ?? d);
}

const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670\u06D6-\u06ED]/g;
const KEEP_CHARS = /[^a-z0-9\u0600-\u06FF\s]/g;

const STOPWORDS = new Set([
  'de', 'la', 'le', 'les', 'des', 'un', 'une', 'du', 'au', 'aux',
  'et', 'ou', 'en', 'pour', 'par', 'sur', 'dans', 'avec', 'sans',
  'est', 'sont', 'facture', 'bon', 'livraison', 'total', 'montant',
  'date', 'tel', 'adresse', 'algerie', 'alger', 'tva', 'ttc', 'ht',
  'rc', 'nif', 'nis', 'art', 'banque', 'rib', 'da', 'dzd', 'dz',
  'ticket', 'paiement', 'credit', 'dette', 'client', 'acompte',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with',
  'في', 'من', 'على', 'إلى', 'و', 'أو', 'هذا', 'هذه', 'ذلك',
  'فاتورة', 'المجموع', 'المبلغ', 'تاريخ', 'هاتف', 'العنوان', 'ضريبة',
  'art000', 'art00', 'art0', 'gm', 'pm', 'mm', 'ml', 'cl', 'kg', 'gr', 'g'
]);

function tokenize(text) {
  if (!text) return [];
  const normalized = normalizeArabicDigits(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(KEEP_CHARS, ' ');

  return normalized
    .split(/\s+/)
    .filter(token => token.length >= 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

// ---------------------------------------------------------------------
// 2. Category Heuristics & Icons
// ---------------------------------------------------------------------

const CATEGORY_RULES = [
  {
    category: 'Boissons & Confiserie',
    icon: '🧃',
    supplier: 'Grossiste Boissons & Confiserie',
    regex: /\b(jus|eau|minerale|soda|coca|pepsi|fanta|sprite|mirinda|ifri|ngaous|ramy|toudja|boga|hamoud|boualem|slim|selecto|gaz|gazeuse|boisson|cafe|the|nescafe|lipton|canette|nectar|sirop|vital|booster|energetique|energy|aroma|espresso|biscuit|chocolat|choc|gaufrette|bimo|tango|palmito|madeleine|gaufre|cake|muffin|croissant|bonbon|chewing|gum|bubble|chupa|nutella|tartiner|halwa|chamia|snack|chips|mahboul|pringles|doritos|popcorn)\b/i
  },
  {
    category: 'Produits Laitiers & Frais',
    icon: '🧀',
    supplier: 'Distributeur Produits Laitiers & Fromagerie',
    regex: /\b(lait|fromage|yaourt|yogourt|soummam|danone|candia|hodna|trfle|trefle|beurre|margarine|creme|tartina|portion|camembert|gruyere|rouge|edam|mozzarella|gouda|cheddar|lactel|cremerie|lebne|raib|lben)\b/i
  },
  {
    category: 'Épicerie & Alimentation Générale',
    icon: '🥫',
    supplier: 'Grossiste Épicerie & Produits Alimentaires',
    regex: /\b(huile|eliousr|afia|cevital|fleurial|semoule|farine|couscous|sim|mama|pates|spaghetti|macaroni|riz|sucre|sel|epice|tomate|thon|sardine|conserves|harissa|mayonnaise|moutarde|ketchup|vinaigre|pois|lentilles|haricots|sauce|bouillon|jumbo|maggi|cubes|levure|soupe)\b/i
  },
  {
    category: 'High-Tech & Accessoires',
    icon: '🎧',
    supplier: 'Distributeur Tech & Accessoires',
    regex: /\b(ecouteurs|écouteurs|bluetooth|cable|câble|chargeur|usb|type-c|adaptateur|souris|clavier|casque|powerbank|flash|memoire|carte sd|accessoires)\b/i
  },
  {
    category: 'Hygiène, Beauté & Soins',
    icon: '🧴',
    supplier: 'Distributeur Hygiène, Cosmétique & Parfumerie',
    regex: /\b(shampoing|champoing|savon|gel|douche|savonnette|palmolive|dove|nivea|head|shoulders|pantene|loreal|garnier|dentifrice|signal|colgate|rasage|gillette|bic|parfum|deodorant|deo|brut|fa|rexona|axe|creme|apres-rasage|soin|cheveux|corps|beaute|coton|serviette|hygienique|always|nana)\b/i
  },
  {
    category: 'Entretien & Ménage',
    icon: '🧹',
    supplier: 'Grossiste Produits d\'Entretien & Détergents',
    regex: /\b(lessive|ariel|omo|skip|test|isis|javel|berlingot|vaisselle|pril|mir|sol|nettoyant|ajax|assouplissant|soupline|sanitaire|canard|wc|desodorisant|chiffon|eponge|sac poubelle|lavette|deboucheur|detartrant)\b/i
  },
  {
    category: 'Bébé & Maternité',
    icon: '👶',
    supplier: 'Distributeur Puériculture & Soins Bébé',
    regex: /\b(couche|pampers|huggies|moltex|canbebe|biberon|tetine|lingette|lingettes|lait bebe|infantile|guigoz|nidal|cerelac|baby|talc)\b/i
  },
  {
    category: 'Papeterie, Bazar & Maison',
    icon: '📦',
    supplier: 'Sarl Alger Papeterie',
    regex: /\b(papier|thermique|ramette|photo|cahier|stylo|classeur|rouleau|bobine|encre|pile|piles|duracell|energizer|lampe|ampoule|briquet|allumettes|scotch|adhésif|emballage|aluminium|film)\b/i
  }
];

function classifyProduct(designation) {
  const desc = designation || '';
  for (const rule of CATEGORY_RULES) {
    if (rule.regex.test(desc)) {
      return {
        category: rule.category,
        icon: rule.icon,
        supplier: rule.supplier
      };
    }
  }
  return {
    category: 'Alimentation & Bazar Général',
    icon: '🛒',
    supplier: 'Grossiste Alimentation & Marchandises Diverses'
  };
}

// ---------------------------------------------------------------------
// 3. Process Products & Strip TVA Field
// ---------------------------------------------------------------------

console.log('[Dataset] Cleaning and processing products (Skipping TVA)...');

const cleanedProducts = [];
const seenBarcodes = new Set();
const classDocuments = {};

// Initialize classes
for (const rule of CATEGORY_RULES) {
  classDocuments[rule.supplier] = [];
}
classDocuments['Grossiste Alimentation & Marchandises Diverses'] = [];

let processedCount = 0;

for (const raw of rawData) {
  const rawBarcode = (raw['Code Barre'] || '').trim();
  const rawDesc = (raw['Désignation'] || '').trim();
  const rawRef = (raw['Référence'] || '').trim();

  if (!rawDesc) continue;

  // Deduplicate by barcode if present
  if (rawBarcode && seenBarcodes.has(rawBarcode)) continue;
  if (rawBarcode) seenBarcodes.add(rawBarcode);

  const meta = classifyProduct(rawDesc);

  // Clean description
  const cleanName = rawDesc
    .replace(/^[\s\-./]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanName || cleanName.length < 2) continue;

  // Parse prices or provide realistic retail estimates based on category
  let costPrice = parseFloat((raw['Montant prix achat'] || '0').replace(',', '.')) || 0;
  let sellingPrice = parseFloat((raw['Prix de vente Min'] || '0').replace(',', '.')) || 0;

  if (costPrice <= 0 && sellingPrice <= 0) {
    // Generate realistic default Algerian Dinar price based on item category
    if (meta.category === 'Boissons & Jus') {
      costPrice = 65;
      sellingPrice = 90;
    } else if (meta.category === 'Biscuits, Chocolat & Confiserie') {
      costPrice = 80;
      sellingPrice = 120;
    } else if (meta.category === 'Produits Laitiers & Frais') {
      costPrice = 140;
      sellingPrice = 180;
    } else if (meta.category === 'Épicerie & Alimentation Générale') {
      costPrice = 110;
      sellingPrice = 150;
    } else if (meta.category === 'Hygiène, Beauté & Soins') {
      costPrice = 280;
      sellingPrice = 380;
    } else if (meta.category === 'Entretien & Ménage') {
      costPrice = 220;
      sellingPrice = 290;
    } else if (meta.category === 'Bébé & Maternité') {
      costPrice = 850;
      sellingPrice = 1100;
    } else {
      costPrice = 75;
      sellingPrice = 100;
    }
  } else if (costPrice > 0 && sellingPrice <= 0) {
    sellingPrice = Math.round(costPrice * 1.3);
  } else if (sellingPrice > 0 && costPrice <= 0) {
    costPrice = Math.round(sellingPrice * 0.75);
  }

  // Construct Clean Product Record WITHOUT TVA (explicitly skipped)
  const productRecord = {
    barcode: rawBarcode || `200${String(cleanedProducts.length + 1).padStart(10, '0')}`,
    reference: rawRef || `REF-${cleanedProducts.length + 1}`,
    name: cleanName,
    category: meta.category,
    costPrice: costPrice,
    sellingPrice: sellingPrice,
    currentStock: Math.max(0, parseInt(raw['Quantité'], 10) || 25),
    lowStockThreshold: 5,
    icon: meta.icon,
    createdAt: new Date().toISOString()
  };

  cleanedProducts.push(productRecord);
  classDocuments[meta.supplier].push(cleanName);
  processedCount++;
}

console.log(`[Dataset] Successfully processed ${cleanedProducts.length} unique products across ${Object.keys(classDocuments).length} categories.`);

// ---------------------------------------------------------------------
// 4. Build Enriched Multilingual Naive Bayes + TF-IDF Model
// ---------------------------------------------------------------------

console.log('[ML Model] Building vocabulary and term frequencies...');

const classes = Object.keys(classDocuments);
const classDocCounts = {};
const classWordCounts = {};
const wordFrequencyPerClass = {};
const globalDocFrequency = {};
const vocabSet = new Set();

let totalDocs = 0;

for (const className of classes) {
  const docs = classDocuments[className];
  classDocCounts[className] = docs.length;
  classWordCounts[className] = 0;
  wordFrequencyPerClass[className] = {};
  totalDocs += docs.length;

  for (const doc of docs) {
    const tokens = tokenize(doc);
    const seenInDoc = new Set();

    for (const token of tokens) {
      vocabSet.add(token);
      classWordCounts[className]++;
      wordFrequencyPerClass[className][token] = (wordFrequencyPerClass[className][token] || 0) + 1;

      if (!seenInDoc.has(token)) {
        seenInDoc.add(token);
        globalDocFrequency[token] = (globalDocFrequency[token] || 0) + 1;
      }
    }
  }
}

// Compute IDF
const idf = {};
const vocabSize = vocabSet.size;
for (const term of vocabSet) {
  const df = globalDocFrequency[term] || 1;
  idf[term] = Math.round((Math.log((totalDocs + 1) / (df + 1)) + 1) * 1000) / 1000;
}

const compiledModel = {
  version: '3.0.0',
  createdAt: new Date().toISOString(),
  datasetSource: 'Algeria Supermarket Product Dataset (42,010 items)',
  languages: ['fr', 'ar', 'en'],
  alpha: 1.0,
  classes: classes,
  totalDocs: totalDocs,
  vocabularySize: vocabSize,
  classDocCounts: classDocCounts,
  classWordCounts: classWordCounts,
  wordFrequencyPerClass: wordFrequencyPerClass,
  idf: idf,
  vocabulary: Array.from(vocabSet).sort()
};

// ---------------------------------------------------------------------
// 5. Save Model and Catalog
// ---------------------------------------------------------------------

const MODEL_OUTPUT_PATH = path.join(__dirname, '../public/js/models/supplier_classifier_model.json');
const CATALOG_OUTPUT_PATH = path.join(__dirname, '../public/data/algeria_supermarket_products.json');
const POS_CATALOG_PATH = path.join(__dirname, '../data/pos_products.json');

// Ensure target directories exist
fs.mkdirSync(path.dirname(MODEL_OUTPUT_PATH), { recursive: true });
fs.mkdirSync(path.dirname(CATALOG_OUTPUT_PATH), { recursive: true });
fs.mkdirSync(path.dirname(POS_CATALOG_PATH), { recursive: true });

fs.writeFileSync(MODEL_OUTPUT_PATH, JSON.stringify(compiledModel, null, 2), 'utf8');
console.log(`[ML Model] Exported trained model to: ${MODEL_OUTPUT_PATH} (Vocab size: ${vocabSize}, Classes: ${classes.length})`);

// Export full catalog
fs.writeFileSync(CATALOG_OUTPUT_PATH, JSON.stringify(cleanedProducts), 'utf8');
console.log(`[Catalog] Exported full catalog to: ${CATALOG_OUTPUT_PATH} (${cleanedProducts.length} products)`);

// Export top seed products to data/pos_products.json
const topSeed = cleanedProducts.slice(0, 500);
fs.writeFileSync(POS_CATALOG_PATH, JSON.stringify(topSeed, null, 2), 'utf8');
console.log(`[Catalog] Exported top 500 seed products to: ${POS_CATALOG_PATH}`);

console.log('\n🎉 Training and dataset processing completed successfully with TVA skipped!');
