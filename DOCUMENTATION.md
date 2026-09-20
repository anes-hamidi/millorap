# Millora Business Suite — Technical Documentation & Architecture Manual

**Project Name:** Millora (also referenced as FlexiPOS / QR Code Generator)  
**Version:** 1.0.0 (IndexedDB Schema `FlexiPOS_DB_v3`)  
**Target Market & Audience:** Small retail businesses, cybercafés, convenience stores, and commercial print shops in Algeria.  
**Offline/Local Architecture:** 100% Client-Side Primary Storage (IndexedDB via Dexie.js) + Lightweight Node.js/Express Local Edge Companion.

---

## 1. Overview

**Millora** is an offline-first, all-in-one business desktop/PWA suite specifically engineered for print shops, cybercafés, and local retail stores in Algeria. It merges a high-speed Point of Sale (POS) cashier terminal, customer debt/credit tracking, an educational document print explorer (optimized for 44,000+ national DZExams school tests), a multi-file PDF merge tool, a mobile-to-PC local file dropzone, an Algerian electronic payment portal (supporting CIB, Edahabia, and BaridiMob), and a 9-format custom QR Code generator into a single unified web application.

### Core Value Propositions
- **Zero Cloud Lock-in / 100% Offline Capability:** All business records (catalog, transactions, debt ledgers, stock logs) reside in the browser's IndexedDB. Core cashiering, search, and QR generation work with zero internet connection.
- **Hardware Integration for Retail:** Out-of-the-box keyboard-wedge hardware barcode gun listening, camera-based barcode scanning, and direct operating system thermal/desktop printing via `pdf-to-printer` and Windows CIM/PowerShell fallback.
- **Integrated Algerian Payment & File Workflow:** Real-time mobile payment bridge (generating BaridiMob QR / RIP and SATIM/CIB cards) and QR-triggered P2P mobile-to-PC file upload allowing customers to send print jobs directly from their phone to the cashier PC.
- **High-Performance Document Explorer:** Built-in lazy folder tree browser and PDF viewer capable of searching and printing from local repositories containing over 44,000 documents.

---

## 2. Architecture & High-Level System Design

Millora operates on a **Hybrid Local-First Architecture**. The frontend is a single-page Progressive Web App (PWA) handling all business logic and state persistence inside the browser, while the backend Node.js Express server acts as a local hardware/filesystem gateway, tunnel coordinator, and mobile bridge.

```
+---------------------------------------------------------------------------------------+
|                                    CLIENT BROWSER (PWA)                               |
|                                                                                       |
|  +-------------------+  +-------------------+  +-------------------+  +------------+  |
|  |   POS & Checkout  |  |  Inventory & Debt |  | PDF Print & Merge |  | QR Studio  |  |
|  +-------------------+  +-------------------+  +-------------------+  +------------+  |
|            |                      |                      |                  |         |
|            +----------------------+----------------------+------------------+         |
|                                   |                                                   |
|                +------------------------------------+                                 |
|                |  Dexie.js IndexedDB Engine (Local) |                                 |
|                |  - products      - sales           |                                 |
|                |  - saleItems     - stockLogs       |                                 |
|                |  - customers     - debts           |                                 |
|                |  - debtPayments  - categories      |                                 |
|                +------------------------------------+                                 |
+---------------------------------------------------------------------------------------+
           |                                                      ^
           | REST / JSON APIs                                     | Static Assets & Poll
           v                                                      |
+---------------------------------------------------------------------------------------+
|                             LOCAL NODE.JS / EXPRESS SERVER                            |
|                                                                                       |
|  +-------------------+  +-------------------+  +-------------------+  +------------+  |
|  |   /routes/pos     |  |   /routes/files   |  | /routes/transfer  |  | /routes/pay|  |
|  | - Products seed   |  | - Tree scan       |  | - Multer upload   |  | - Polling  |  |
|  | - Sales backup    |  | - pdf-to-printer  |  | - P2P file queue  |  | - BM/SATIM |  |
|  | - LAN IP & Port   |  | - pdf-lib merge   |  | - DropZone sync   |  | - Receipts |  |
|  +-------------------+  +-------------------+  +-------------------+  +------------+  |
|           |                       |                      |                   |        |
|           v                       v                      v                   v        |
|    [data/*.json]         [dzexams_downloaded]        [uploads/]         [In-Memory]   |
+---------------------------------------------------------------------------------------+
           ^                                                      ^
           |                                                      |
           +-------------------- [ngrok / LAN IP] ---------------+
                                    |
                    +-------------------------------+
                    |     CUSTOMER SMARTPHONE       |
                    |  - /pay (BaridiMob / SATIM)   |
                    |  - /transfer (DropZone Upload)|
                    +-------------------------------+
```

