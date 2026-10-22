# Aprotel Solar

Phase 1 backend and Phase 2 administration dashboard for Aprotel Services Nig. Ltd.: a versioned REST API, MongoDB data model, administrator-only authentication, GridFS media storage, and a staff dashboard. Visitors can browse published catalogue data, send enquiries, request quotations, and check out as guests. There is no customer registration, customer login, or customer dashboard.

The public storefront is `apps/site`. Start it with `npm run dev:site` at `http://localhost:5174`. It proxies `/api` to the API and loads published products, services, packages, branches, and page content. Guest checkout does not create a customer account. The solar calculator submits the typed calculation contract and does not invent equipment sizes while the engine is still pending.

## Layout

```text
apps/api        Express API
apps/web        Administration dashboard (Vite, React, TypeScript, Tailwind)
apps/site       Public website and guest checkout
packages/shared Zod contracts, roles, and money helpers
packages/solar-engine  Deterministic load, battery, inverter, and array calculations
tests           API integration tests
```

Prices are stored as integer kobo and returned as NGN strings with two decimal places (`150000.00`). The API never trusts a price, total, tax, or payment status sent by a browser.

## Prerequisites

- Node.js 22 or newer
- MongoDB 7+ for local development. A standalone server is enough for the dashboard; a replica set keeps inventory and payment writes atomic. Tests use an in-memory replica set and do not need a local server.

## Setup

```bash
npm install
copy .env.example .env
```

Set `MONGODB_URI` and, for a first administrator, all three bootstrap variables. Leave them empty if you will create the administrator later. Do not commit `.env`.

```bash
npm run dev
npm run seed
```

The API listens on port 4000. Interactive docs are at `http://localhost:4000/api/docs`. The OpenAPI document is `GET /api/v1/openapi.json`.

Start the dashboard in a second terminal with `npm run dev:web`. It runs at `http://localhost:5173` and proxies `/api` to the API. Sign in with the bootstrap administrator. Staff who lack a permission do not see that section.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build shared packages and start the API with reload |
| `npm run dev:web` | Start the administration dashboard |
| `npm run dev:site` | Start the public website |
| `npm run seed` | Insert categories, branches, services, and starter content if missing |
| `npm run admin:bootstrap` | Create the first super administrator from the environment |
| `npm test` | Run the API test suite |
| `npm run typecheck` | Typecheck shared packages, the API, and the dashboard |
| `npm run build` | Compile every package |
| `npm start` | Run the compiled API |

Hosting on Render and Vercel is described in [DEPLOY.md](DEPLOY.md).

## Administrator access

Authentication is for administrators only. Roles are `super_administrator`, `administrator`, `editor`, `inventory_manager`, and `engineer`.

- Passwords are hashed with Argon2id.
- Sessions live in MongoDB. The browser receives `aprotel.sid` as an HTTP-only cookie. Tokens are not placed in localStorage.
- Cookie-authenticated changes require an `X-CSRF-Token` header. Login returns the token, and `GET /api/v1/auth/csrf` repeats it.
- Failed sign-ins lock the email after the configured attempt limit. Login is also rate limited by IP.
- Password reset tokens are random, stored only as a SHA-256 hash, expire, and work once. In development, without SMTP, the reset link is written to the server log. In production, set `SMTP_HOST` and `SMTP_FROM` or the reset email is not delivered.
- Only a super administrator can create or change administrator accounts, and can change tax, payment enablement, calculator assumptions, and inventory policy. The last active super administrator cannot be removed.
- Cost prices require `products:read_cost`. Verified electrical specifications require `products:verify_specs`.

