# Sightstone — Contract Playbook Harmonisation Platform

> AI-powered platform for legal teams to harmonise contract playbooks across their organisation. Upload multiple contracts, extract and compare clauses by contractual effect, identify overlaps, and produce a single unified playbook — powered by Llama 3.3 70B on Groq.

---

## User Flow

```
Landing → Register / Login → Dashboard → New Playbook
→ Upload Contracts → Analyse (AI) → Harmonise Clauses → Export Playbook
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SIGHTSTONE PLATFORM                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    FRONTEND (Next.js 15 App Router)              │   │
│  │                                                                  │   │
│  │  / (Landing)   /login   /register                                │   │
│  │                                                                  │   │
│  │  /dashboard                                                      │   │
│  │    /playbooks          ← list all org playbooks                  │   │
│  │    /playbooks/new      ← create playbook                         │   │
│  │    /playbooks/[id]     ← detail: upload + analyse + harmonise    │   │
│  │    /settings           ← org & user management                   │   │
│  │                                                                  │   │
│  │  Styling: Tailwind CSS v3 + shadcn/ui primitives (Radix UI)      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                           │ API Calls                                   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  BACKEND (Next.js API Routes)                    │   │
│  │                                                                  │   │
│  │  POST  /api/auth/register          ← create user + org           │   │
│  │  *     /api/auth/[...nextauth]     ← NextAuth v5 handler         │   │
│  │  GET   /api/playbooks              ← list org playbooks          │   │
│  │  POST  /api/playbooks              ← create playbook             │   │
│  │  GET   /api/playbooks/[id]         ← get single playbook         │   │
│  │  PATCH /api/playbooks/[id]         ← update name/status          │   │
│  │  DELETE/api/playbooks/[id]         ← delete playbook             │   │
│  │  POST  /api/playbooks/[id]/contracts   ← upload contracts        │   │
│  │  POST  /api/playbooks/[id]/analyse     ← trigger AI analysis     │   │
│  │  GET   /api/playbooks/[id]/analyse     ← poll analysis status    │   │
│  │  POST  /api/playbooks/[id]/harmonise   ← save clause selection   │   │
│  │  GET   /api/playbooks/[id]/export      ← download playbook       │   │
│  │  GET   /api/organisation               ← org + members           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│           │ Prisma ORM       │ Groq SDK           │ File parsing         │
│  ┌────────▼──────┐  ┌────────▼────────┐  ┌───────▼──────────────┐      │
│  │  PostgreSQL   │  │  Groq API       │  │  pdf-parse / mammoth  │      │
│  │  (Supabase)   │  │  llama-3.3-70b  │  │   (text extraction)   │      │
│  │  FREE tier    │  │  (free tier)    │  │  Runs server-side     │      │
│  └───────────────┘  └─────────────────┘  └───────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

```
Organisation ──< OrganisationMember >── User
     │
     └──< Playbook
              │
              └──< Contract ──< Clause
              │
              └──< ClauseGroup ──< Clause (via clauseGroupId FK)
```

### ContractualEffect Ordering (highest → lowest priority)
1. INDEMNITY → 2. LIMITATION → 3. EXCLUSION → 4. OBLIGATION
5. RIGHTS_GRANT → 6. WARRANTY → 7. REPRESENTATION → 8. TERMINATION
9. GOVERNANCE → 10. DEFINITION → 11. BOILERPLATE

---

## Reliability and operating limits

Every playbook API and its server-rendered detail page checks organisation membership.
OWNER, ADMIN and MEMBER can edit; VIEWER can read. Contract deletion also checks
that the contract belongs to the addressed playbook. Analysis and edits coordinate
through a database row lock and an optimistic timestamp lease.

Analysis stays inside the HTTP request, with a 45-second model deadline and no
background queue. It computes and validates replacement results before committing
clauses, groups and status together in a transaction. Provider errors, malformed
output and database errors preserve the previous saved decisions. After an
interrupted request, the UI offers a retry once its 90-second lease expires; an
older worker cannot overwrite a newer attempt. Existing stuck ANALYSING playbooks
and PROCESSING contracts can use this recovery path without a schema migration.

This bounded implementation accepts 2?5 readable contracts per analysis, each at
most 15,000 extracted characters. Larger input is rejected explicitly, never
silently truncated. Uploads accept PDF, DOCX and TXT, up to five files of 5 MB each;
scanned documents require OCR before upload. Model responses must finish normally,
match the expected schema and enums, and quote source text exactly. These checks
do not prove extraction completeness or legal correctness: a human must compare
results with the original documents. Model-generated wording is a draft.

The upload route stores extracted text in PostgreSQL. It does not currently persist
original files or invoke the optional Supabase storage helper. Contract text is sent
to the configured Groq account only when analysis is requested. Configure deployment
request limits for at least 60 seconds; shorter platform limits are recoverable via
the lease, but may prevent longer analyses from completing. No paid queue or new
service is required. Provider quotas can still cause an analysis to fail safely.

## Validation

```sh
npm ci
npm run lint
npm run check-types
npm test
npm run build
```

Unit tests need no database or model credentials. PostgreSQL integration tests run
in CI against a disposable database and mock the model boundary: they exercise
cross-organisation access, viewer restrictions, wrong-playbook deletion, duplicate
requests, stale workers, failure rollback, recovery and duplicate contract names.
For a dedicated local test database named `sightstone_test`, apply `npx prisma db push`
there and set `RUN_DATABASE_TESTS=1` before `npm test`. Never point those tests at an
application database. Live Groq quality, quotas and deployed account setup are not
certified by these offline checks.

## AI Pipeline

### Step 1 — Clause Extraction
```
Contract raw text → Llama 3.3 70B (Groq)
→ Extract all clauses (clauseType, contractualEffect, riskLevel, position)
→ Source-backed clause data held until the complete analysis succeeds
```

### Step 2 — Clause Grouping & Comparison
```
Clauses grouped by clauseType AND contractualEffect across contracts
→ If clauses from 2+ distinct contracts in group → the model compares them:
  • overlapSummary (what they have in common)
  • aiSuggestedWording (normalised balanced clause)