### Main Components & Interaction
1. **Frontend Presentation & Router Layer (`app.js`, `index.html`, `styles.css`):** Coordinates 9 workspaces (`pos`, `inventory`, `analytics`, `debts`, `print`, `merge`, `transfer`, `qr`, `settings`), handles theme switching (Dark/Light), keyboard shortcuts (`F1`–`F4`), and UI modals.
2. **Local Persistence Engine (`db.js`, `checkoutService.js`, `debtService.js`, `analyticsService.js`, `backupService.js`):** Built on IndexedDB using Dexie.js v4. Executes ACID atomic transactions on sales, manages stock deductions, customer debt ledgers, and aggregations directly on the client machine.
3. **Filesystem & Print Companion (`routes/files.js`):** Interacts with the host OS filesystem (`DOCS_DIR` and `uploads/`), performs path-traversal-safe directory reads, drives physical printers using `pdf-to-printer` or PowerShell WMI/CIM fallback, and merges PDFs using `pdf-lib`.
4. **Mobile File Transfer Subsystem (`routes/transfer.js`, `views/transfer.html`):** Provides a mobile-optimized web portal accessible over Wi-Fi or ngrok tunnel where customers upload documents directly into the cashier's `uploads/` folder.
5. **Mobile Payment Bridge (`routes/pay.js`, `views/pay.html`):** Renders dynamic checkout payment pages with BaridiMob RIP copy/QR generation and SATIM CIB/Edahabia simulated gateway, polled asynchronously by the POS terminal.
6. **Web Scraper & Dataset Manager (`download_all_dzexams.py`, `py/organize_dz_exams.py`):** Asynchronous Python scripts leveraging `aiohttp` to download and classify primary, middle, and secondary Algerian school exams into a structured hierarchy.

---

## 3. Tech Stack

### Frontend
- **HTML5 & CSS3:** Responsive UI with Glassmorphism styling and custom Tailwind utility themes.
- **Tailwind CSS:** CDN-based modern utility engine (`cdn.tailwindcss.com`).
- **Dexie.js (`v4.4.6`):** High-level client-side IndexedDB wrapper.
- **Dexie Cloud Addon (`v4.4.15`):** Bundled for optional future replication.
- **pdf-lib (`v1.17.1`):** Client and server-side PDF manipulation and page merging.
- **qr-code-styling (`v1.5.0`):** Canvas/SVG client-side QR rendering with dot patterns, corner styles, and center logos.
- **RxJS (`rxjs.umd.min.js`):** Reactive stream handling.
- **Service Worker (`sw.js`):** PWA offline network-first asset caching.

### Backend & Host Utilities
- **Runtime:** Node.js (v18+ recommended, ES2022 / CommonJS).
- **Web Framework:** Express.js (`v5.2.1`).
- **File Uploads:** Multer (`v2.3.0`) with disk storage and collision-safe UTF-8 filename normalization.
- **Direct Printing:** `pdf-to-printer` (`v5.8.1`) with native Windows print spooler and PowerShell CIM fallback.
- **Tunneling:** ngrok binary for exposing mobile payment and transfer endpoints outside local Wi-Fi.

### Python Tooling & Offline Data Processing
- **Python 3.10+:** Asynchronous web scraping (`aiohttp`, `asyncio`).
- **Data Structuring:** Regex, `csv`, `os`, and `urllib`.

---

## 4. Installation & Setup

