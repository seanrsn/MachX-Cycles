# MachX Cycles 🚴

Full-stack serverless bicycle e-commerce store on AWS.

## Tech Stack
- **Frontend:** React 18 + Vite + Tailwind CSS (Phase 2)
- **Backend:** Python 3.12 + AWS Lambda + API Gateway
- **Database:** MySQL on existing RDS instance (`machx_cycles` database)
- **Auth:** AWS Cognito (admin only; guest checkout for customers)
- **Payments:** Stripe (Phase 4)
- **Storage:** S3 + CloudFront

## Project Structure
```
machx-cycles/
├── database/
│   └── schema.sql          # Full MySQL schema + seed data
├── backend/
│   ├── shared/             # Shared utilities (db, response, config)
│   ├── functions/          # Lambda handlers (1 per function group)
│   ├── requirements.txt
│   └── deploy.sh           # Packaging + deployment script
└── infrastructure/
    ├── setup.sh            # AWS resource creation (run once)
    └── setup-notes.md      # Step-by-step setup guide
```

## Implementation Phases
- **Phase 1 ✅** — Database schema, backend foundation, admin Lambda, AWS infrastructure
- **Phase 2** — Admin dashboard (React + Cognito auth)
- **Phase 3** — Customer storefront (bike browsing, filtering, cart)
- **Phase 4** — Checkout + Stripe payments + webhooks
- **Phase 5** — Polish, mobile, SEO, launch

## Getting Started

See `infrastructure/setup-notes.md` for the full setup guide.

Quick start:
```bash
# 1. Run schema against RDS
mysql -h brooklyn-bikery.c0vke2wqqjvd.us-east-1.rds.amazonaws.com -u user -p < database/schema.sql

# 2. Create AWS infrastructure
./infrastructure/setup.sh

# 3. Deploy admin Lambda
cd backend && ./deploy.sh admin-api
```
