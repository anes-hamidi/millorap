# Millora — Tauri Desktop Migration Plan & Architecture Assessment

**Target:** Package Millora into an installable desktop application (Windows MSI/EXE, Linux deb/AppImage, macOS dmg/app) powered by **Tauri v2** with Rust backend capabilities, preserving 100% of offline IndexedDB data, thermal receipt generation, and mobile-facing web features.

---

## 1. Step 1: Assessment & Inventory of Node.js Capabilities

| Node.js / Express Capability | Location | Migration Strategy | Rationale |
|---|---|---|---|
| **Filesystem Directory Scanning & Document Navigation** | `routes/files.js` (`/api/files`, `/api/files/search`) | **Ported to Native Rust Command** (`list_documents`, `search_documents`) + scoped fallback | Fast, safe, multi-threaded directory traversing in Rust. Removes file access overhead. Implements path traversal safety natively (`std::fs::canonicalize`). |
| **Physical Printing & Printer Discovery** | `routes/files.js` (`/api/print`, `/api/printers`) | **Ported to Native Rust Command** (`get_system_printers`, `print_document`) | Uses Windows spooler APIs on Windows, and CUPS (`lp`/`lpr`) on Linux/macOS. Closes the OS limitation gap where Linux/macOS had no native silent printing. |
| **PDF Multi-File Merging** | `routes/files.js` (`/api/merge`) | **Ported to Rust (`lopdf` / `pdf-lib` WASM) / Sidecar Companion** | High performance in Rust, or client-side `pdf-lib.min.js`. |
| **Mobile File DropZone & Uploads** | `routes/transfer.js` (`/transfer`, `/api/transfer/upload`, Multer) | **Maintained as Local Background Network Server (Embedded Node/Sidecar or Lightweight Rust HTTP)** | **CRITICAL:** External mobile phones scan QR codes and hit this endpoint over local Wi-Fi or ngrok tunnel. Tauri webview cannot receive external HTTP POSTs directly from external devices. Must remain a listening HTTP server. |
| **Mobile Payment Portal (BaridiMob / SATIM)** | `routes/pay.js` (`/pay`, `/api/pay/process`, `/api/pay/status`) | **Maintained as Local Background Network Server** | **CRITICAL:** Customers open `/pay` in their smartphone browsers. Must remain reachable over LAN/ngrok while POS polls locally. |
| **POS Fallback Seed & Sales History Backup** | `routes/pos.js` (`/api/pos/products`, `/api/pos/history`) | **Ported to Rust Command / Managed File** | Can be handled by Tauri Rust commands for local snapshots while keeping local JSON fallback. |
| **LAN IP & Tunnel Resolution** | `routes/pos.js` (`/api/lan-ip`, `getLocalIp`) | **Ported to Native Rust Command (`get_lan_info`)** | Native network interface inspection in Rust (`local_ip_address` crate / `get_if_addrs`). |

---

## 2. Step 2: Architecture Decision — Hybrid Tauri Native + Network Companion

### Why Not 100% Rust Only Immediately?
External smartphones (used by shop customers for `/transfer` and `/pay`) must connect over HTTP/HTTPS to the merchant's machine. Tauri is a desktop UI framework and does not automatically listen on all network interfaces `0.0.0.0` for incoming mobile HTTP traffic.

### Solution:
1. **Desktop Shell & Cashier UI:** Tauri loads `public/index.html` natively. IndexedDB (Dexie.js), UI rendering, and barcode keydown events run inside the OS WebView2 / WebKit.
2. **Native Performance Operations:** File explorer scanning, document searches across 44,000+ files, OS printing, and system dialogs execute via **Tauri Rust commands** (`invoke()`).
3. **Mobile Bridge:** Tauri spawns and manages the local HTTP companion server (either as a packaged Node binary/sidecar or standalone local HTTP daemon) in the background on port `3000`, killed automatically when Tauri closes.

---

## 3. Step 3: Security & Content Security Policy (CSP)

### Hardened CSP Configuration:
- `default-src 'self' tauri: asset:;`
- `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net;`
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;`
- `font-src 'self' https://fonts.gstatic.com data:;`
- `img-src 'self' asset: tauri: data: blob: https:;`
- `connect-src 'self' tauri: ipc: http://localhost:* http://127.0.0.1:* https:;`

---

## 4. Step 4: Verification Checklist

- [x] IndexedDB data persistence across restarts (WebView2 uses persistent data directory).
- [x] Barcode scanner keyboard-wedge capturing `keydown` events in Tauri webview.
- [x] Windows direct thermal printing + Linux/macOS CUPS support.
- [x] Mobile `/pay` and `/transfer` reachable over LAN and ngrok tunnel.
- [x] Scoped path traversal protection in Rust commands (`canonicalize` check).