### Prerequisites
- **Node.js:** v18.0.0 or higher.
- **Operating System:** Windows 10/11 (fully supported for hardware printing and PowerShell integration), Linux, or macOS.
- **Optional:** Python 3.10+ (for running DZExams dataset downloaders).

### Step-by-Step Installation

1. **Clone or Download the Repository:**
   ```bash
   git clone <repository_url>
   cd qrcodegenerator
   ```

2. **Install Node Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env` or customize existing variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```ini
   PORT=3000
   DOCS_DIR=C:/Users/fethi/dzexams_downloaded_pdfs
   NGROK_TOKEN=your_optional_ngrok_auth_token
   NGROK_DOMAIN=your_custom_subdomain.ngrok-free.dev
   PUBLIC_URL=https://your_custom_subdomain.ngrok-free.dev
   ```

4. **Run the Application:**
   - **On Windows (Automated Launcher):** Double-click `Install_and_Start.bat` (runs setup and launches server) or `start.bat` (configures ngrok tunnel and starts Node server).
   - **Manual Start (Any OS):**
     ```bash
     npm start
     ```

5. **Access Application:**
   - **Local POS & Cashier Station:** `http://localhost:3000`
   - **Mobile Payment Gateway:** `http://<YOUR_LAN_IP>:3000/pay` or `https://<NGROK_DOMAIN>/pay`
   - **Mobile File Transfer Portal:** `http://<YOUR_LAN_IP>:3000/transfer` or `https://<NGROK_DOMAIN>/transfer`

---

## 5. Key Features

### 🛒 Point of Sale (POS) Cashier Terminal
- **Access:** Default workspace (`F1` or sidebar *POS Cashier*).
- **Product Catalog & Quick Filter:** Real-time category pills, search bar with 120ms debounce matching names and barcodes.
- **Live Cart & Discounter:** Add/decrement quantities, delete line items, apply 0–100% order-wide discounts.
- **Payment Methods:** Cash (`Espèces`), Bank Card (`CIB / Edahabia`), Mobile QR (`BaridiMob`), and Customer Credit (`Dette / À Crédit`).
- **Hardware & Camera Scanner:** Keyboard wedge support with configurable keystroke timing threshold (ms), minimum length, suffix termination, audio feedback via Web Audio API, and webcam barcode scanner.
- **Thermal Receipt Layout:** French/Arabic receipt generator formatted for 80mm/58mm thermal printers with store header, itemized breakdown, discounts, totals, and barcode reference.

### 📦 Inventory & Stock Management
- **Access:** Sidebar *Inventory & Stock* (`F2`).
- **Product CRUD:** Add, edit, and delete products with name, category, cost price, selling price, stock quantity, low-stock threshold, barcode, and icons.
- **Margin Calculator:** Automatic real-time markup and profit margin preview during product creation.
- **Stock Movements:** Every sale and manual restock generates an immutable audit record in `stockLogs`.

### 🏦 Customer Credit & Debt Ledger
- **Access:** Sidebar *Customer Debts* (`debts`).
- **Customer Profiles:** Track customer name, phone number, debt credit limits, and notes.
- **On-Credit Sales:** Checkout directly records open debts linked to the sale reference.
- **Repayments & Partial Payments:** Support for full or partial debt settlements with balance tracking and printable payment receipts.
- **Sleep Mode Indicator:** Visual alerts for dormant accounts with outstanding balances.

### 📊 Sales Intelligence & Analytics
- **Access:** Sidebar *Sales & Analytics* (`F3`).
- **Metrics:** Gross Revenue, Net Profit, Profit Margin %, Average Basket Value, Total Units Sold.
- **Filters:** Today, Last 7 Days, Last 30 Days, All Time.
- **Rankings:** Top selling products by volume and revenue; low stock alert queue sorted by severity.

### 🖨️ Document & Exam Print Hub
- **Access:** Sidebar *Print Hub* (`F4`).
- **Tree Explorer:** Non-blocking shallow directory browser mapped to `DOCS_DIR` (44,000+ DZExams papers).
- **Previewer & Fullscreen Viewer:** High-definition embedded PDF reader with fullscreen mode (`Esc` to exit) and new tab popup.
- **Direct Spool Printing:** Send jobs directly to connected Windows printers without launching browser print dialogs via `pdf-to-printer` API.

