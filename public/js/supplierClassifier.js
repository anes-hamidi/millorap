/**
 * ScanIQ Client-Side & Node.js Compatible Supplier Classifier
 * Implements Naive Bayes + TF-IDF with incremental online learning from user corrections.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SupplierClassifier = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const STOPWORDS = new Set([
    'de', 'la', 'le', 'les', 'des', 'un', 'une', 'du', 'au', 'aux',
    'et', 'ou', 'en', 'pour', 'par', 'sur', 'dans', 'avec', 'sans',
    'est', 'sont', 'facture', 'bon', 'livraison', 'total', 'montant',
    'date', 'tel', 'adresse', 'algerie', 'alger', 'tva', 'ttc', 'ht',
    'rc', 'nif', 'nis', 'art', 'banque', 'rib', 'da', 'dzd', 'dz'
  ]);

  function tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2 && !STOPWORDS.has(token));
  }

  class SupplierClassifier {
    constructor(initialModel = null) {
      this.model = initialModel || {
        version: '1.0.0',
        classes: [],
        totalDocs: 0,
        vocabularySize: 0,
        classDocCounts: {},
        classWordCounts: {},
        wordFrequencyPerClass: {},
        vocabulary: []
      };
      this.vocabSet = new Set(this.model.vocabulary || []);
      this.storageKey = 'scaniq_classifier_weights';
      this.loadSavedWeights();
    }

    loadModel(modelJson) {
      if (!modelJson) return;
      this.model = modelJson;
      this.vocabSet = new Set(this.model.vocabulary || []);
      this.loadSavedWeights();
    }

    loadSavedWeights() {
      if (typeof localStorage !== 'undefined') {
        try {
          const saved = localStorage.getItem(this.storageKey);
          if (saved) {
            const data = JSON.parse(saved);
            this.mergeWeights(data);
          }
        } catch (e) {
          console.warn('[ScanIQ Classifier] Could not load stored weights:', e);
        }
      }
    }

    saveWeights() {
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(this.storageKey, JSON.stringify({
            classes: this.model.classes,
            totalDocs: this.model.totalDocs,
            classDocCounts: this.model.classDocCounts,
            classWordCounts: this.model.classWordCounts,
            wordFrequencyPerClass: this.model.wordFrequencyPerClass,
            vocabulary: Array.from(this.vocabSet)
          }));
        } catch (e) {
          console.warn('[ScanIQ Classifier] Could not persist weights:', e);
        }
      }
    }

    mergeWeights(data) {
      if (!data) return;
      if (Array.isArray(data.classes)) {
        this.model.classes = Array.from(new Set([...this.model.classes, ...data.classes]));
      }
      this.model.totalDocs = data.totalDocs || this.model.totalDocs;
      this.model.classDocCounts = { ...this.model.classDocCounts, ...(data.classDocCounts || {}) };
      this.model.classWordCounts = { ...this.model.classWordCounts, ...(data.classWordCounts || {}) };
      this.model.wordFrequencyPerClass = { ...this.model.wordFrequencyPerClass, ...(data.wordFrequencyPerClass || {}) };
      if (Array.isArray(data.vocabulary)) {
        data.vocabulary.forEach(v => this.vocabSet.add(v));
      }
      this.model.vocabulary = Array.from(this.vocabSet);
      this.model.vocabularySize = this.vocabSet.size;
    }

    predict(text) {
      const tokens = tokenize(text);
      if (!tokens.length || !this.model.classes || !this.model.classes.length) {
        return {
          supplier: null,
          confidence: 0,
          scores: {}
        };
      }

      const numClasses = this.model.classes.length;
      const vocabSize = Math.max(1, this.vocabSet.size);
      const totalDocs = Math.max(1, this.model.totalDocs || 1);

      const logScores = {};
      let maxLogScore = -Infinity;

      for (const className of this.model.classes) {
        const classDocs = this.model.classDocCounts[className] || 1;
        const prior = Math.log(classDocs / totalDocs);

        const totalClassWords = this.model.classWordCounts[className] || 0;
        const wordFreqs = this.model.wordFrequencyPerClass[className] || {};

        let likelihood = 0;
        for (const token of tokens) {
          const count = wordFreqs[token] || 0;
          // Laplace Add-1 smoothing
          const prob = (count + 1) / (totalClassWords + vocabSize);
          likelihood += Math.log(prob);
        }

        const score = prior + likelihood;
        logScores[className] = score;
        if (score > maxLogScore) {
          maxLogScore = score;
        }
      }

      // Softmax normalization for calibrated probability
      let expSum = 0;
      const probabilities = {};
      for (const className of this.model.classes) {
        const exp = Math.exp(logScores[className] - maxLogScore);
        probabilities[className] = exp;
        expSum += exp;
      }

      let bestSupplier = null;
      let highestProb = 0;

      for (const className of this.model.classes) {
        probabilities[className] = probabilities[className] / (expSum || 1);
        if (probabilities[className] > highestProb) {
          highestProb = probabilities[className];
          bestSupplier = className;
        }
      }

      return {
        supplier: bestSupplier,
        confidence: Math.round(highestProb * 100),
        scores: probabilities
      };
    }

    incrementalTrain(supplierName, text) {
      if (!supplierName || !text) return;
      const cleanName = supplierName.trim();
      const tokens = tokenize(text);
      if (!tokens.length) return;

      if (!this.model.classes.includes(cleanName)) {
        this.model.classes.push(cleanName);
      }

      this.model.totalDocs = (this.model.totalDocs || 0) + 1;
      this.model.classDocCounts[cleanName] = (this.model.classDocCounts[cleanName] || 0) + 1;
      this.model.classWordCounts[cleanName] = this.model.classWordCounts[cleanName] || 0;
      this.model.wordFrequencyPerClass[cleanName] = this.model.wordFrequencyPerClass[cleanName] || {};

      for (const token of tokens) {
        this.vocabSet.add(token);
        this.model.classWordCounts[cleanName]++;
        this.model.wordFrequencyPerClass[cleanName][token] = (this.model.wordFrequencyPerClass[cleanName][token] || 0) + 1;
      }

      this.model.vocabulary = Array.from(this.vocabSet);
      this.model.vocabularySize = this.vocabSet.size;

      this.saveWeights();
      return {
        success: true,
        supplier: cleanName,
        vocabSize: this.model.vocabularySize,
        totalDocs: this.model.totalDocs
      };
    }

    resetLearnedWeights() {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.storageKey);
      }
    }
  }

  return {
    SupplierClassifier,
    tokenize,
    STOPWORDS
  };
}));
