# Developer Notes — FlexiPOS / Millora Architecture & Sync Setup

This document describes the multi-register synchronization architecture, offline-first IndexedDB schema, LAN session security, and developer setup instructions for FlexiPOS / Millora.

---

## 1. Multi-Register Sync Architecture (Dexie Cloud)

### Global vs Local Scoping
- FlexiPOS uses **Dexie.js v3+ with Dexie Cloud addon** for cross-device, multi-register synchronization.
- Primary keys across synchronized tables use the `@id` modifier, generating globally unique string identifiers (opaque IDs like `c3x9k1...`) to prevent primary key collision across multiple offline registers.
- All primary key conversions across the codebase (`debtService.js`, `checkoutService.js`, `supplierService.js`, `app.js`, `pos.js`) treat IDs as opaque strings rather than numeric integers (`Number(id)`).

### Realm Setup: Single Shared Shop Realm
- All cashier terminals, mobile scanners, and manager tablets within the same shop **must share a single Dexie Cloud Realm**.
- This guarantees:
  - Inventory counts and adjustments made on Terminal 1 replicate to Terminal 2.
  - Customer debts and payments are unified across all registers.
  - Suppliers, purchase orders, and batch expiry data are globally accessible.

### Placeholder Configuration in `public/js/db.js`
In `public/js/db.js`, Dexie Cloud is initialized with the following structure:
```javascript
if (db.cloud && typeof db.cloud.configure === 'function') {
  db.cloud.configure({
    databaseUrl: "https://<YOUR_DEXIE_CLOUD_URL>.dexie.cloud", // <-- REPLACE WITH YOUR REAL DEXIE CLOUD URL
    requireAuth: false, // Set to true if cashier user login is required
    customLoginGui: false
  });
}
```

#### Production Checklist for Dexie Cloud Deployment:
1. Run `npx dexie-cloud create` to create your Dexie Cloud database instance.
2. Obtain your database URL (e.g., `https://xyz123.dexie.cloud`).
3. Replace the `databaseUrl` placeholder in `public/js/db.js`.
4. Run `npx dexie-cloud whitelist` to whitelist your production or local domain(s).

---

## 2. Terminal ID & Order Reference Scoping

Each physical POS terminal stores its own identifier in `localStorage.pos_terminal_id` (default: `REG-01`, editable in Settings workspace).

Order references are generated with terminal scoping:
$$\text{DZ-}\{\text{terminalId}\}\text{-}\{\text{timestamp}\}\text{-}\{\text{random}\}$$
*Example:* `DZ-T1-1774392019283-492`

This prevents order reference collisions even if two registers checkout at the exact same millisecond while offline.

---

## 3. LAN Session Token & Endpoint Security

### Mechanism
- To secure LAN transfer and payment endpoints (`/transfer`, `/pay`) without requiring accounts or complex OAuth for ad-hoc customers connecting over local Wi-Fi:
  - When the POS generates a QR code for file transfer or mobile payment, the server issues a 15-minute time-to-live (TTL) session token.
  - The token is passed via query parameter to the mobile landing page: `/transfer?token=<UUID>` and `/pay?token=<UUID>`.
  - The mobile web client submits this token in both the POST payload (`token`) and the `X-Session-Token` HTTP header.
  - State-changing server endpoints (`POST /api/transfer/upload`, `POST /api/pay/process`) validate the token against in-memory token maps (`sessionTokens` / `paySessionTokens`).
  - Missing, invalid, or expired tokens receive an immediate `401 Unauthorized` response with JSON `{ success: false, error: 'Unauthorized: Missing, invalid or expired session token' }`.

---

## 4. Unit / Pack Selling (`Fardeau` / `Carton`)

Products can be sold as individual units or bundled packs (e.g., pack of 6 water bottles, carton of 24):
- Schema fields on `products`:
  - `unitsPerPack` (number, default 1): Number of base units contained in one pack.
  - `packUnitLabel` (string, e.g., "Fardeau", "Carton", "Pack"): Display label for the pack.
  - `packPrice` (number or null): Custom pack selling price (if null, defaults to `sellingPrice * unitsPerPack`).
  - `sellByPackDefault` (boolean): Whether scanning the barcode defaults to adding a pack.
- Stock tracking in IndexedDB is always stored in **base units** (`currentStock`).
- When a pack is sold, the atomic checkout transaction decrements stock by `qty * unitsPerPack` using Dexie's relative atomic modify function:
  ```javascript
  await db.products.where(':id').equals(productId).modify(p => {
    p.currentStock = (p.currentStock || 0) - baseUnitsRequired;
  });
  ```
- Cart items record `saleUnit` ('unit' | 'pack') and `unitMultiplier`. Cashiers can toggle between unit and pack directly in the cart interface.

---

## 5. Expiry Batch Tracking & Alerts

- Table `batches`: stores `{ id, productId, batchNumber, expiryDate, initialQty, remainingQty, poId, receivedAt }`.
- `window.AnalyticsService.getExpiringBatches(daysAhead = 7)` calculates days remaining:
  - $\le 3$ days: **Danger (Red)** alert badge.
  - 4 to 7 days: **Warning (Amber)** alert badge.
- Automatic visual badges are updated in the header (`#expiry-alert-badge`), sidebar (`#nav-expiry-badge`), and analytics workspace (`#page-analytics-expiring-batches`).

---

## 6. Supplier & Purchase Order (PO) Module

- `suppliers`: Supplier directory (`id`, `name`, `phone`, `createdAt`).
- `purchaseOrders`: Purchase orders (`id`, `orderRef`, `supplierId`, `status: 'pending'|'received'|'cancelled'`, `expectedDate`, `totalEstimatedAmount`).
- `purchaseOrderItems`: Line items for purchase orders (`id`, `purchaseOrderId`, `productId`, `quantityOrdered`, `unitCost`).
- **Receiving Deliveries**:
  - Validating a delivery note atomically increases product inventory (`currentStock`), records a `stockLogs` entry of type `RESTOCK`, updates the PO status to `received`, and creates records in `batches` if an expiry date is provided.