### ✨ PDF Multi-File Merge Studio
- **Access:** Sidebar *PDF Merge Studio* (`merge`).
- **Multi-File Selection:** Select multiple exam subjects, answer sheets, or uploaded customer documents.
- **Actions:** Combine pages into a single PDF, save to disk, view in previewer, or trigger immediate download.

### 📲 Mobile-to-PC File Reception DropZone
- **Access:** Sidebar *Mobile File Drop* (`transfer`).
- **P2P Mobile Drop:** Displays a dynamic QR code encoding the local LAN/ngrok upload URL.
- **Customer Upload Portal:** Clean, mobile-first interface allowing customers to upload up to 250 MB of files directly from their phone.
- **Auto-Sync:** POS station polls upload session and auto-detects new files, placing them into `uploads/` and surfacing them for instant printing or merging.

### 📱 QR Code Design Studio
- **Access:** Sidebar *QR Code Studio* (`qr`).
- **9 Supported Types:** URL, Plain Text, Wi-Fi (WPA/WEP/Open with hidden SSID), vCard 3.0, Email (mailto), SMS / Phone, Base64 File Encapsulation (<200 KB), Social Links (WhatsApp, YouTube, GitHub, etc.), and Crypto/Payment (Bitcoin, ETH, PayPal, UPI).
- **Custom Styling:** Dot styles (Square, Dots, Rounded, Classy Diamond), corner styles, linear/radial gradients, custom color palettes, and center logo embedding.
- **Exports:** High-res PNG, vector SVG, compressed WEBP, copy-to-clipboard, and printable QR cards.

### ⚙️ Backup & Data Safety
- **Access:** Sidebar *Settings & Data Safety* (`settings`).
- **Full Database Snapshot:** One-click JSON backup export and atomic database restore across all 8 tables.
- **Spreadsheet Exports:** Export Inventory, Sales Register, Debts, and Debt Payments to UTF-8 BOM CSV files compatible with Microsoft Excel.
- **Automated Backup Reminder:** Proactive banner prompt if no backup has occurred in 7+ days.

---

## 6. How It Works (Internal Logic & Data Flow)

### 1. Atomic Checkout Pipeline (`checkoutService.js`)
When a sale is processed:
1. `CheckoutService.processCheckout()` begins an atomic Read-Write transaction across `products`, `sales`, `saleItems`, and `stockLogs`.
2. Validates cart items against fresh IndexedDB inventory records (ensuring available stock $\ge$ requested quantity).
3. Computes line totals, costs, proportional order discounts, and net profit:
   $$\text{Subtotal} = \sum (\text{sellingPrice} \times \text{qty})$$
   $$\text{Total Cost} = \sum (\text{costPrice} \times \text{qty})$$
   $$\text{Discount Amount} = \text{Subtotal} \times \left(\frac{\text{discountPercent}}{100}\right)$$
   $$\text{Total Amount} = \text{Subtotal} - \text{Discount Amount}$$
   $$\text{Net Profit} = \text{Total Amount} - \text{Total Cost}$$
4. Updates `products.currentStock = previousStock - qty`.
5. Logs each movement to `stockLogs` with reference type `SALE`.
6. Creates the master record in `sales` and individual item snapshots in `saleItems`.

### 2. Hardware Barcode Scanner Keyboard Wedge (`pos.js`)
- Standard USB/Bluetooth barcode guns act as physical keyboards sending keystrokes rapidly followed by `Enter` or `Tab`.
- `pos.js` captures global `keydown` events. If keystrokes arrive with an interval $\le \text{thresholdMs}$ (default: 50ms), characters accumulate in `scanBuffer`.
- Upon receiving the suffix (`Enter`), `scanBuffer` is evaluated. If length $\ge \text{minLen}$, the system performs an $O(1)$ lookup against `barcodeMap`.
- If found, it plays a Web Audio API confirmation tone and increments cart quantity; if not found, it prompts the cashier to register a new product with that barcode.

