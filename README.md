# Sightstone — Contract Playbook Harmonisation Platform

> AI-powered platform for legal teams to harmonise contract playbooks across their organisation. Upload multiple contracts, extract and compare clauses by contractual effect, identify overlaps, and produce a single unified playbook — powered by Claude AI.

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
│           │ Prisma ORM       │ Anthropic SDK      │ File parsing         │
│  ┌────────▼──────┐  ┌────────▼────────┐  ┌───────▼──────────────┐      │
│  │  PostgreSQL   │  │  Claude API     │  │  pdf-parse / mammoth  │      │
│  │  (Supabase)   │  │  claude-3-5-    │  │   (text extraction)   │      │
│  │  FREE tier    │  │  haiku model    │  │  Runs server-side     │      │
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

## AI Pipeline

### Step 1 — Clause Extraction
```
Contract raw text → Claude claude-3-5-haiku
→ Extract all clauses (clauseType, contractualEffect, riskLevel, position)
→ Clause records saved to DB
```

### Step 2 — Clause Grouping & Comparison
```
Clauses grouped by clauseType across contracts
→ If 2+ clauses in group → Claude compares them:
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
| [Anthropic Claude](https://console.anthropic.com) | AI analysis | Pay-per-use (~$0.01/contract) |
| [Vercel](https://vercel.com) | Hosting | Unlimited personal projects |
| NextAuth v5 | Authentication | Open source |
| Prisma | ORM | Open source |

**Free AI alternative**: [Groq API](https://console.groq.com) — 14,400 req/day free with llama-3.1-70b. Update `src/lib/ai.ts` to use Groq SDK.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env.local
# Fill in DATABASE_URL, AUTH_SECRET, ANTHROPIC_API_KEY
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

## Getting Anthropic API Key

1. [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key
2. Uses `claude-3-5-haiku-20241022` — ~$0.0008/1K tokens. 10-page contract < $0.01.

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
| AI | Anthropic Claude (claude-3-5-haiku) |
| File Parsing | pdf-parse, mammoth |
| File Upload | react-dropzone |
| Deployment | Vercel |

---

## License

MIT — see [LICENSE](LICENSE)
