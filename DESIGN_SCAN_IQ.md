# ScanIQ — Intelligent Offline Invoice Scanner for Millora
## Architectural Design & Technical Specification

### 1. Executive Summary
**ScanIQ** is a zero-cloud, 100% offline-first document intelligence and invoice scanning module integrated directly into **Millora** (Node.js + Express + Dexie.js / IndexedDB). 

The system automates supplier invoice capture and inventory replenishment:
1. Captures invoice documents (PDFs or camera/image uploads).
2. Extracts supplier information, invoice metadata, line items (description, quantity, unit price), subtotal, VAT, and totals.
3. Classifies suppliers using a local Machine Learning model (Naive Bayes + TF-IDF) and fuzzy-matches line items against Millora's live product catalog.
4. Provides an interactive "Validate Received Order" review modal featuring animated field population and color-coded confidence indicators (Scaneye style).
5. Adapts and trains locally from human corrections, ensuring that accuracy improves over time without any byte leaving the device.

---

### 2. Architectural Patterns & External Influences

ScanIQ derives its architectural foundation from two battle-tested open-source document intelligence projects:

#### A. Stirling-PDF (`https://github.com/Stirling-Tools/stirling-pdf`)
- **Core Pattern Borrowed**: *Discrete, Single-Responsibility Localhost REST Pipeline*.
- **Application in ScanIQ**:
  - Instead of an opaque monolithic processing blob, ScanIQ decomposes invoice ingestion into modular, testable HTTP endpoints bound strictly to `127.0.0.1`:
    - `POST /api/scan/preprocess`: Image contrast correction, deskew calculation, and thresholding.
    - `POST /api/scan/ocr`: Local optical character recognition wrapper.
    - `POST /api/scan/extract`: Template and heuristic rule extraction.
    - `POST /api/scan/match`: Live catalog fuzzy matching and confidence score attribution.
    - `GET /api/scan/health`: Pipeline diagnostic and offline readiness check.
  - This guarantees easy testing, isolated failure recovery, and zero external network calls.

#### B. Paperless-ngx (`https://github.com/paperless-ngx/paperless-ngx`)
- **Core Pattern Borrowed**: *Tiered Extraction (Templates → Heuristics) + Human-in-the-Loop Local ML Classifier + Retraining Loop*.
- **Application in ScanIQ**:
  - **Tier 1 (Supplier Template)**: If a supplier regex/positional template exists in IndexedDB (`supplierTemplates`), it runs first for high-precision parsing.
  - **Tier 2 (Generic Heuristic Parser)**: Fallback parser engineered to understand Algerian, French, and international invoice structures (Facture N°, Date, Montant HT, TVA 19%/9%, Net à Payer, table column layouts).
  - **Tier 3 (Local Classifier)**: Naive Bayes text classifier pre-trained on historical catalog items and seed invoices.
  - **Tier 4 (Correction Logging & Retraining)**: Edits made by the user before confirmation are logged to the `corrections` store and immediately update the local model weights in browser/worker memory and localStorage.

---

### 3. Pipeline Breakdown

```
 [Invoice PDF / Photo]
          │
          ▼
 1. Capture & PDF Detection ── (Digital text layer found?) ──► [Skip OCR, Direct Text]
          │ (Scanned / Image)                                       │
          ▼                                                         │
 2. Preprocess (Binarize/Contrast)                                  │
          │                                                         │
          ▼                                                         │
 3. Local OCR Engine ───────────────────────────────────────────────┤
                                                                    │
                                                                    ▼
                                                         4. Structured Extraction
                                                            (Templates + Heuristics)
                                                                    │
                                                                    ▼
                                                         5. Supplier Recognition
                                                            (Local Naive Bayes / TF-IDF)
                                                                    │
                                                                    ▼
                                                         6. Product Catalog Match
                                                            (Fuzzy Token / Levenshtein)
                                                                    │
                                                                    ▼
                                                         7. Scaneye Validation UI
                                                            (Animated Populating & Confidence)
                                                                    │
                                                    ┌───────────────┴───────────────┐
                                          [User Modifies Field]              [User Confirms]
                                                    │                               │
                                                    ▼                               ▼
                                            8. Log Correction               9. Atomic Commit
                                           (Retrain Local ML)            (Purchases + RESTOCK Logs)
```

---

### 4. Confidence Scoring & Color Coded UX
Every auto-filled line item receives a calculated match score:
- 🟢 **High Confidence (80% - 100%)**: Exact barcode or strong catalog name match. Ready for instant acceptance.
- 🟡 **Fuzzy Match (50% - 79%)**: Substring or phonetic match. Highlighted with an amber badge for a quick user glance.
- 🔴 **Unmatched / New Product (< 50%)**: No catalog counterpart found. Automatically flagged with a 1-click **"Create New Product"** action or dropdown selector.

---

### 5. Privacy & Zero-Cloud Guarantee
- Zero external API keys required.
- No network requests sent across WAN.
- All training weights, models, and audit logs stay safely within local IndexedDB and server filesystem.