Bootstrap runs on startup when `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are set and no super administrator exists. It does not reset an existing password. Weak or common passwords are rejected. `.env.example` contains no real password.

## Public API

All routes are under `/api/v1`.

Published catalogue: products, categories, services, solar packages, branches, and page content. Public product payloads omit cost price. Draft and archived records are omitted. A published package is hidden if any included product is no longer published.

Guest writes:

- `POST /enquiries`
- `POST /quotations` and `POST /quotations/lookup`
- `POST /orders`, `POST /orders/lookup`, `POST /orders/cancel`
- `POST /payments/initialize`
- `POST /solar/calculate` and `POST /solar/recommend`

Order creation and payment initialization require an `Idempotency-Key` header. Repeating the same key and body returns the original response.

`POST /solar/calculate` returns load, battery, inverter, and array requirements without choosing products. `POST /solar/recommend` uses the same calculation and then selects verified, published, in-stock equipment whose specifications pass the electrical checks. If no such combination exists, the requirement is returned and `selected` is null. Prices on a recommendation are catalogue equipment prices only. A quotation remains provisional until an engineer approves it. The formulas, sun-hour table, and limits are described in `packages/solar-engine/ENGINE.md`.

## Administration API

`/api/v1/admin/...` covers products, categories, services, packages, branches, inventory, media, content, enquiries, quotations, orders, administrators, settings, dashboard statistics, and the audit log. List endpoints accept `page`, `pageSize` (maximum 100), `sort`, `order`, and `q`. Search text is escaped before it is used in a query.

Deleting a product, category, service, package, or content entry archives it. Order and quotation lines keep the name and unit price captured at purchase, so later catalogue edits do not rewrite history.

## Inventory

Each active branch has a stock record per product. `onHand` is physical stock and `reserved` is held for an unpaid order. Available stock is `onHand - reserved`. Reservations use a conditional update so two concurrent orders cannot drive stock negative. Unpaid reservations expire on the interval configured in platform settings (default 30 minutes) and the order is then marked failed. Payment confirmation converts the reservation into a sale. If payment is verified after the reservation has already expired, the payment is stored as `review` instead of overselling.

Receipts, adjustments, transfers, reservations, releases, and sales each write a stock movement. Adjustments require a note.

## Media

Original images are stored in MongoDB GridFS in the `media` bucket. Metadata, dimensions, alt text, and usage links live in `media_assets`. JPEG, PNG, and WebP are accepted after the file signature is checked. SVG and other types are rejected. Size and dimension limits come from the environment. Thumbnail and medium WebP variants are generated; the original bytes are kept.

- `GET /api/v1/media/:id`
- `GET /api/v1/media/:id?variant=thumbnail|medium`
- `GET /api/media/:id` is the same public read

Uploads require an administrator. A file stays `pending` until a product, service, package, category, or content record references it. Pending files older than `MEDIA_ORPHAN_TTL_HOURS` are removed with their GridFS bytes. A file that is still referenced cannot be deleted.

## Payments

`PAYMENT_PROVIDER` is `development`, `paystack`, or `flutterwave`.

The development adapter cannot start when `NODE_ENV=production`. It returns a checkout description and confirms a payment only through `POST /api/v1/payments/webhooks/development` with an HMAC-SHA256 `x-aprotel-signature`, or through `POST /api/v1/payments/dev/simulate`, which builds that signed webhook on the server. The amount is the order total stored by the API, not a value from the browser.

Paystack and Flutterwave adapters initialize a transaction and mark an order paid only after signature checks and a server-to-server verify call. Secrets stay in environment variables. Settings updates that include `secretKey`, `password`, or similar fields are rejected. The database stores only whether payments are enabled.

Set `payment.enabled` to true in platform settings before initialization is allowed.

## Quotations and orders

Quotation and order totals are computed on the server from current catalogue prices, the delivery fee for the destination state, optional installation fees, and tax settings. A package is charged its package price, not the sum of its components. Installation on a package uses that package's installation charge. Loose solar panels use the configured base fee plus the per-panel fee. Runtime text on a package is stored only together with the load in watts and the operating notes.

An order defaults to the active central branch unless `branchId` is sent. Products must be published and `in_stock`. Discontinued, draft, archived, and preorder products cannot be purchased.

## Solar specifications

Categories carry a profile: `solar_panel`, `battery`, `inverter`, or `generic`. A product's specification object must use that profile. Marking specifications verified checks the required electrical fields (wattage, voltages, currents, temperature coefficients, and dimensions for panels; chemistry, capacity, current limits, and configuration for batteries; continuous power, efficiency, battery support, and grid compatibility for inverters). Unpublished products and unverified specifications are not eligible for a future recommendation run.

## Operations

Health checks:

- `GET /health` answers while the process is up
- `GET /ready` answers only when MongoDB is connected

The process closes the HTTP server and the database connection on `SIGINT` and `SIGTERM`. Background jobs expire reservations and delete orphaned media when `RUN_JOBS=true`.

### Backup and restore

GridFS bytes live in the same database as the documents, in `media.files` and `media.chunks`. A normal MongoDB dump includes them.

```bash
mongodump --uri="mongodb://127.0.0.1:27017/aprotel_solar" --archive=aprotel.archive --gzip
mongorestore --uri="mongodb://127.0.0.1:27017" --archive=aprotel.archive --gzip --drop
```

Restore into a stopped API process, then start the API and call `GET /ready`. Confirm a known product image with `GET /api/v1/media/:id` and confirm an order still shows its original unit price. Take a dump before a restore that uses `--drop`. Test a restore on a separate database before using it on production.

## Tests

`npm test` starts a single-node MongoDB replica set, so inventory and payment transactions behave as they do against a replica set. The suite covers session cookies, CSRF, lockout, password reset, hidden cost prices, server-side order and quotation totals, stock limits, signed payment confirmation, historical order lines after a product is archived, GridFS upload and retrieval, and the Phase 4 solar contract.

## Not in this phase

The public storefront, administration dashboard UI, and the numerical solar sizing engine are intentionally absent. Payment provider credentials are not bundled; production uses the Paystack or Flutterwave adapter described above.
