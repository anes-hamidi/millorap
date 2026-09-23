/**
 * ScanIQ Offline Supplier Classifier Training Script
 * Generates a pre-trained Naive Bayes / TF-IDF model JSON from Millora's seed data & historical documents.
 */

const fs = require('fs');
const path = require('path');

// Tokenizer & text normalizer
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2 && !STOPWORDS.has(token));
}

const STOPWORDS = new Set([
  'de', 'la', 'le', 'les', 'des', 'un', 'une', 'du', 'au', 'aux',
  'et', 'ou', 'en', 'pour', 'par', 'sur', 'dans', 'avec', 'sans',
  'est', 'sont', 'facture', 'bon', 'livraison', 'total', 'montant',
  'date', 'tel', 'adresse', 'algerie', 'alger', 'tva', 'ttc', 'ht',
  'rc', 'nif', 'nis', 'art', 'banque', 'rib', 'da', 'dzd', 'dz'
]);

// Initial seed training dataset derived from Millora's suppliers and inventory categories
const SEED_TRAINING_DATA = [
  // 1. Sarl Alger Papeterie
  {
    supplier: 'Sarl Alger Papeterie',
    documents: [
      'Sarl Alger Papeterie fournitures de bureau rouleaux papier thermique bobines ramette papier A4 classeurs stylos feutres archivage impression toner cartouche papier photo',
      'Papeterie Alger gros demi-gros rouleaux papier caisse thermique pack 5 rouleaux papier thermique fournitures scolaires papeterie moderne Bab Ezzouar',
      'Facture Papeterie Alger Tirage photo A4 Impression document couleur papier blanc 80g papier cartonné reliure plastification chemises dossiers',
      'Fournisseur Alger Papeterie Sarl articles de papeterie consommables caisse enregistreuse rouleaux thermique 80x80 bobines flexy'
    ]
  },
  // 2. Grossiste Boissons & Confiserie
  {
    supplier: 'Grossiste Boissons & Confiserie',
    documents: [
      'Grossiste Boissons & Confiserie café espresso thé vert naturel grains arabica robusta sucre dosettes café moulu boite café espresso 1kg',
      'Boissons Confiserie Alimentation générale Croissant Frais Muffin Chocolat viennoiseries pâtisserie gâteaux jus de fruits canettes sodas eau minérale',
      'Distribution Boissons Confiserie gros Café Espresso Thé Vert Croissants Frais Muffin Chocolat pack 6 muffins confitures sirops snacks',
      'Grossiste Confiserie Boissons Kouba Alger café moulu espresso thé vert menthe viennoiserie fraîcheur livraison matin'
    ]
  },
  // 3. Distributeur Tech & Accessoires
  {
    supplier: 'Distributeur Tech & Accessoires',
    documents: [
      'Distributeur Tech & Accessoires électronique écouteurs sans fil bluetooth câble USB-C rapide chargeur secteur 20W adaptateur audio connectique',
      'Tech Distributeur Algérie matériel informatique Ecouteurs Sans Fil TWS Câble Type-C powerbank batterie externe support téléphone écouteurs intra-auriculaires',
      'Grossiste Accessoires Téléphonie et Tech Câble USB-C Rapide Écouteurs Bluetooth chargeur rapide quick charge hub USB verre trempé coques',
      'Distributeur Tech Informatique Alger écouteurs sans fil étui câble usb type c chargeur ultra rapide câbles usb lightning'
    ]
  }
];

class NaiveBayesTrainer {
  constructor() {
    this.classes = new Set();
    this.classDocCounts = {};
    this.classWordCounts = {};
    this.wordFrequencyPerClass = {};
    this.vocabulary = new Set();
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
        const tokens = tokenize(doc);
        for (const token of tokens) {
          this.vocabulary.add(token);
          this.classWordCounts[className]++;
          this.wordFrequencyPerClass[className][token] = (this.wordFrequencyPerClass[className][token] || 0) + 1;
        }
      }
    }
  }

  exportModel() {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      classes: Array.from(this.classes),
      totalDocs: this.totalDocs,
      vocabularySize: this.vocabulary.size,
      classDocCounts: this.classDocCounts,
      classWordCounts: this.classWordCounts,
      wordFrequencyPerClass: this.wordFrequencyPerClass,
      vocabulary: Array.from(this.vocabulary)
    };
  }
}

function runTraining() {
  console.log('🤖 ScanIQ: Starting Offline Supplier Classifier Training...');
  const trainer = new NaiveBayesTrainer();
  trainer.train(SEED_TRAINING_DATA);
  const model = trainer.exportModel();

  const outputDir = path.join(__dirname, '..', 'public', 'js', 'models');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'supplier_classifier_model.json');
  fs.writeFileSync(outputPath, JSON.stringify(model, null, 2), 'utf8');

  console.log(`✅ Model successfully generated at: ${outputPath}`);
  console.log(`📊 Statistics: ${model.classes.length} classes, ${model.totalDocs} seed docs, ${model.vocabularySize} vocabulary tokens.`);
}

if (require.main === module) {
  runTraining();
}

module.exports = {
  tokenize,
  SEED_TRAINING_DATA,
  NaiveBayesTrainer,
  runTraining
};
