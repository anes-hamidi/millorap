Millora — Product Documentation
All-in-One Offline Business Suite: Point of Sale • QR Code Generator • Document Print Center

📋 Overview
Millora is a standalone, offline-first business application designed for small shops, print centers, and retail businesses. It runs entirely inside your web browser with zero dependency on cloud services or internet connectivity for core operations.

The application combines three powerful modules into a single unified interface:

Mermaid diagram
🏗️ Architecture
Feature	Technology
Runtime	100% Client-Side Browser (Progressive Web App)
Database	IndexedDB via Dexie.js — all data stored locally
Backend	Lightweight Node.js + Express server (serves static files only)
UI Framework	Tailwind CSS with Dark/Light theme support
Offline Support	Service Worker for full PWA offline capability
Data Security	All business data stays on your machine — never uploaded
IMPORTANT

No cloud account, subscription, or internet connection is required to use Millora once installed. Your data never leaves your device.

🛒 Module 1: POS Terminal (Point of Sale)
The default landing page — a complete retail checkout system for daily shop operations.

Product Catalog & Inventory Management
Visual Product Grid with thumbnail images, stock badges, and category labels
Category Filtering — Quick filter pills: All Items, Beverages, Bakery, Printing, Electronics, Supplies
Search — Instant debounced search by product name, category, or barcode
Product CRUD — Add, edit, and delete products with full details:
Name, Category, Selling Price, Cost Price
Current Stock Level & Low Stock Threshold
Product Icon & Thumbnail Image URL
Barcode Assignment
Barcode Scanner Integration
Feature	Detail
Hardware Scanner	Keyboard wedge support — plug any USB/Bluetooth barcode gun
Camera Scanner	Built-in camera barcode scanning via webcam
Scanner Configuration	Adjustable keystroke threshold (ms), minimum length, suffix key (Enter/Tab)
Audio Feedback	Beep sound on successful scan (Web Audio API)
Auto-Add to Cart	Scanned products are instantly added to the current order
Unknown Barcode Handling	Prompts to create a new product when an unrecognized barcode is scanned
Shopping Cart & Checkout
Live Cart with quantity adjustment (+/−), item removal, and clear cart
Discount System — Apply percentage-based discounts (0–100%)
Payment Methods:
💵 Cash (Espèces)
💳 CIB / Dahabia (Algerian bank cards)
📲 BaridiMob / QR — Generates a dynamic QR code for mobile payment
Thermal Receipt Generation — French-formatted receipt with store header, itemized table, totals, and footer
Stock Deduction — Inventory is automatically decremented upon checkout with full stock movement logging
Financial Analytics Dashboard
A built-in analytics modal computed 100% locally from your IndexedDB records:

KPI	Description
Gross Revenue	Total sales revenue for the selected period
Net Profit	Revenue minus Cost of Goods Sold (COGS)
Profit Margin %	Net profit as a percentage of revenue
Average Basket Value	Average transaction amount
Total Items Sold	Sum of all units sold
Top Selling Products	Ranked list of best sellers by quantity
Low Stock Alerts	Products at or below their reorder threshold
Time Window Filters: Today · Last 7 Days · Last 30 Days · All Time

Data Backup & Restore
📥 Export to JSON — Full database export (products, sales, stock logs) as a downloadable .json file
📤 Restore from JSON — Import a previously exported backup to restore all data
⏰ Automatic Reminders — Proactive banner reminder if no backup has been made in 7+ days
📱 Module 2: QR Code Generator
A professional-grade QR code generator with 9 data types and deep visual customization.

