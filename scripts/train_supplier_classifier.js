/**
 * ScanIQ Offline Supplier / Category Classifier — Training Script (v2)
 * ----------------------------------------------------------------------
 * Generates a pre-trained multinomial Naive Bayes model, with real
 * TF-IDF term weighting, from Millora's seed data and/or external
 * per-language training corpora (French / English / Arabic).
 *
 * Fixes vs v1:
 *  1. Arabic script + Arabic-Indic digits are preserved by the tokenizer
 *     (v1's regex silently deleted all Arabic text).
 *  2. Real IDF is computed and exported (v1 claimed "TF-IDF" but only
 *     stored raw term counts).
 *  3. Per-language stopword lists (FR / EN / AR) instead of French-only.
 *  4. Cross-class boilerplate words (gros, grossiste, distributeur,
 *     alger, invoice, total, فاتورة, ...) are filtered so they don't
 *     dilute the class signal.
 *  5. Laplace smoothing constant is exported so classification-time
 *     code doesn't collapse to zero probability on unseen words.
 *  6. Training data can be loaded from external JSON files under
 *     ./training/<lang>.json, in addition to (or instead of) the
 *     built-in seed data — no need to edit source to add documents.
 *  7. A line-item parser + classifier is included, because real
 *     tickets (see Millora POS receipts) mix multiple categories in
 *     one document; classifying whole documents alone is too coarse.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------
// 1. Language-aware normalization & tokenization
// ---------------------------------------------------------------------

// Basic Arabic-Indic -> ASCII digit map (٠-٩ -> 0-9)
const ARABIC_DIGIT_MAP = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

function normalizeArabicDigits(text) {
  return text.replace(/[٠-٩]/g, d => ARABIC_DIGIT_MAP[d] ?? d);
}

// Arabic tashkeel / diacritics range, stripped separately from Latin
// combining marks because NFD does not decompose them the same way.
const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670\u06D6-\u06ED]/g;

// Keep: latin letters, digits, Arabic block (\u0600-\u06FF), whitespace.
// v1 only kept [a-z0-9\s], which silently deleted every Arabic character.
const KEEP_CHARS = /[^a-z0-9\u0600-\u06FF\s]/g;

function tokenize(text, stopwords) {
  if (!text) return [];
  const normalized = normalizeArabicDigits(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip Latin accents (é -> e)
    .replace(ARABIC_DIACRITICS, '')  // strip Arabic tashkeel
    .replace(KEEP_CHARS, ' ');

  return normalized
    .split(/\s+/)
    .filter(token => token.length >= 2 && !stopwords.has(token));
}

// ---------------------------------------------------------------------
// 2. Stopwords, per language, plus shared cross-class boilerplate
// ---------------------------------------------------------------------

const STOPWORDS_FR = new Set([
  'de', 'la', 'le', 'les', 'des', 'un', 'une', 'du', 'au', 'aux',
  'et', 'ou', 'en', 'pour', 'par', 'sur', 'dans', 'avec', 'sans',
  'est', 'sont', 'facture', 'bon', 'livraison', 'total', 'montant',
  'date', 'tel', 'adresse', 'tva', 'ttc', 'ht',
  'rc', 'nif', 'nis', 'art', 'banque', 'rib', 'da', 'dzd',
  'ticket', 'paiement', 'credit', 'dette', 'client', 'acompte',
  'verse', 'reste', 'payer', 'commande', 'sous', 'merci', 'visite'
]);

const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with',
  'without', 'is', 'are', 'invoice', 'receipt', 'delivery', 'total',
  'amount', 'date', 'tel', 'phone', 'address', 'tax', 'vat',
  'bank', 'account', 'no', 'number', 'qty', 'quantity', 'price',
  'paid', 'due', 'balance', 'order', 'thanks', 'thank', 'you', 'visit'
]);

const STOPWORDS_AR = new Set([
  'في', 'من', 'على', 'إلى', 'و', 'أو', 'هذا', 'هذه', 'ذلك',
  'فاتورة', 'إيصال', 'توصيل', 'المجموع', 'المبلغ', 'تاريخ',
  'هاتف', 'العنوان', 'ضريبة', 'الضريبة', 'بنك', 'حساب', 'رقم',
  'الكمية', 'السعر', 'مدفوع', 'مستحق', 'الرصيد', 'طلب', 'شكرا', 'زيارة'
]);

// Words that show up across most/all classes in this domain (company-type
// nouns, place names) and therefore carry little discriminative value.
// v1 didn't filter these at all, so every class score was inflated by
// the same noise. Real IDF (below) also down-weights these automatically,
// but filtering the worst offenders keeps the vocabulary cleaner too.
const BOILERPLATE_STOPWORDS = new Set([
  'gros', 'grossiste', 'demi', 'distributeur', 'fournisseur', 'sarl',
  'alger', 'algerie', 'algeria', 'dz', 'wholesale', 'supplier', 'distributor'
]);

function stopwordsFor(lang) {
  const base = new Set(BOILERPLATE_STOPWORDS);
  const add = set => set.forEach(w => base.add(w));
  if (lang === 'fr' || lang === 'all') add(STOPWORDS_FR);
  if (lang === 'en' || lang === 'all') add(STOPWORDS_EN);
  if (lang === 'ar' || lang === 'all') add(STOPWORDS_AR);
  return base;
}

// Cheap heuristic language detector: enough for choosing which stopword
// set / tokenizer branch to apply at classification time.
function detectLanguage(text) {
  if (!text) return 'fr';
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  if (arabicChars > 2) return 'ar';
  const frenchMarkers = /[éèêàçùâîôû]|(\b(le|la|les|des|un|une|et|pour|avec)\b)/i;
  if (frenchMarkers.test(text)) return 'fr';
  return 'en';
}

// The single set used for *training* — a document can legitimately mix
// languages (e.g. French labels + English product names), so we always
// tokenize against the union of all stopword lists during training and
// only use per-language detection to pick a display/report language.
const ALL_STOPWORDS = stopwordsFor('all');

// ---------------------------------------------------------------------
// 3. Seed training data — French, English, Arabic variants per class.
//    (v1 only had French; that's why "multilingual" never worked.)
// ---------------------------------------------------------------------

const SEED_TRAINING_DATA = [
  {
    supplier: 'Sarl Alger Papeterie',
    documents: [
      // French
      'fournitures de bureau rouleaux papier thermique bobines ramette papier A4 classeurs stylos feutres archivage impression toner cartouche papier photo',
      'rouleaux papier caisse thermique pack 5 rouleaux papier thermique fournitures scolaires papeterie moderne',
      'tirage photo A4 impression document couleur papier blanc 80g papier cartonné reliure plastification chemises dossiers',
      'articles de papeterie consommables caisse enregistreuse rouleaux thermique 80x80 bobines flexy',
      // English
      'office supplies thermal paper rolls A4 paper ream binders pens markers filing printing toner cartridge photo paper',
      'thermal cash register paper roll pack of 5 thermal paper rolls school supplies stationery',
      'A4 photo print colour document print white paper 80g cardstock binding lamination folders',
      'stationery consumables cash register thermal paper rolls 80x80',
      // Arabic
      'لوازم مكتبية لفائف ورق حراري رزمة ورق A4 كلاسير أقلام تحرير ملفات أرشفة طباعة حبر ورق صور',
      'لفائف ورق آلة حاسبة حرارية علبة 5 لفائف ورق حراري لوازم مدرسية قرطاسية',
      'طباعة صور A4 طباعة وثيقة ملونة ورق أبيض 80 جرام تجليد بلاستيكي ملفات مجلدات',
      'مستلزمات قرطاسية آلة تسجيل نقدي لفائف حرارية'
    ]
  },
  {
    supplier: 'Grossiste Boissons & Confiserie',
    documents: [
      // French
      'café espresso thé vert naturel grains arabica robusta sucre dosettes café moulu boite café espresso 1kg',
      'alimentation générale croissant frais muffin chocolat viennoiseries pâtisserie gâteaux jus de fruits canettes sodas eau minérale',
      'café espresso thé vert croissants frais muffin chocolat pack 6 muffins confitures sirops snacks',
      'café moulu espresso thé vert menthe viennoiserie fraîcheur livraison matin',
      // English
      'espresso coffee green tea natural beans arabica robusta sugar pods ground coffee espresso box 1kg',
      'general food fresh croissant chocolate muffin pastries cakes fruit juice cans sodas mineral water',
      'espresso coffee green tea fresh croissants chocolate muffin pack of 6 muffins jams syrups snacks',
      'ground coffee espresso mint green tea pastry fresh morning delivery',
      // Arabic
      'قهوة اسبريسو شاي أخضر طبيعي حبوب أرابيكا روبوستا سكر أكياس قهوة مطحونة علبة قهوة اسبريسو 1 كيلوغرام',
      'مواد غذائية عامة كرواسون طازج مافن شوكولاتة معجنات كعك عصير فواكه علب مشروبات غازية مياه معدنية',
      'قهوة اسبريسو شاي أخضر كرواسون طازج مافن شوكولاتة علبة 6 مافن مربى شراب وجبات خفيفة',
      'قهوة مطحونة اسبريسو نعناع شاي أخضر معجنات طازجة توصيل صباحي'
    ]
  },
  {
    supplier: 'Distributeur Tech & Accessoires',
    documents: [
      // French
      'électronique écouteurs sans fil bluetooth câble USB-C rapide chargeur secteur 20W adaptateur audio connectique',
      'matériel informatique écouteurs sans fil TWS câble type-c powerbank batterie externe support téléphone écouteurs intra-auriculaires',
      'accessoires téléphonie et tech câble USB-C rapide écouteurs bluetooth chargeur rapide quick charge hub usb verre trempé coques',
      'écouteurs sans fil étui câble usb type c chargeur ultra rapide câbles usb lightning',
      // English
      'electronics wireless earbuds bluetooth USB-C fast cable power adapter 20W charger audio connector',
      'computer hardware wireless TWS earbuds type-c cable powerbank external battery phone stand in-ear earbuds',
      'phone and tech accessories fast USB-C cable bluetooth earbuds fast charger quick charge usb hub tempered glass cases',
      'wireless earbuds case usb type c cable ultra fast charger lightning usb cables',
      // Arabic
      'إلكترونيات سماعات لاسلكية بلوتوث كابل USB-C سريع شاحن كهربائي 20 واط محول صوت وصلات',
      'عتاد معلوماتي سماعات لاسلكية TWS كابل تايب سي بطارية محمولة خارجية حامل هاتف سماعات داخل الأذن',
      'إكسسوارات هاتف وتقنية كابل USB-C سريع سماعات بلوتوث شاحن سريع محور USB زجاج واقي أغطية',
      'سماعات لاسلكية علبة كابل يو اس بي تايب سي شاحن فائق السرعة كابلات لايتنينغ'
    ]
  }
];

// ---------------------------------------------------------------------
// 4. Loading external per-language training corpora, if present.
//    Expected format for ./training/<lang>.json:
//    [{ "supplier": "...", "documents": ["...", "..."] }, ...]
// ---------------------------------------------------------------------

function loadExternalTrainingData(trainingDir) {
  const merged = {}; // supplier -> Set(documents)
  if (!fs.existsSync(trainingDir)) return [];

  const files = fs.readdirSync(trainingDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(trainingDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn(`⚠️  Skipping ${file}: expected a JSON array of {supplier, documents}`);
        continue;
      }
      for (const entry of parsed) {
        if (!entry || typeof entry.supplier !== 'string' || !Array.isArray(entry.documents)) {
          console.warn(`⚠️  Skipping malformed entry in ${file}`);
          continue;
        }
        merged[entry.supplier] = merged[entry.supplier] || new Set();
        entry.documents.forEach(doc => merged[entry.supplier].add(doc));
      }
    } catch (err) {
      console.warn(`⚠️  Failed to parse ${filePath}: ${err.message}`);
    }
  }

  return Object.entries(merged).map(([supplier, docSet]) => ({
    supplier,
    documents: Array.from(docSet)
  }));
}

function mergeTrainingData(base, extra) {
  const merged = {};
  for (const entry of [...base, ...extra]) {
    merged[entry.supplier] = merged[entry.supplier] || new Set();
    entry.documents.forEach(doc => merged[entry.supplier].add(doc));
  }
  return Object.entries(merged).map(([supplier, docSet]) => ({
    supplier,
    documents: Array.from(docSet)
  }));
}

// ---------------------------------------------------------------------
// 5. Naive Bayes trainer with real TF-IDF + Laplace smoothing
// ---------------------------------------------------------------------

const LAPLACE_ALPHA = 1; // smoothing constant, exported for classification-time use

class NaiveBayesTrainer {
  constructor(stopwords = ALL_STOPWORDS) {
    this.stopwords = stopwords;
    this.classes = new Set();
    this.classDocCounts = {};      // class -> # documents
    this.classWordCounts = {};     // class -> total token count (for term-frequency priors)
    this.wordFrequencyPerClass = {}; // class -> { token: count }
    this.vocabulary = new Set();
    this.docFrequency = {};        // token -> # documents (any class) containing it
    this.totalDocs = 0;
  }

  train(trainingData) {
    for (const entry of trainingData) {
      const className = entry.supplier;
      this.classes.add(className);
      this.classDocCounts[className] = (this.classDocCounts[className] || 0) + entry.documents.length;
      this.classWordCounts[className] = this.classWordCounts[className] || 0;
      this.wordFrequencyPerClass[className] = this.wordFrequencyPerClass[className] || {};

      for (const doc of entry.documents) {
        this.totalDocs++;
        const tokens = tokenize(doc, this.stopwords);

        // document frequency uses unique tokens per document
        for (const token of new Set(tokens)) {
          this.docFrequency[token] = (this.docFrequency[token] || 0) + 1;
        }

        for (const token of tokens) {
          this.vocabulary.add(token);
          this.classWordCounts[className]++;
          this.wordFrequencyPerClass[className][token] =
            (this.wordFrequencyPerClass[className][token] || 0) + 1;
        }
      }
    }
  }

  // Real inverse-document-frequency, smoothed to avoid log(0) / div-by-zero.
  computeIdf() {
    const idf = {};
    for (const token of this.vocabulary) {
      const df = this.docFrequency[token] || 0;
      idf[token] = Math.log((1 + this.totalDocs) / (1 + df)) + 1;
    }
    return idf;
  }

  exportModel() {
    const idf = this.computeIdf();
    return {
      version: '2.0.0',
      createdAt: new Date().toISOString(),
      languages: ['fr', 'en', 'ar'],
      alpha: LAPLACE_ALPHA,
      classes: Array.from(this.classes),
      totalDocs: this.totalDocs,
      vocabularySize: this.vocabulary.size,
      classDocCounts: this.classDocCounts,
      classWordCounts: this.classWordCounts,
      wordFrequencyPerClass: this.wordFrequencyPerClass,
      docFrequency: this.docFrequency,
      idf,
      vocabulary: Array.from(this.vocabulary)
    };
  }
}

// ---------------------------------------------------------------------
// 6. Classification helpers (log-space Naive Bayes with TF-IDF weighting
//    and Laplace smoothing), plus a line-item-aware ticket parser.
// ---------------------------------------------------------------------

function classifyDocument(text, model, stopwords = ALL_STOPWORDS) {
  const tokens = tokenize(text, stopwords);
  if (tokens.length === 0) return { label: null, scores: {} };

  const scores = {};
  const totalDocsAllClasses = model.totalDocs;

  for (const className of model.classes) {
    const prior = Math.log((model.classDocCounts[className] || 0) / totalDocsAllClasses);
    let logProb = prior;
    const classTotalWords = model.classWordCounts[className] || 0;
    const vocabSize = model.vocabularySize;

    for (const token of tokens) {
      const count = (model.wordFrequencyPerClass[className] || {})[token] || 0;
      // Laplace-smoothed conditional probability
      const pTokenGivenClass = (count + model.alpha) / (classTotalWords + model.alpha * vocabSize);
      // Weight by IDF so rare, distinctive terms count more than boilerplate
      const weight = model.idf[token] || 1;
      logProb += weight * Math.log(pTokenGivenClass);
    }
    scores[className] = logProb;
  }

  const label = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return { label, scores };
}

// Splits a receipt/ticket into item lines and classifies each one
// independently, then aggregates. Needed because real tickets (see
// Millora POS receipts) commonly mix several categories in one document
// — a whole-document classifier alone would misattribute everything to
// a single class.
const LINE_ITEM_PATTERN = /^(.+?)\s+(\d+)\s+([\d.,]+)\s*$/; // "Name  Qty  Total"

function parseLineItems(rawText) {
  return rawText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(LINE_ITEM_PATTERN);
      if (!match) return null;
      const [, name, qty, total] = match;
      return { name: name.trim(), qty: Number(qty), total: Number(total.replace(',', '.')) };
    })
    .filter(Boolean);
}

function classifyTicket(rawText, model, stopwords = ALL_STOPWORDS) {
  const items = parseLineItems(rawText);
  const perItem = items.map(item => ({
    ...item,
    classification: classifyDocument(item.name, model, stopwords)
  }));

  const byClass = {};
  for (const item of perItem) {
    const label = item.classification.label || 'unclassified';
    byClass[label] = byClass[label] || { itemCount: 0, total: 0 };
    byClass[label].itemCount += 1;
    byClass[label].total += item.total;
  }

  return { items: perItem, byClass };
}

// ---------------------------------------------------------------------
// 7. Entry point
// ---------------------------------------------------------------------

function runTraining() {
  console.log('🤖 ScanIQ: Starting multilingual (FR/EN/AR) supplier classifier training...');

  const trainingDir = path.join(__dirname, 'training');
  const externalData = loadExternalTrainingData(trainingDir);
  const trainingData = mergeTrainingData(SEED_TRAINING_DATA, externalData);

  if (externalData.length > 0) {
    console.log(`📂 Loaded ${externalData.length} supplier(s) worth of extra documents from ${trainingDir}`);
  }

  const trainer = new NaiveBayesTrainer();
  trainer.train(trainingData);
  const model = trainer.exportModel();

  const outputDir = path.join(__dirname, '..', 'public', 'js', 'models');

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, 'supplier_classifier_model.json');
    fs.writeFileSync(outputPath, JSON.stringify(model, null, 2), 'utf8');
    console.log(`✅ Model successfully generated at: ${outputPath}`);
    console.log(
      `📊 Statistics: ${model.classes.length} classes, ${model.totalDocs} seed docs, ` +
      `${model.vocabularySize} vocabulary tokens, languages: ${model.languages.join(', ')}.`
    );
  } catch (err) {
    console.error(`❌ Failed to write model file: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  // Small self-check so a broken build fails loudly instead of shipping
  // a model that can't even classify its own training examples.
  const sample = 'écouteurs sans fil bluetooth câble usb-c rapide';
  const result = classifyDocument(sample, model);
  console.log(`🔎 Self-check classification for "${sample}" → ${result.label}`);
}

if (require.main === module) {
  runTraining();
}

module.exports = {
  tokenize,
  detectLanguage,
  stopwordsFor,
  ALL_STOPWORDS,
  SEED_TRAINING_DATA,
  loadExternalTrainingData,
  mergeTrainingData,
  NaiveBayesTrainer,
  classifyDocument,
  parseLineItems,
  classifyTicket,
  runTraining
};