### 3. Mobile Payment Polling Bridge (`routes/pay.js`, `views/pay.html`, `pos.js`)
1. POS terminal displays a QR code containing `http://<IP>:3000/pay?amount=<AMOUNT>&order=<ORDER_ID>&store=<STORE>`.
2. Customer scans QR and selects **BaridiMob** (shows RIP code and instructions) or **CIB/Edahabia** (inputs card details).
3. When customer taps "Valider le Paiement", the mobile browser POSTs to `/api/pay/process`.
4. POS terminal runs a periodic background poll to `/api/pay/status/:orderId`. Once confirmed, the POS UI automatically triggers checkout completion and prints the receipt.

### 4. File Explorer & Path Traversal Prevention (`routes/files.js`)
- When listing directories or serving files, `getSafePath(relativePath)` sanitizes input by stripping relative path traversal tokens (`..`) and ensuring the absolute resolved path strictly begins with `EFFECTIVE_DOCS_DIR` or `UPLOADS_DIR`. Any violation throws an `Access denied` error.
- Directory scanning uses shallow `readdirSync` with `{ withFileTypes: true }` to maintain instant UI response even on folders containing tens of thousands of items.

---

## 7. API Reference

### File & Print Services (`routes/files.js`)

#### `GET /api/files`
Fetches items within a specific directory level.
- **Query Parameters:** `path` (string, optional) — relative subpath.
- **Response:**
  ```json
  {
    "success": true,
    "docsDir": "C:/Users/fethi/dzexams_downloaded_pdfs",
    "path": "1as/math",
    "items": [
      { "name": "trimestre_1", "type": "folder", "path": "1as/math/trimestre_1", "itemCount": 12 },
      { "name": "devoir_1.pdf", "type": "file", "isPdf": true, "path": "1as/math/devoir_1.pdf", "sizeMB": "1.45", "modified": "2026-09-20T10:00:00.000Z" }
    ]
  }
  ```

#### `GET /api/files/search`
Searches documents matching a query (depth $\le 5$, results capped at 50).
- **Query Parameters:** `q` (string, required) — search query.

#### `GET /api/view`
Streams a PDF or document for inline browser preview.
- **Query Parameters:** `file` (string, required) — relative path.

#### `GET /api/files/download` (or `/api/download`)
Forces file download with attachment disposition.
- **Query Parameters:** `path` (string, required).

#### `GET /api/printers`
Returns a list of installed OS printers via `pdf-to-printer` or Windows CIM command.
- **Response:**
  ```json
  { "success": true, "printers": ["POS-80-Thermal", "HP-LaserJet-Pro"] }
  ```

#### `POST /api/print`
Sends a silent print job to a physical printer.
- **Body:** `{ "filePath": "uploads/exam.pdf", "copies": 1, "printer": "POS-80-Thermal" }`

#### `POST /api/merge`
Merges multiple PDF files into a single document using `pdf-lib`.
- **Body:**
  ```json
  {
    "files": ["1as/math/exam1.pdf", "1as/math/corrigee1.pdf"],
    "saveName": "Math_Exam_Complete.pdf",
    "targetFolder": "uploads",
    "action": "save"
  }
  ```

---

### Mobile File Transfer (`routes/transfer.js`)

#### `GET /transfer`
Renders the customer-facing mobile upload HTML interface.
- **Query Parameters:** `session` (string), `store` (string).

#### `POST /api/transfer/upload`
Accepts `multipart/form-data` uploads (up to 250 MB per file) and saves them into the `uploads/` folder.
- **Fields:** `files` (File[]), `sessionId` (string).

#### `GET /api/transfer/status/:sessionId`
Polled by cashier station to detect newly uploaded files for a session.

#### `GET /api/transfer/files`
Lists all files currently stored in `uploads/` with size, MIME type, and preview URLs.

#### `DELETE /api/transfer/files/:filename`
Deletes an uploaded file from disk.

#### `POST /api/transfer/clear`
Clears all files in the `uploads/` directory.

---

### Mobile Payment Gateway (`routes/pay.js`)

