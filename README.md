# ChopeFix · fixed-price home fixes, protected (Singapore MVP)

ChopeFix is an on-demand marketplace that connects homeowners in Singapore with smaller job-based contractors (plumbers, EMA-licensed electricians, handymen) for simple, **standard-priced** jobs. There's no quoting. Payment is **held** until the job is done with **photo proof**, and every repair logged in the app gets a **30-day ChopeFix Protection** warranty.

## Core rules implemented
| Rule | How it works in the app |
|---|---|
| Standard catalog | 11 single-visit jobs (30–75 min) with SGD fixed prices, included scope and exclusions, plus compliance tags (`PUB simple plumbing scope`, `EMA LEW verified contractor`, `ChopeFix vetted · insured`). |
| Held payout + 8% fee | Booking requires a simulated PayNow QR or card **authorisation hold** (no card numbers are collected). Funds stay "held" until release. The fee (default 8%) is deducted from the contractor payout. |
| Photo proof + 24h auto-release | Contractor checks in with a geo/time-tagged **Before** photo and completes with an **After** photo. Both accept real multipart upload (stored in `uploads/`) or a 1-click sample photo. The After photo starts a 24h countdown. The customer can **Mark job as done**, let it auto-release, or **Report an issue** to pause the payout. A demo button simulates the 24h expiry. |
| On-site add-ons | Contractor logs presets (corroded angle valve S$25, switch plate S$18, sealant S$15…) or a custom item. The customer approves or declines in one tap. Approved add-ons are added to escrow and covered by the warranty. The UI warns that cash or direct PayNow extras are **not covered**. |
| Warranty & reserve | Release creates a 30-day certificate (printable/downloadable) that lists the base job and approved add-ons. Customers can file a rework claim, which creates a ticket for the original contractor, who resolves it with fresh photo proof. The ledger tracks gross, the 8% fee, the 5% rolling reserve (held for the warranty period) and the net released. |

## Stack
- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 (Plus Jakarta Sans, custom inline-SVG brand mark), mobile-first.
- **Backend:** Express 5 + TypeScript, served from one port (`/api/*`, `/uploads/*` and the built SPA). Multer handles photo uploads.
- **DB:** SQLite via Node's built-in `node:sqlite` at `data/chopefix.db`. It is auto-created and seeded on first boot.
- **Auth:** email/password registration and login (salted `scrypt` hashes). Sessions use random tokens stored in SQLite and an HTTP-only `cf_session` cookie (Bearer tokens are also accepted). There's also a **demo role switcher** (Customer / 3 Contractors / Ops Admin).
- Node **≥ 22.5** is required (built and tested on Node 24.22). The server runs `.ts` directly in dev through Node's native type stripping. Production uses an esbuild bundle.

## Run locally
```bash
cd /workspace/chopefix
npm install
npm run build        # typecheck (client + server) → vite build → bundle server
npm start            # http://localhost:3000  (PORT=xxxx to change)
```
Development with hot reload: `npm run dev` (API on :3000, Vite on http://localhost:5173 with a proxy).

Other scripts:
- `npm run test:e2e` runs the full API lifecycle test against an isolated temp DB and uploads dir (27 checks).
- `npm run screenshots` captures rendered screenshots of a running server into `screenshots/` (needs Chrome and `BASE_URL`).
- `npm run reset-db` deletes the SQLite DB, which is re-seeded on the next start.

Environment: `PORT` (3000), `DB_PATH`, `UPLOAD_DIR`, and `DEMO_MODE` (`true`; set `false` to hide the role switcher and the demo/simulate endpoints).

## Demo accounts (password `chopefix123`)
| Role | Email | Notes |
|---|---|---|
| Customer | `rachel@chopefix.demo` | Has 3 seeded bookings: completed + warranty, on site with a pending add-on, and awaiting a contractor |
| Plumber | `weiming@chopefix.demo` | Wei Ming Tan, PUB simple plumbing scope |
| Electrician | `farid@chopefix.demo` | Farid Rahman, EMA LEW |
| Handyman | `jason@chopefix.demo` | Jason Lim, sees the open TV-mount job |
| Ops admin | `ops@chopefix.demo` | KPIs, disputes, catalog, contractor verification |

In demo mode the app opens as Rachel automatically. You can switch roles from the dark bar at the top.

**Suggested pitch walkthrough:** (1) As the customer, book a job and pay with PayNow. (2) As the matching contractor, accept it under Available jobs, then **Use sample photo** to check in and log an add-on. (3) As the customer, approve the add-on. (4) As the contractor, submit the After photo. (5) As the customer, choose **Mark job as done** or **Simulate 24h auto-release**, then open the **Warranty certificate** and use **Claim warranty rework**. (6) As the contractor, resolve the rework ticket and check the **Earnings & reserve** ledger. (7) As Ops, review the KPIs, disputes, and live price edits.

## Project layout
```
server/   config.ts db.ts (schema) seed.ts auth.ts logic.ts (escrow/release/serialisers) geo.ts (postal sectors) samples.ts (stamped sample photos) index.ts (routes)
src/      App.tsx (shell + role switcher) api.ts types.ts format.ts
          components/ui.tsx (design system) components/booking.tsx
          views/CustomerApp, BookingDrawer, BookingTracker, Certificate, ContractorApp, AdminApp, AuthModal
tests/e2e.ts   scripts/screenshots.ts   screenshots/*.png
```

## Going to production (next steps)
1. **Payments:** replace the simulated holds with **Stripe Connect** (Express accounts for contractors). Use PaymentIntents with `capture_method=manual` for cards, or "separate charges and transfers" with PayNow (Stripe supports PayNow in SG). Use `application_fee_amount` for the 8% fee and hold the 5% reserve as a delayed transfer. Keep funds with the licensed provider, not in your own account, to stay outside MAS payment-services licensing early on. Drive auto-release from a scheduled job rather than an in-process sweeper.
2. **Hosting:** the app is a single Node process, so **Railway** or **Render** run it as is (`npm run build && npm start`). Use a persistent volume for `data/` and `uploads/`, or move to Postgres (Neon/Supabase) and S3/R2 for photos. For **Vercel**, deploy the SPA statically and move the API to serverless functions with a hosted DB and object storage, because SQLite files and local uploads don't persist there.
3. **Compliance & trust:** add a real contractor onboarding flow (EMA LEW licence lookup, PUB licensed plumber checks, NRIC/UEN via Singpass/MyInfo, and insurance documents). Also add EXIF and GPS validation on photos plus image compression.
4. **Ops & security:** add SMS/WhatsApp notifications, set `COOKIE_SECURE=true` with `NODE_ENV=production` behind HTTPS, add rate limiting, CSRF protection for cookie auth, and audit logs. Set `DEMO_MODE=false`.