Supported Data Types
#	Type	Description
1	🔗 URL / Link	Any website address (auto-adds https:// if missing)
2	📝 Plain Text	Free-form text, notes, codes, or messages
3	📶 Wi-Fi	Network SSID, password, encryption type (WPA/WEP/Open), hidden SSID toggle
4	👤 vCard Contact	Full digital business card: name, phone, email, company, title, website, address
5	📧 Email	Pre-filled recipient, subject line, and message body
6	💬 SMS / Phone	Phone number with optional pre-filled text message
7	📁 File / Document	Upload and encode small files (< 200KB) as Base64 Data URLs for offline access
8	🌐 Social Media	Direct links for Twitter/X, Instagram, LinkedIn, YouTube, GitHub, WhatsApp, App Store
9	💳 Crypto / Payment	Bitcoin, Ethereum wallet addresses, PayPal.me links, UPI payment IDs
Visual Customization
Foreground Color — Custom QR module color via color picker
Background Color — Custom background with optional transparent background toggle
Gradient Mode — Enable dual-color linear or radial gradients
Pattern Styles (5 options): Square · Dots · Rounded · Pill · Classy Diamond
Corner Styles (3 options): Square · Rounded · Circle
Center Logo Overlay:
Preset icons: Link, Wi-Fi, User, Mail, WhatsApp, GitHub, Bitcoin
Upload any custom image file
Error Correction Level (ECL): L (7%) · M (15%) · Q (25%) · H (30%)
WCAG Contrast Warning — Alerts if the foreground/background contrast ratio is too low for reliable scanning
Export & Output
Format	Description
⬇️ PNG	High-resolution raster image
⬇️ SVG	Scalable vector graphic (ideal for print)
⬇️ WEBP	Modern compressed web format
📋 Copy to Clipboard	One-click copy image to system clipboard
🖨️ Print Card	Print-ready QR card layout
QR History
Recent Saved QR Codes — Automatically saves generated codes for quick re-access
Clear All — One-click history reset
🖨️ Module 3: Shop Print Center
A local document explorer and previewer designed for print shops managing thousands of files (exam papers, forms, documents).

Document Explorer
Tree-based File Browser — Navigate your local documents folder with expandable folder hierarchy
Breadcrumb Navigation — Visual path trail with clickable segments
Parent Folder Navigation — "Up" button to traverse directories
Expand/Collapse Controls — Quickly expand or collapse all loaded folders
Instant Search — Filter through 44,000+ files by filename or subject
File Statistics — Live count of files and folders in current view
Document Viewer
Embedded Preview — Full-resolution document preview in an inline iframe
Open in New Tab — Launch the document in a separate browser tab
Maximize Mode — Fullscreen document viewer that hides the sidebar for maximum reading area
PDF Badge — Visual indicator for PDF documents
Configurable Root Directory
The root documents folder path is displayed and can be configured in the server settings. Default: C:/Shop_Documents

🌗 User Interface
Theme Support
Light Mode ☀️ — Clean white interface
Dark Mode 🌙 — Eye-friendly dark theme
One-click toggle in the header
Persistent — Theme preference is remembered
Navigation
Three-tab mode switcher in the header bar:

🛒 POS Terminal (default)
📱 QR Generator
🖨️ Shop Print Center
Design Language
Glassmorphism panels with subtle blur effects
Rounded corners (2xl / 3xl border radius)
Gradient accent buttons
Responsive grid layout (mobile-friendly)
Toast notifications for user feedback
💾 Data Storage (IndexedDB Schema)
All data is stored locally in the browser's IndexedDB under the database name FlexiPOS_DB:

Object Store	Purpose	Key Fields
products	Product catalog and inventory	id, name, category, sellingPrice, costPrice, currentStock, barcode
sales	Completed transaction records	id, items[], subtotal, totalAmount, discountPercent, paymentMethod, timestamp
stockLogs	Inventory movement audit trail	id, productId, type (SALE/RESTOCK), quantityChange, previousStock, newStock
🚀 Installation & Setup
Prerequisites
Node.js v18 or newer — Download here
Quick Start (Windows)
Download or copy the project folder to your computer
Double-click Install_and_Start.bat
The app opens automatically at http://localhost:3000
Manual Start
bash

cd qrcodegenerator
npm install
npm start
Access from Other Devices (Same Network)
Ensure both devices are on the same Wi-Fi / LAN
On the second device, open a browser and navigate to:
http://<your-computer-ip>:3000
Install as a PWA for an app-like experience
Migrating Data to Another Device
On source device: POS Terminal → 💾 Backup → Export Database (.json)
Transfer the .json file to the new device
On new device: POS Terminal → 💾 Backup → Restore Database → select the file
🔒 Privacy & Security
TIP

Millora is designed with a privacy-first architecture.

✅ All business data (products, sales, analytics) stored only in your browser's IndexedDB
✅ No cloud accounts, no subscriptions, no telemetry
✅ No data ever leaves your device unless you explicitly export it
✅ Works fully offline after initial setup (PWA with Service Worker)
✅ Server only serves static HTML/CSS/JS files — no backend database
📊 Technical Performance
The POS module includes several runtime optimizations:

O(1) Product Lookups — In-memory Map indexes for instant barcode scanning and cart operations
Debounced Search — 120ms input debounce to prevent UI thread blocking
Lazy Image Loading — Catalog thumbnails use loading="lazy" and decoding="async"
Single-Pass Cart Calculations — Optimized aggregation loop for cart totals
Built with ❤️ for Algerian small businesses and print shops.
C:\Users\fethi\dzexams_downloaded_pdfs
