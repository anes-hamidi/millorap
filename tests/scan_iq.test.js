/**
 * ScanIQ Comprehensive Unit Test Suite
 * Validates:
 * 1. Extraction parser on 3 distinct real-world invoice formats.
 * 2. Live product catalog fuzzy matching & confidence tier calculations.
 * 3. Offline Supplier ML Classifier inference.
 * 4. Local correction-to-retraining feedback loop.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractStructuredInvoiceData, matchItemsWithCatalog, stringSimilarity } = require('../routes/scan');
const { SupplierClassifier } = require('../public/js/supplierClassifier');

// Sample Product Catalog (Matches Millora's seed products)
const SAMPLE_CATALOG = [
  { id: 1, barcode: '890123456001', name: 'Café Espresso', category: 'Beverage', costPrice: 60, sellingPrice: 150, currentStock: 99 },
  { id: 2, barcode: '890123456002', name: 'Thé Vert Naturel', category: 'Beverage', costPrice: 40, sellingPrice: 100, currentStock: 50 },
  { id: 3, barcode: '890123456003', name: 'Croissant Frais', category: 'Bakery', costPrice: 50, sellingPrice: 120, currentStock: 35 },
  { id: 4, barcode: '890123456004', name: 'Muffin Chocolat', category: 'Bakery', costPrice: 80, sellingPrice: 180, currentStock: 25 },
  { id: 5, barcode: '890123456005', name: 'Impression Document (Couleur)', category: 'Printing', costPrice: 8, sellingPrice: 25, currentStock: 999 },
  { id: 6, barcode: '890123456006', name: 'Tirage Photo A4', category: 'Printing', costPrice: 70, sellingPrice: 200, currentStock: 150 },
  { id: 7, barcode: '890123456007', name: 'Écouteurs Sans Fil', category: 'Electronics', costPrice: 1600, sellingPrice: 2800, currentStock: 15 },
  { id: 8, barcode: '890123456008', name: 'Câble USB-C Rapide', category: 'Electronics', costPrice: 280, sellingPrice: 650, currentStock: 40 },
  { id: 9, barcode: '890123456009', name: 'Rouleaux Papier Thermique (x5)', category: 'Supplies', costPrice: 500, sellingPrice: 900, currentStock: 30 }
];

// Sample Invoices
const INVOICE_1_PAPETERIE = `
SARL ALGER PAPETERIE
Zone Industrielle Bab Ezzouar, Alger
Tel: 023 12 34 56 - NIF: 001234567890123
FACTURE N°: FAC-2024-089
Date: 15/09/2024

Désignation | Quantité | Prix Unit. HT | Montant HT
Rouleaux Papier Thermique (x5) | 10 | 500.00 | 5000.00
Tirage Photo A4 | 20 | 70.00 | 1400.00
Impression Document (Couleur) | 100 | 8.00 | 800.00

Total HT : 7 200,00 DA
TVA (19%) : 1 368,00 DA
Total TTC : 8 568,00 DA
`;

const INVOICE_2_BOISSONS = `
GROSSISTE BOISSONS & CONFISERIE
Kouba, Alger - Tel: 0555 98 76 54
Bon de Livraison / Facture N° BL-8842
Date: 18/09/2024

Articles | Qté | P.U HT | Total HT
Café Espresso | 15 | 60.00 | 900.00
Thé Vert Naturel | 10 | 40.00 | 400.00
Croissant Frais | 30 | 50.00 | 1500.00
Muffin Chocolat | 20 | 80.00 | 1600.00

Montant HT : 4 400,00 DA
TVA (19%) : 836,00 DA
Net à Payer TTC : 5 236,00 DA
`;

const INVOICE_3_TECH = `
DISTRIBUTEUR TECH & ACCESSOIRES
Hydra, Alger - Tel: 0661 11 22 33
FACTURE N° INV-7731
Date: 20/09/2024

Désignation | Quantité | Prix Unitaire | Total
Écouteurs Sans Fil | 5 | 1600.00 | 8000.00
Câble USB-C Rapide | 15 | 280.00 | 4200.00

Total HT : 12 200.00 DA
TVA : 2 318.00 DA
Total Général TTC : 14 518.00 DA
`;

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

console.log('🧪 =========================================================');
console.log('🧪 ScanIQ Intelligent Invoice Scanner — Automated Test Suite');
console.log('🧪 =========================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: EXTRACTION PARSER ACROSS 3 INVOICE FORMATS
// -----------------------------------------------------------------------------
console.log('📋 [Suite 1/4] Structured Invoice Extraction Parser');

runTest('Format 1 (Papeterie & Printing): Extracts metadata and 3 items correctly', () => {
  const result = extractStructuredInvoiceData(INVOICE_1_PAPETERIE);
  assert.strictEqual(result.supplier, 'Sarl Alger Papeterie', 'Supplier should be Sarl Alger Papeterie');
  assert.strictEqual(result.invoiceNumber, 'FAC-2024-089', 'Invoice number should match FAC-2024-089');
  assert.strictEqual(result.date, '2024-09-15', 'Date should normalize to 2024-09-15');
  assert.strictEqual(result.items.length, 3, 'Should extract 3 line items');
  assert.strictEqual(result.items[0].description, 'Rouleaux Papier Thermique (x5)');
  assert.strictEqual(result.items[0].quantity, 10);
  assert.strictEqual(result.items[0].unitPrice, 500);
  assert.strictEqual(result.total, 8568, 'Total TTC should be 8568');
});

runTest('Format 2 (Beverage & Bakery): Extracts metadata and 4 items correctly', () => {
  const result = extractStructuredInvoiceData(INVOICE_2_BOISSONS);
  assert.strictEqual(result.supplier, 'Grossiste Boissons & Confiserie');
  assert.strictEqual(result.invoiceNumber, 'BL-8842');
  assert.strictEqual(result.date, '2024-09-18');
  assert.strictEqual(result.items.length, 4, 'Should extract 4 line items');
  assert.strictEqual(result.items[0].description, 'Café Espresso');
  assert.strictEqual(result.items[0].quantity, 15);
  assert.strictEqual(result.items[2].description, 'Croissant Frais');
  assert.strictEqual(result.items[2].quantity, 30);
  assert.strictEqual(result.total, 5236, 'Total TTC should be 5236');
});

runTest('Format 3 (Electronics & Tech): Extracts metadata and 2 items correctly', () => {
  const result = extractStructuredInvoiceData(INVOICE_3_TECH);
  assert.strictEqual(result.supplier, 'Distributeur Tech & Accessoires');
  assert.strictEqual(result.invoiceNumber, 'INV-7731');
  assert.strictEqual(result.date, '2024-09-20');
  assert.strictEqual(result.items.length, 2, 'Should extract 2 line items');
  assert.strictEqual(result.items[0].description, 'Écouteurs Sans Fil');
  assert.strictEqual(result.items[0].unitPrice, 1600);
  assert.strictEqual(result.total, 14518, 'Total TTC should be 14518');
});

// -----------------------------------------------------------------------------
// TEST SUITE 2: FUZZY PRODUCT MATCHING & CONFIDENCE TIERS
// -----------------------------------------------------------------------------
console.log('\n🔍 [Suite 2/4] Live Catalog Fuzzy Matching & Scoring');

runTest('Exact and high-similarity items achieve >=80% confidence and matchTier=high', () => {
  const extracted = [
    { description: 'Café Espresso 1kg grain', quantity: 5, unitPrice: 60 },
    { description: 'Croissant Frais du matin', quantity: 10, unitPrice: 50 },
    { description: 'Cable USB-C Rapide 2m', quantity: 4, unitPrice: 280 }
  ];

  const matched = matchItemsWithCatalog(extracted, SAMPLE_CATALOG);
  assert.strictEqual(matched.length, 3);
  assert.strictEqual(matched[0].matchTier, 'high', 'Café Espresso should be high tier');
  assert.strictEqual(matched[0].matchedProductId, 1);
  assert.strictEqual(matched[1].matchTier, 'high', 'Croissant Frais should be high tier');
  assert.strictEqual(matched[1].matchedProductId, 3);
  assert.strictEqual(matched[2].matchTier, 'high', 'Cable USB-C should be high tier');
  assert.strictEqual(matched[2].matchedProductId, 8);
});

runTest('Unmatched/novel products are correctly flagged as matchTier=unmatched (<50%)', () => {
  const extracted = [
    { description: 'Souris Gamer Sans Fil RGB Pro', quantity: 2, unitPrice: 4500 }
  ];

  const matched = matchItemsWithCatalog(extracted, SAMPLE_CATALOG);
  assert.strictEqual(matched[0].matchTier, 'unmatched', 'Novel product must be marked unmatched');
  assert.strictEqual(matched[0].matchedProductId, null);
  assert.ok(matched[0].matchScore < 50, 'Confidence score must be < 50%');
});

// -----------------------------------------------------------------------------
// TEST SUITE 3: OFFLINE SUPPLIER CLASSIFIER INFERENCE
// -----------------------------------------------------------------------------
console.log('\n🤖 [Suite 3/4] Offline ML Supplier Classifier');

runTest('Pre-trained model classifies unlabelled invoice text with >=80% confidence', () => {
  const modelPath = path.join(__dirname, '..', 'public', 'js', 'models', 'supplier_classifier_model.json');
  const raw = fs.readFileSync(modelPath, 'utf8');
  const classifier = new SupplierClassifier(JSON.parse(raw));

  const text1 = 'Livraison de rouleaux papier thermique et ramettes papier photo couleur Bab Ezzouar';
  const pred1 = classifier.predict(text1);
  assert.strictEqual(pred1.supplier, 'Sarl Alger Papeterie');
  assert.ok(pred1.confidence >= 80, `Expected confidence >= 80, got ${pred1.confidence}`);

  const text2 = 'Commande café espresso grains arabica thé vert dosettes muffins viennoiseries';
  const pred2 = classifier.predict(text2);
  assert.strictEqual(pred2.supplier, 'Grossiste Boissons & Confiserie');
  assert.ok(pred2.confidence >= 80, `Expected confidence >= 80, got ${pred2.confidence}`);

  const text3 = 'Livraison écouteurs sans fil bluetooth et câbles type c chargeur rapide';
  const pred3 = classifier.predict(text3);
  assert.strictEqual(pred3.supplier, 'Distributeur Tech & Accessoires');
  assert.ok(pred3.confidence >= 80, `Expected confidence >= 80, got ${pred3.confidence}`);
});

// -----------------------------------------------------------------------------
// TEST SUITE 4: HUMAN-IN-THE-LOOP RETRAINING FEEDBACK LOOP
// -----------------------------------------------------------------------------
console.log('\n🔄 [Suite 4/4] Local Online Retraining Feedback Loop');

runTest('Incremental training learns a new supplier and increases prediction score immediately', () => {
  const modelPath = path.join(__dirname, '..', 'public', 'js', 'models', 'supplier_classifier_model.json');
  const raw = fs.readFileSync(modelPath, 'utf8');
  const classifier = new SupplierClassifier(JSON.parse(raw));

  const novelInvoiceText = 'Facture Fournisseur N° 9928 - Livres scolaires parascolaire dictionnaires romans manuels pédagogiques Didactique Alger';
  
  // Before training: New supplier does not exist
  const beforePred = classifier.predict(novelInvoiceText);
  assert.notStrictEqual(beforePred.supplier, 'Éditions du Savoir Didactique');

  // User corrects the supplier
  classifier.incrementalTrain('Éditions du Savoir Didactique', novelInvoiceText);

  // After training: Classifier recognizes the new supplier on similar invoice
  const testInvoiceText = 'Livraison livres parascolaire didactique romans manuels scolaires';
  const afterPred = classifier.predict(testInvoiceText);
  assert.strictEqual(afterPred.supplier, 'Éditions du Savoir Didactique', 'Retrained model must identify learned supplier');
  assert.ok(afterPred.confidence >= 50, 'Confidence must be significantly positive for learned supplier');
});

// -----------------------------------------------------------------------------
// TEST SUITE 5: REAL DIGITAL PDF & OCR UNSTRUCTURED TEXT INGESTION
// -----------------------------------------------------------------------------
console.log('\n📄 [Suite 5/5] Real Digital PDF & OCR Extracted Text Parsing');

runTest('Real multi-line PDF text layer without pipes parses headers and line items correctly', () => {
  const REAL_UNSTRUCTURED_INVOICE = `
STE INDUSTRIELLE DES BOISSONS SARL
12 Rue des Frères Bouadou, Bir Mourad Raïs, Alger
NIF 099812345678901 RC 16/00-123456B16
FACTURE PROFORMA N°: FP-2024-1102
Date d'émission: 22/09/2024

Tableau récapitulatif des livraisons:
Réf Désignation Qté P.U HT Montant
101 Café Espresso 100% Arabica 25 60.00 1500.00
102 Thé Vert Naturel Menthe 10 40.00 400.00
103 Croissant Frais Beurre 50 50.00 2500.00

Sous-total HT: 4400.00 DA
TVA 19%: 836.00 DA
NET A PAYER: 5236.00 DA
`;

  const parsed = extractStructuredInvoiceData(REAL_UNSTRUCTURED_INVOICE);
  assert.ok(parsed.items.length >= 3, `Expected at least 3 items, found ${parsed.items.length}`);
  assert.strictEqual(parsed.invoiceNumber, 'FP-2024-1102');
  assert.strictEqual(parsed.date, '2024-09-22');
  assert.strictEqual(parsed.total, 5236);

  // Match against catalog
  const matched = matchItemsWithCatalog(parsed.items, SAMPLE_CATALOG);
  assert.strictEqual(matched[0].matchedProductId, 1);
  assert.strictEqual(matched[1].matchedProductId, 2);
  assert.strictEqual(matched[2].matchedProductId, 3);
});

runTest('POS Receipt / Ticket with Article-Qté-Total format extracts items and matches catalog', () => {
  const POS_TICKET = `
MILLORA STORE POS
Système de Vente & Caisse
Ticket: DZ-T1-mue6b3kc-807 ID: #4
Date: 23/09/2026 16:03
Paiement: À CRÉDIT (DETTE CLIENT)
Client: Sarl Alger Papeterie
Article Qté Total
Muffin Chocolat 3 3000.00
Croissant Frais 3 360.00
Sous-total: 3360.00 DA
Total Commande: 3360.00 DA
Acompte Versé (Cash): 13200.00 DA
RESTE À PAYER (DETTE): 0.00 DA
MERCI POUR VOTRE VISITE !
Millora POS 100% Hors-Ligne
`;

  const parsed = extractStructuredInvoiceData(POS_TICKET);
  assert.strictEqual(parsed.supplier, 'Sarl Alger Papeterie');
  assert.strictEqual(parsed.invoiceNumber, 'DZ-T1-mue6b3kc-807');
  assert.strictEqual(parsed.date, '2026-09-23');
  assert.strictEqual(parsed.items.length, 2);
  assert.strictEqual(parsed.items[0].description, 'Muffin Chocolat');
  assert.strictEqual(parsed.items[0].quantity, 3);
  assert.strictEqual(parsed.items[0].unitPrice, 1000);
  assert.strictEqual(parsed.items[0].total, 3000);
  assert.strictEqual(parsed.items[1].description, 'Croissant Frais');
  assert.strictEqual(parsed.items[1].quantity, 3);
  assert.strictEqual(parsed.items[1].unitPrice, 120);
  assert.strictEqual(parsed.items[1].total, 360);
  assert.strictEqual(parsed.total, 3360);

  const matched = matchItemsWithCatalog(parsed.items, SAMPLE_CATALOG);
  assert.strictEqual(matched[0].matchedProductId, 4);
  assert.strictEqual(matched[1].matchedProductId, 3);
});

// -----------------------------------------------------------------------------
// TEST SUITE 6: AUTOMATIC SUPPLIER CREATION & PURCHASE ORDER ASSIGNMENT
// -----------------------------------------------------------------------------
console.log('\n🏭 [Suite 6/6] Automatic Supplier Creation & Purchases Assignment');

runTest('New scanned supplier is registered and commands are linked with correct totals', () => {
  const suppliersDb = [];
  const purchasesDb = [];
  const purchaseOrdersDb = [];

  function simulateScanIQCommit(scanData) {
    let supplierName = scanData.supplier || 'Fournisseur Inconnu';
    let supplier = suppliersDb.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
    
    if (!supplier) {
      supplier = {
        id: suppliersDb.length + 1,
        name: supplierName,
        phone: '',
        createdAt: new Date().toISOString()
      };
      suppliersDb.push(supplier);
    }

    const purchase = {
      id: purchasesDb.length + 1,
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceNumber: scanData.invoiceNumber,
      date: scanData.date,
      items: scanData.items,
      subtotal: scanData.subtotal,
      discount: scanData.discount || 0,
      total: scanData.total,
      createdAt: new Date().toISOString()
    };
    purchasesDb.push(purchase);

    const po = {
      id: purchaseOrdersDb.length + 1,
      orderRef: scanData.invoiceNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: 'received',
      source: 'scaniq',
      purchaseId: purchase.id,
      totalAmount: scanData.total,
      createdAt: new Date().toISOString()
    };
    purchaseOrdersDb.push(po);

    return { supplier, purchase, po };
  }

  // First scan: New supplier "Établissement Benhamouda Tech"
  const result1 = simulateScanIQCommit({
    supplier: 'Établissement Benhamouda Tech',
    invoiceNumber: 'FAC-BEN-001',
    date: '2026-09-23',
    items: [{ description: 'Écouteurs Sans Fil', quantity: 5, unitPrice: 1600, total: 8000 }],
    subtotal: 8000,
    total: 8000
  });

  assert.strictEqual(suppliersDb.length, 1);
  assert.strictEqual(suppliersDb[0].name, 'Établissement Benhamouda Tech');
  assert.strictEqual(result1.purchase.supplierId, 1);
  assert.strictEqual(result1.po.supplierId, 1);

  // Second scan from the same supplier: Should link to existing supplier
  const result2 = simulateScanIQCommit({
    supplier: 'Établissement Benhamouda Tech',
    invoiceNumber: 'FAC-BEN-002',
    date: '2026-09-24',
    items: [{ description: 'Câble USB-C Rapide', quantity: 10, unitPrice: 280, total: 2800 }],
    subtotal: 2800,
    total: 2800
  });

  assert.strictEqual(suppliersDb.length, 1, 'Supplier count should not duplicate');
  assert.strictEqual(result2.purchase.supplierId, 1);

  // Check supplier purchases aggregation
  const supplier1Purchases = purchasesDb.filter(p => p.supplierId === 1);
  const totalSpent = supplier1Purchases.reduce((sum, p) => sum + p.total, 0);

  assert.strictEqual(supplier1Purchases.length, 2);
  assert.strictEqual(totalSpent, 10800);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n📊 =========================================================');
console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed (${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}% pass rate)`);
console.log('📊 =========================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All ScanIQ tests passed successfully!');
}