→ ClauseGroup saved with AI wording
```

### Step 3 — User Harmonisation
```
User reviews ClauseGroup →
  ├─ Select existing clause from one contract
  ├─ Accept AI-suggested wording
  └─ Write custom wording
→ All groups done → Playbook status = HARMONISED → Export
```

---

## Free Services

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Supabase](https://supabase.com) | PostgreSQL + storage | 500MB DB, 1GB storage |
| [Groq](https://console.groq.com) | AI analysis (Llama 3.3 70B) | Free tier with daily request limits |
| [Vercel](https://vercel.com) | Hosting | Unlimited personal projects |
| NextAuth v5 | Authentication | Open source |
| Prisma | ORM | Open source |

Set `GROQ_MODEL` to use a different [Groq model](https://console.groq.com/docs/models).

---

## Quick Start

### 1. Install dependencies
```bash
npm install   # also generates the Prisma client (postinstall)
```

### 2. Configure environment
```bash
cp .env.example .env.local
# Fill in DATABASE_URL, AUTH_SECRET, GROQ_API_KEY and the three Supabase keys
```

### 3. Push database schema
```bash
npm run db:push
```

### 4. Run
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Setting Up Supabase

1. [supabase.com](https://supabase.com) → New project
2. **Project Settings → Database → Connection String (URI)** → `DATABASE_URL`
3. **Project Settings → API** → copy `NEXT_PUBLIC_SUPABASE_URL` and anon key

## Getting a Groq API Key

1. [console.groq.com](https://console.groq.com) → API Keys → Create API Key → `GROQ_API_KEY`
2. Uses `llama-3.3-70b-versatile` by default; set `GROQ_MODEL` to change it.

---

## Deploy to Vercel

```bash
npx vercel --prod
```

Set env vars in Vercel Dashboard → Project → Settings → Environment Variables.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create user + organisation |
| `GET` | `/api/playbooks` | List org playbooks |
| `POST` | `/api/playbooks` | Create playbook |
| `GET` | `/api/playbooks/:id` | Get playbook with contracts + clause groups |
| `PATCH` | `/api/playbooks/:id` | Update playbook |
| `DELETE` | `/api/playbooks/:id` | Delete playbook |
| `POST` | `/api/playbooks/:id/contracts` | Upload contracts (multipart/form-data) |
| `DELETE` | `/api/playbooks/:id/contracts?contractId=` | Remove contract |
| `POST` | `/api/playbooks/:id/analyse` | Trigger AI analysis |
| `GET` | `/api/playbooks/:id/analyse` | Poll analysis status |
| `POST` | `/api/playbooks/:id/harmonise` | Save clause group selection |
| `GET` | `/api/playbooks/:id/harmonise` | Get all clause groups |
| `GET` | `/api/playbooks/:id/export` | Download harmonised playbook (.txt) |
| `GET` | `/api/organisation` | Get org + members |
| `PATCH` | `/api/organisation` | Update org name (Admin+) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| UI Primitives | Radix UI (shadcn/ui pattern) |
| Authentication | NextAuth v5 (JWT + credentials) |
| ORM | Prisma 6 |
| Database | PostgreSQL via Supabase |
| AI | Llama 3.3 70B on Groq (groq-sdk) |
| File Parsing | pdf-parse, mammoth |
| File Upload | react-dropzone |
| Deployment | Vercel |

---

## License

MIT — see [LICENSE](LICENSE)
