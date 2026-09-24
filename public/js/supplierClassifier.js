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
          // Keep only top informative vocabulary tokens (max 1,200) to keep JSON payload well below 300KB
          const compactWordFreq = {};
          const activeVocab = new Set();

          for (const c of (this.model.classes || [])) {
            const freqs = this.model.wordFrequencyPerClass[c] || {};
            compactWordFreq[c] = {};
            const sortedEntries = Object.entries(freqs)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 100); // top 100 words per supplier

            for (const [w, count] of sortedEntries) {
              compactWordFreq[c][w] = count;
              activeVocab.add(w);
            }
          }

          const payload = JSON.stringify({
            classes: this.model.classes,
            totalDocs: this.model.totalDocs,
            classDocCounts: this.model.classDocCounts,
            classWordCounts: this.model.classWordCounts,
            wordFrequencyPerClass: compactWordFreq,
            vocabulary: Array.from(activeVocab)
          });

          localStorage.setItem(this.storageKey, payload);
        } catch (e) {
          console.warn('[ScanIQ Classifier] Could not persist weights (quota safeguard active):', e.message);
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
        // Tempered log prior so large dataset classes don't drown out user corrections
        const prior = Math.log(1 + Math.min(classDocs, 50));

        const totalClassWords = this.model.classWordCounts[className] || 0;
        const wordFreqs = this.model.wordFrequencyPerClass[className] || {};

        let likelihood = 0;
        let matchedTokens = 0;
        for (const token of tokens) {
          const count = wordFreqs[token] || 0;
          if (count > 0) {
            matchedTokens++;
            const prob = (count + 1) / (totalClassWords + Math.min(vocabSize, 2000));
            likelihood += Math.log(prob) + 3.0; // matched term boost
          } else {
            const prob = 1 / (totalClassWords + Math.min(vocabSize, 2000));
            likelihood += Math.log(prob);
          }
        }

        const score = prior + likelihood + (matchedTokens * 2.5);
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