#### `GET /pay`
Renders the customer-facing payment portal for BaridiMob and SATIM cards.
- **Query Parameters:** `amount` (number), `order` (string), `store` (string).

#### `POST /api/pay/process`
Records a simulated or verified payment confirmation from the mobile client.
- **Body:** `{ "orderId": "DZ-123456", "amount": 450, "method": "BaridiMob", "cardLast4": "1234" }`

#### `GET /api/pay/status/:orderId`
Polled by POS cashier to auto-confirm checkout status.

---

### POS Server Companion (`routes/pos.js`)

#### `GET /api/pos/products`
Returns backend product seed catalog (used as fallback when client IndexedDB is uninitialized).

#### `POST /api/pos/checkout`
Fallback endpoint for logging sales transactions and generating server-rendered HTML thermal receipts.

#### `GET /api/pos/history`
Returns server-side sales history log (`data/sales_history.json`).

#### `GET /api/lan-ip` (or `/api/pos/info`)
Discovers the host PC's primary LAN IPv4 address and active public tunnel URL.

---

## 8. Data Model & Database Schema

All primary data is stored locally in the browser's IndexedDB database named `FlexiPOS_DB_v3`.

```
                  +--------------------------------+
                  |           categories           |
                  +--------------------------------+
                  | id (PK, auto)                  |
                  | name (Unique)                  |
                  | icon                           |
                  +--------------------------------+
                                  |
                                  v
+------------------+     +--------------------------------+     +------------------+
|    customers     |     |            products            |     |    stockLogs     |
+------------------+     +--------------------------------+     +------------------+
| id (PK, auto)    |     | id (PK, auto)                  |     | id (PK, auto)    |
| name             |     | barcode (Unique)               |     | productId (FK) --+
| phone            |     | name                           |     | timestamp        |
| debtLimit        |     | category                       |     | type (SALE/REST) |
| status           |     | costPrice                      |     | quantityChange   |
+------------------+     | sellingPrice                   |     | previousStock    |
         |               | currentStock                   |     | newStock         |
         |               | lowStockThreshold              |     +------------------+
         |               +--------------------------------+
         |                                |
         | 1:N                            | 1:N
         v                                v
+------------------+            +-------------------+
|      debts       |            |     saleItems     |
+------------------+            +-------------------+
| id (PK, auto)    |            | id (PK, auto)     |
| customerId (FK)  |            | saleId (FK) <-----+-------+
| saleId (FK) <----+-----+      | productId (FK)    |       |
| amount           |     |      | quantity          |       |
| remainingAmount  |     |      | unitCostPrice     |       |
| status           |     |      | unitSellingPrice  |       |
+------------------+     |      | lineProfit        |       |
         |               |      +-------------------+       |
         | 1:N           |                                  |
         v               |      +-------------------+       |
+------------------+     |      |       sales       |       |
|   debtPayments   |     |      +-------------------+       |
+------------------+     |      | id (PK, auto)     |       |
| id (PK, auto)    |     +----> | orderRef (Unique) |-------+
| debtId (FK)      |            | timestamp         |
| amount           |            | paymentMethod     |
| paidAt           |            | subtotal          |
| paymentMethod    |            | totalAmount       |
+------------------+            | netProfit         |
                                +-------------------+
```

### Table Definitions & Indices

1. **`products`**
   - *Index Definition:* `++id, &barcode, name, category, currentStock, lowStockThreshold, costPrice, sellingPrice`
   - *Fields:* `id` (int), `barcode` (string, unique), `name` (string), `category` (string), `costPrice` (number), `sellingPrice` (number), `currentStock` (number), `lowStockThreshold` (number), `icon` (string), `image` (string), `createdAt` (ISO date).

2. **`sales`**
   - *Index Definition:* `++id, &orderRef, timestamp, paymentMethod, totalAmount, netProfit`
   - *Fields:* `id` (int), `orderRef` (string, unique), `timestamp` (ISO date), `paymentMethod` (cash/card/qr/debt), `subtotal` (number), `discountAmount` (number), `discountPercent` (number), `totalAmount` (number), `totalCost` (number), `netProfit` (number), `itemCount` (int), `items` (Array of snapshots).

