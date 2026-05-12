# MachX Cycles — Claude Orientation

Used-bike e-commerce store. Every listing is a 1-of-1 (no variants, no stock counts —
when a bike sells, it's sold). React storefront + admin dashboard, Python Lambdas,
MySQL on RDS, Stripe for payments, Cognito for admin auth.

**Live site:** https://machxcycles.com (CloudFront `E1DA2WCWTOBSNO`, S3 bucket
`machx-cycles-frontend`)
**API:** `https://bs4rhhaumi.execute-api.us-east-1.amazonaws.com/prod`
**GitHub repo:** `seanrsn/MachX-Cycles`
**Local path:** `C:\Users\super\Desktop\Mission Control\AWS\MachX Cycles\Code\` —
not `~/Projects/machx-cycles\` (that path appears in older `task.txt` notes but
the project moved; trust this location).

---

## File map (don't go hunting)

```
Code/
├── backend/
│   ├── functions/                 ← THE Lambda source files (edit here)
│   │   ├── admin_api.py           → admin-api Lambda      (admin CRUD, auth via Cognito)
│   │   ├── bikes_public.py        → bikes-public Lambda   (public storefront listings)
│   │   ├── checkout.py            → checkout Lambda       (Stripe Checkout session creation)
│   │   ├── checkout_db.py         → checkout-db Lambda    (DB-side checkout helpers)
│   │   ├── stripe_payment.py      → stripe-payment Lambda (Payment Intent flow)
│   │   ├── stripe_webhook.py      → stripe-webhook Lambda (Stripe → mark order paid + bike sold)
│   │   └── contact_api.py         → contact-api Lambda    (contact form submissions)
│   ├── shared/                    ← shared utilities (db.py, response.py, config.py — copied into every Lambda zip)
│   ├── requirements.txt           ← Python deps (pymysql, boto3, stripe, etc.)
│   ├── deploy.sh                  ← packages + deploys Lambdas (mapping inside)
│   ├── migrate_*.py               ← one-off migration scripts (already-run, kept for history)
│   ├── cleanup_pending.py         ← maintenance script (cleanup abandoned checkouts)
│   ├── *.zip / lambda-*-pkg/      ← build artifacts, ignore (rebuilt by deploy.sh)
│   └── inspect_pending.py         ← debug helper for stuck pending orders
├── frontend/
│   ├── src/
│   │   ├── App.jsx, main.jsx, index.css
│   │   ├── api/                   ← API client modules (admin.js, etc.)
│   │   ├── components/            ← shared React components
│   │   ├── constants/             ← config constants
│   │   ├── pages/
│   │   │   ├── store/             ← public storefront pages (browse, bike detail, cart, checkout)
│   │   │   ├── admin/             ← admin dashboard pages:
│   │   │   │   ├── Dashboard.jsx, Bikes.jsx, BikeForm.jsx,
│   │   │   │   ├── Orders.jsx, OrderDetail.jsx,
│   │   │   │   ├── Promotions.jsx, Settings.jsx
│   │   │   └── Login.jsx
│   │   └── store/                 ← Zustand state stores
│   ├── public/, dist/             ← static assets, build output
│   ├── package.json, vite.config.js, tailwind.config.js
│   └── scripts/                   ← build helpers
├── database/
│   └── schema.sql                 ← canonical MySQL schema + seed
├── infra/                         ← CloudFront config JSONs (one-off setup)
├── infrastructure/
│   ├── setup.sh                   ← AWS resource bootstrap (run-once)
│   └── setup-notes.md             ← manual setup walkthrough
├── .github/workflows/deploy.yml   ← CI/CD (auto-deploy on push)
├── README.md, task.txt
├── test_api.py, test_fuzzy.py     ← API smoke tests
└── CLAUDE.md                      ← this file
```

---

## Lambda → AWS function name mapping

From `backend/deploy.sh`:

| Source file | AWS Lambda function |
|---|---|
| `backend/functions/admin_api.py` | `admin-api` |
| `backend/functions/bikes_public.py` | `bikes-public` |
| `backend/functions/stripe_payment.py` | `stripe-payment` (entry point for /checkout, /orders) |
| `backend/functions/checkout_db.py` | `checkout-db` (in-VPC DB ops, called by stripe-payment) |
| `backend/functions/stripe_webhook.py` | `stripe-webhook` |
| `backend/functions/contact_api.py` | `machx-contact-api` |

Local deploy: `cd backend && ./deploy.sh` (all) or `./deploy.sh admin-api` (one).
CI deploy: push to main or `claude/*`, the workflow runs `bash deploy.sh` itself.

---

## Tech stack at a glance

- **Frontend:** React 18 + Vite + Tailwind CSS + Zustand
- **Backend:** Python 3.12 Lambdas behind API Gateway
- **DB:** MySQL on shared RDS instance (`brooklyn-bikery.c0vke2wqqjvd.us-east-1.rds.amazonaws.com`,
  database `machx_cycles`). Yes, it's the same RDS host as Brooklyn Bikery — different DB.
- **Auth:** AWS Cognito (admin only). User pool `us-east-1_XBpo1Myjc`,
  client ID `6kbpbtjq70orm7p7tm4mcjckv9`. Customers check out as guests.
- **Payments:** Stripe (live mode — pub key `pk_live_…` is in the Vite .env at deploy time).
- **Storage:** S3 (`machx-cycles-frontend`) + CloudFront (`E1DA2WCWTOBSNO`).
- **Secrets:** AWS Secrets Manager (`machx-db-credentials`, Stripe secret in env or SM).

---

## Deploy flow

`.github/workflows/deploy.yml` — runs on push to `main` or `claude/**`, plus PRs.

1. **`prepare` job**: auto-merges `claude/*` branches/PRs into main, deletes branch.
2. **`deploy-backend`**: checks out main, runs `bash backend/deploy.sh` which packages
   each Lambda (with `shared/` baked in) and pushes to AWS via the deploy.sh mapping.
3. **`deploy-frontend`**: writes `.env` with API URL + Cognito + Stripe pub key,
   `npm ci && npm run build`, syncs `frontend/dist/` to S3, invalidates CloudFront.

**Workflow per user's preference:** phone Claude (claude.ai) pushes to `claude/*` →
auto-merge + deploy. **Desktop Claude NEVER pushes** unless explicitly asked, and
ALWAYS asks before `git pull`.

---

## Database notes

Core tables (see `database/schema.sql` for canon):
- `bikes` — one row per used bike. Each is 1-of-1. Inventory is `sold BOOLEAN`
  + a 4-state `reservation_state` enum (`none`/`soft`/`pi_created`/`processing`/`sold`)
  that tracks in-flight checkouts. Reservation points at `reservation_session_id`
  → `checkout_sessions(id)`.
- `checkout_sessions` — in-flight checkouts. Created when buyer hits "Continue
  to Payment". Holds the Stripe PI id, items, totals, buyer_token (localStorage
  UUID for same-buyer recognition). Materialized into `orders` by stripe-webhook
  on `payment_intent.succeeded`. Abandoned/expired sessions never become orders.
- `orders` + `order_items` — **paid-only.** Every row is a real order that
  collected money. Created by stripe-webhook materialization, never directly.
- `processed_stripe_events` — webhook idempotency (PRIMARY KEY on Stripe event id).

**Key business rules:**
- Bikes are 1-of-1: no stock levels, no quantities, no variants
- Reservation extends through Stripe lifecycle events: `processing` upgrades the
  reservation to a permanent lock (no TTL); succeeded marks bike sold + materializes
  the order; failed/canceled releases the reservation
- If two buyers somehow both succeed for the same bike (sub-second race), the
  loser is auto-refunded via Stripe API + admin SMS notification
- Same-buyer takeover: a returning buyer's old session is auto-released so they
  can re-checkout without seeing "another shopper" for their own bike. Matched
  by buyer_token primarily, customer_email as fallback.

**Removed (no longer in schema):**
- `bike_variants` table (DROP'd)
- `order_items.variant_id` / `frame_size` / `color` columns (DROP'd)
- These were from the pre-1-of-1 variant/SKU model

---

## Common gotchas

- **It's a used-bike reseller.** Each bike is 1-of-1: no stock levels, no
  quantities, no variants. The variant system was fully removed — if you see
  any reference to `bike_variants`, `variant_id`, or `variantId`, it's stale.
- **Don't confuse the two RDS databases.** Same host, different DB:
  `machx_cycles` (this project) vs `bikeshop` (Brooklyn Bikery). Pick the right one
  in connection strings — Lambda env vars handle this.
- **`shared/` gets copied into every Lambda zip** by deploy.sh. So importing
  `from shared.db import get_conn` works inside the Lambda but not when running
  Python locally from the repo root unless you cd into backend.
- **Stripe key in deploy.yml is a live key.** Check before testing — there's no
  staging environment. Use Stripe test mode locally with a different key.
- **`task.txt` references stale paths** (`C:\Users\super\Projects\machx-cycles\…`).
  The project moved; treat the file map above as canon.
- **Migrations are run-once scripts in `backend/`.** Don't re-run a `migrate_*.py`
  blindly — most are idempotent but check.
- **Admin dashboard pages** (`pages/admin/`) require Cognito auth via `Login.jsx`.
  Storefront pages (`pages/store/`) are unauthenticated; users check out as guests.

---

## Quick commands

```bash
# Frontend dev
cd frontend && npm run dev

# Frontend build (matches CI)
cd frontend && npm run build

# Backend deploy single Lambda
cd backend && ./deploy.sh admin-api

# Run a migration / one-off script
cd backend && python migrate_sold.py

# AWS — Dommy profile is default, already configured
aws lambda get-function --function-name admin-api --query 'Configuration.LastModified'
aws s3 ls s3://machx-cycles-frontend/

# Smoke tests against deployed API
python test_api.py
```

---

## Quick "where is X" cheatsheet

- **Add a public API endpoint** → `backend/functions/bikes_public.py` + frontend
  `src/api/` + a page in `src/pages/store/`.
- **Add an admin endpoint** → `backend/functions/admin_api.py` + `src/api/admin.js`
  + a page in `src/pages/admin/`.
- **Stripe behavior** → `checkout.py` (session creation), `stripe_webhook.py`
  (server-side post-payment), `pages/store/checkout/*` (UI).
- **Bike form fields** → `pages/admin/BikeForm.jsx` (UI) + `admin_api.py` create/update
  + `database/schema.sql` (column).
- **Cognito / login behavior** → `pages/Login.jsx` + Cognito console (user pool
  `us-east-1_XBpo1Myjc`).
- **Tailwind styling** → `frontend/tailwind.config.js`, classes inline in JSX.
- **Routing** → `App.jsx` (top-level routes).