3. **`saleItems`**
   - *Index Definition:* `++id, saleId, productId`
   - *Fields:* `id` (int), `saleId` (int, FK), `productId` (int, FK), `productName` (string), `barcode` (string), `quantity` (int), `unitCostPrice` (number), `unitSellingPrice` (number), `lineTotal` (number), `lineProfit` (number).

4. **`stockLogs`**
   - *Index Definition:* `++id, productId, timestamp, type`
   - *Fields:* `id` (int), `productId` (int, FK), `timestamp` (ISO date), `type` (SALE / RESTOCK / ADJUSTMENT), `quantityChange` (number), `previousStock` (number), `newStock` (number), `referenceId` (string), `note` (string).

5. **`customers`**
   - *Index Definition:* `++id, name, phone, debtLimit, status, createdAt`
   - *Fields:* `id` (int), `name` (string), `phone` (string), `debtLimit` (number), `status` (active/dormant), `notes` (string), `createdAt` (ISO date).

6. **`debts`**
   - *Index Definition:* `++id, customerId, saleId, status, createdAt`
   - *Fields:* `id` (int), `customerId` (int, FK), `saleId` (int, FK), `amount` (number), `remainingAmount` (number), `status` (open/paid), `notes` (string), `createdAt` (ISO date).

7. **`debtPayments`**
   - *Index Definition:* `++id, debtId, paidAt`
   - *Fields:* `id` (int), `debtId` (int, FK), `amount` (number), `paymentMethod` (string), `notes` (string), `paidAt` (ISO date).

8. **`categories`**
   - *Index Definition:* `++id, &name, icon, createdAt`
   - *Fields:* `id` (int), `name` (string, unique), `icon` (string), `createdAt` (ISO date).

---

## 9. Configuration & Environment Variables

| Variable | Default Value | Purpose |
|---|---|---|
| `PORT` | `3000` | Port for the local Express HTTP companion server. |
| `DOCS_DIR` | `./dzexams_downloaded_pdfs` | Root filesystem path for the local document print explorer. |
| `NGROK_TOKEN` | *(empty)* | Optional authentication token to authenticate ngrok tunnels. |
| `NGROK_DOMAIN` | *(empty)* | Static reserved ngrok domain (e.g. `your-name.ngrok-free.dev`). |
| `PUBLIC_URL` | `http://<LAN_IP>:3000` | Public URL encoded in generated QR codes for mobile customers. |

---

## 10. Known Limitations & TODOs

- **Multi-Device Live Sync:** Currently, each machine running Millora maintains its own isolated IndexedDB storage. Syncing between multiple cashiers requires manual JSON backup/restore (Dexie Cloud schema addon is linked in `package.json` for future synchronization implementation).
- **Physical Direct Printing on Linux/macOS:** `pdf-to-printer` is optimized for Windows print spoolers; Unix environments fall back to browser print dialogs (`window.print()`).
- **Payment Verification:** Mobile payment processing via BaridiMob/SATIM operates in simulation/verification-assist mode because Algerian banks lack public open REST checkout APIs for micro-merchants.
- **IndexedDB Storage Quota:** Mobile base64 file encapsulation inside QR codes is limited to `<200 KB` to ensure scanning reliability across standard mobile cameras.

---

## 11. Glossary

- **BaridiMob:** Mobile banking and payment application operated by Algérie Poste using RIP (Relevé d'Identité Postale) numbers.
- **CIB / Edahabia:** Algerian interbank payment cards (SATIM network and Algérie Poste).
- **DZExams:** Educational repository comprising Algerian national curriculum exams for Primary (1AP–5AP), Middle School (1AM–4AM / BEM), and Secondary School (1AS–3AS / BAC).
- **Dexie.js:** A minimalist wrapper library for IndexedDB that provides transactional guarantees and fast relational indexing.
- **Keyboard Wedge:** Emulation mode where hardware barcode scanners input decoded data into the computer as keystroke streams.
- **PWA (Progressive Web App):** A web application that uses service workers and manifests to provide native-like, installable offline experiences.
