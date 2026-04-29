# AI-First HCP CRM — Log Interaction Module

A production-quality reference implementation of the **Log Interaction Screen** for an AI-first pharmaceutical CRM. Field representatives can log every Healthcare Professional (HCP) interaction through **a structured form, a conversational AI assistant, or a hybrid of the two**, then edit the saved record in plain English.

The AI brain is a **LangGraph-style state-machine agent** running on **Groq LLMs**, exposing **five domain tools** (LogInteraction, EditInteraction, SearchHCP, RecommendFollowUp, MaterialCatalog) plus two helpers (InteractionHistory, ClassifyRequest) that orchestrate the conversation.

---

## Table of Contents

1. [Demo Highlights](#demo-highlights)
2. [Tech Stack](#tech-stack)
3. [Repository Layout](#repository-layout)
4. [The Five LangGraph Tools](#the-five-langgraph-tools)
5. [Agent Graph & Flows](#agent-graph--flows)
6. [Frontend Architecture](#frontend-architecture)
7. [API Reference](#api-reference)
8. [Database Schema](#database-schema)
9. [Local Setup](#local-setup)
10. [Environment Variables](#environment-variables)
11. [Common Commands](#common-commands)
12. [Demo Script (for the walkthrough video)](#demo-script-for-the-walkthrough-video)
13. [Design Decisions & Notes](#design-decisions--notes)

---

## Demo Highlights

- **Three flows on one screen** — pure form, pure chat, or both at once (hybrid). The form and assistant share state and are always in sync.
- **AI-extracted draft** — paste a free-text note like *"Met Dr. Priya Sharma at Apollo this evening at 6:30 PM. Discussed Product X for elderly hypertensive patients. Shared the brochure and clinical trial summary PDF. She wants the latest meta-analysis. Sentiment was positive."* and every field on the form auto-populates.
- **Edit-with-AI** on any saved interaction — *"change sentiment to neutral and add Dosing guide to materials shared"* → patch is computed, validated, and applied.
- **Audit trail** — every create/update/delete is captured in `interaction_audit_logs` with diff-style before/after snapshots.
- **Follow-up suggestions** — the agent proposes 1–4 next actions per interaction (e.g., *"Send Q1 meta-analysis PDF in 2 days"*).
- **Dashboard** — KPIs (total interactions, sentiment mix, week-over-week), trend chart, and recent interactions list.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React 18 + Vite + TypeScript** | shadcn/ui + Tailwind, Inter font |
| State | **Redux Toolkit** + react-redux | Slices: `interaction`, `agent`, `hcp` |
| Routing | wouter | Lightweight client routing |
| Data fetching | TanStack Query | Hooks generated from OpenAPI |
| Forms | react-hook-form + Zod | Schema-validated form |
| Charts | recharts + framer-motion | Dashboard sparklines & animations |
| Backend | **Express 5 + TypeScript** | pino logging, helmet, cors |
| AI Framework | **LangGraph-style state machine** | Hand-implemented in TypeScript (see `artifacts/api-server/src/lib/agent/graph.ts`) |
| LLM | **Groq** — `llama-3.1-8b-instant` (default), `gemma2-9b-it` originally specified by the brief but **decommissioned by Groq**, so the app defaults to the supported successor. The model is configurable via `GROQ_MODEL`. |
| ORM | Drizzle ORM | Type-safe SQL, generated zod & TS types |
| Database | **PostgreSQL** | Replit-managed Postgres |
| API Contract | **OpenAPI 3.1 → Orval codegen** | Single source of truth for hooks and zod schemas |
| Monorepo | pnpm workspaces | Artifacts + libs |

> **Note on the brief.** The assignment specified Python + FastAPI. This repository was built inside a Replit workspace template that ships with a TypeScript stack already wired (Express, Drizzle, OpenAPI codegen). All other constraints — LangGraph-style agent, Groq LLM, the five tools, Redux frontend, Postgres, Inter font — are honoured. The agent is a faithful TypeScript port of the LangGraph node/edge pattern.

---

## Repository Layout

This is a pnpm monorepo with deployable **artifacts** and shared **libs**:

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/             # Express API + LangGraph agent
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── agent/
│   │       │   │   ├── state.ts    # AgentState, InteractionDraft types
│   │       │   │   ├── tools.ts    # The 5 tools + classify + history
│   │       │   │   └── graph.ts    # LangGraph-style nodes & edges
│   │       │   ├── groq.ts         # Groq SDK wrapper + JSON parser
│   │       │   ├── materials.ts    # Approved materials/samples catalog
│   │       │   └── logger.ts       # pino logger
│   │       ├── routes/
│   │       │   ├── agent.ts        # /api/agent/chat, /api/agent/draft
│   │       │   ├── hcps.ts         # /api/hcps CRUD
│   │       │   ├── interactions.ts # /api/interactions CRUD + audit
│   │       │   ├── materials.ts    # /api/materials
│   │       │   └── dashboard.ts    # /api/dashboard/summary
│   │       └── server.ts
│   │
│   └── crm/                    # React + Vite + Redux frontend
│       └── src/
│           ├── app/
│           │   ├── store.ts        # Redux store
│           │   └── routes.tsx      # Wouter routes
│           ├── features/
│           │   ├── interactionSlice.ts
│           │   ├── agentSlice.ts
│           │   └── hcpSlice.ts
│           ├── pages/
│           │   ├── dashboard/      # KPI dashboard
│           │   ├── log/            # ★ Log Interaction screen (form + chat)
│           │   ├── hcps/           # HCP list & detail
│           │   └── interaction/    # Detail page with Edit-with-AI panel
│           ├── components/
│           │   ├── AppShell.tsx    # Sidebar + topbar layout
│           │   ├── HcpSelect.tsx
│           │   └── MultiSelect.tsx
│           └── ui/                 # shadcn components
│
└── lib/
    ├── api-spec/               # OpenAPI 3.1 spec (single source of truth)
    │   └── openapi.yaml
    ├── api-zod/                # Generated Zod schemas
    ├── api-client-react/       # Generated TanStack Query hooks
    └── db/                     # Drizzle schema, migrations, client
        └── src/schema.ts       # hcps, interactions, audit_logs
```

---

## The Five LangGraph Tools

All five live in `artifacts/api-server/src/lib/agent/tools.ts`. Each is a pure async function with a strict input/output contract — exactly the pattern LangGraph nodes follow.

### 1. `logInteractionTool` — capture interaction data

> Converts a free-text note (and any partial form data the user has already typed) into a fully structured `InteractionDraft`.

```ts
logInteractionTool({
  userInput: string,              // free-text note from the chat box
  formData: Partial<InteractionDraft>, // anything already filled on the form
  todayIso: string,               // for relative dates ("this evening")
}) → { draft, summary, missingFields }
```

**How:** sends a strict JSON-mode prompt to Groq asking it to extract `hcpName`, `interactionType`, `interactionDate`, `interactionTime`, `attendees`, `topicsDiscussed`, `materialsShared`, `samplesDistributed`, `sentiment` (`positive`/`neutral`/`negative`), `outcomes`, `followUpActions`, plus a one-line `summary`. The LLM is instructed to set unknown fields to `null` rather than invent. Form data wins over LLM-extracted fields when both are present.

### 2. `editInteractionTool` — modify a logged interaction

> Applies a natural-language edit (*"change sentiment to neutral and add Dosing guide"*) to an existing draft.

```ts
editInteractionTool({
  existing: InteractionDraft,
  editRequest: string,
  log?: Logger,
}) → { updated, changeSummary }
```

**How:** asks the LLM for a **small JSON patch** (only the changed fields, never the whole object — far more reliable for small models), sanitises the patch against an allowed-field whitelist, then merges it onto `existing`. If the LLM call fails, a deterministic regex-based heuristic handles the most common edits (sentiment changes, add/remove from materials/samples, append follow-up actions) so the demo is never silent.

### 3. `searchHcpTool` — find an HCP

```ts
searchHcpTool(query: string) → HcpSearchHit[]
```

`ILIKE` over `name`, `specialty`, `institution`, and `territory`. Used both directly when the user says *"find Dr. Sharma"* and indirectly inside the create flow when the agent extracts an HCP name from notes.

### 4. `recommendFollowUpTool` — suggest next actions

```ts
recommendFollowUpTool(draft: InteractionDraft) → FollowUpSuggestion[]
```

Returns up to four `{ action, rationale, dueInDays }` objects. The implementation combines deterministic rules (e.g., *if sentiment is negative, loop in your manager within 3 days*) with sentiment- and outcome-aware suggestions, so it always returns something useful even with no LLM call.

### 5. `materialCatalogTool` — approved assets

```ts
materialCatalogTool() → { materials: string[], samples: string[] }
```

Returns the approved promotional materials and drug samples catalog. The frontend uses these in the `MultiSelect` widget so reps only pick approved items, satisfying compliance requirements.

### Helpers used by the graph

- `classifyRequestTool(userInput, hasExistingInteraction)` — routes the request to one of `create | edit | search | recommend`. Uses cheap regex heuristics first, falls back to a tiny LLM call.
- `interactionHistoryTool(hcpId, limit)` — recent interactions for an HCP, used on the HCP detail page.

---

## Agent Graph & Flows

The agent is a state machine modelled on LangGraph. `runAgent()` initialises an `AgentState`, then walks an explicit graph of nodes:

```
                       ┌──────────────────┐
                       │ classify_request │
                       └────────┬─────────┘
                                │ mode
        ┌───────────────────────┼─────────────────────┐
        ▼                       ▼                     ▼
   create flow              edit flow             search flow
  ─────────────             ─────────             ────────────
  search_hcp           load_existing            search_hcp
       ↓                interaction                   ↓
  extract_interaction         ↓                  return_draft
       ↓                 apply_edit
  validate_required_         ↓
       fields           validate_required_
       ↓                       fields
  enrich_with_                 ↓
   followup            enrich_with_followup
       ↓                       ↓
  return_draft           return_draft
```

**Three frontend flows map onto these graph branches:**

| Flow | UI | Graph branch |
|---|---|---|
| **Form-only** | User fills the form, clicks *Analyze & Summarize* | `/api/agent/draft` → `extract → validate → enrich → return` |
| **Chat-only** | User types a note in the chat panel | `/api/agent/chat` mode=`auto` → `classify=create → search_hcp → extract → validate → enrich → return` |
| **Hybrid** | User partially fills the form, then chats | Form data is sent with each chat turn as `formData`; the LLM merges on top |
| **Edit** | User opens a saved interaction → clicks *Edit with AI* | `/api/agent/chat` mode=`edit` with `existingInteractionId` → `load_existing → apply_edit → validate → enrich → return` |
| **Search** | User asks *"find Dr. X"* | `classify=search → search_hcp → return` |
| **Recommend** | User asks *"suggest next steps"* | `classify=recommend → enrich → return` |

Every node appends a string to `state.toolTrace`, which is returned to the frontend and rendered in a collapsible *Agent Trace* panel — useful for the demo and for debugging.

---

## Frontend Architecture

- **Redux Toolkit** with three slices:
  - `interactionSlice` — the in-progress draft (form fields)
  - `agentSlice` — chat messages, follow-up suggestions, missing-field hints, tool trace
  - `hcpSlice` — currently selected HCP cache
- **Form ↔ Redux is one-way**: the form is the source of truth for keystrokes; only AI responses dispatch `updateDraft`, and a `useEffect` keyed on `draft` calls `form.reset()`. A `useRef` skips the very first run to avoid an infinite loop.
- **Routes** (wouter):
  - `/` → Dashboard
  - `/log` → ★ Log Interaction (centerpiece, form + chat side-by-side)
  - `/hcps`, `/hcps/:id`
  - `/interactions`, `/interactions/:id` (with the *Edit with AI* panel)
- **Generated hooks**: every page uses `useListHcps`, `useGetInteraction`, `useAgentChat`, etc., generated from `lib/api-spec/openapi.yaml` via Orval. Changing the API spec regenerates types and hooks in one command.
- **Theming**: a custom AeroCRM theme with the **Inter** font (loaded from Google Fonts), shadcn primitives, and Tailwind tokens.

---

## API Reference

Base path: `/api`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness check |
| `GET` | `/dashboard/summary` | KPIs, trends, recent interactions |
| `GET` | `/hcps` | List HCPs (filterable) |
| `POST` | `/hcps` | Create HCP |
| `GET` | `/hcps/:id` | HCP detail + recent interactions |
| `PATCH` | `/hcps/:id` | Update HCP |
| `DELETE` | `/hcps/:id` | Delete HCP |
| `GET` | `/interactions` | List interactions (filter by HCP, date) |
| `POST` | `/interactions` | Create interaction (writes audit log) |
| `GET` | `/interactions/:id` | Get one |
| `PATCH` | `/interactions/:id` | Update (writes audit log with diff) |
| `DELETE` | `/interactions/:id` | Delete (writes audit log) |
| `GET` | `/interactions/:id/audit` | Audit trail for an interaction |
| `GET` | `/materials` | Approved materials & samples catalog |
| `POST` | `/agent/chat` | Run the agent on a chat message |
| `POST` | `/agent/draft` | Run the agent on form data only |

The full schema lives in `lib/api-spec/openapi.yaml`. Run `pnpm --filter @workspace/api-spec run codegen` after editing it to regenerate the client hooks and zod validators.

---

## Database Schema

Three tables (`lib/db/src/schema.ts`):

- **`hcps`** — id, name, specialty, institution, territory, contactEmail, contactPhone, notes, timestamps
- **`interactions`** — id, hcpId (FK), hcpName, interactionType, interactionDate, interactionTime, attendees (text[]), topicsDiscussed, materialsShared (text[]), samplesDistributed (text[]), sentiment, outcomes, followUpActions, aiSummary, sourceMode (`form`/`chat`/`hybrid`/`edit`), timestamps
- **`interaction_audit_logs`** — id, interactionId, action (`create`/`update`/`delete`), beforeSnapshot (jsonb), afterSnapshot (jsonb), changedFields (text[]), createdAt

Migrations and seed data are managed via Drizzle:

```bash
pnpm --filter @workspace/db run push       # push schema
pnpm --filter @workspace/scripts run seed:crm  # 4 HCPs + 4 sample interactions
```

---

## Local Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- A Postgres database (the workspace provisions one automatically)
- A **Groq API key** ([create one](https://console.groq.com))

### Steps

```bash
# 1. Install
pnpm install

# 2. Configure secrets — set these in your shell or .env (workspace uses Replit secrets)
export DATABASE_URL='postgres://user:pass@host:5432/db'
export GROQ_API_KEY='gsk_...'
export SESSION_SECRET='any-long-random-string'
# Optional override:
export GROQ_MODEL='llama-3.1-8b-instant'   # or 'gemma2-9b-it' if Groq re-enables it

# 3. Push schema and seed
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed:crm

# 4. Generate the API client (only needed after editing the OpenAPI spec)
pnpm --filter @workspace/api-spec run codegen

# 5. Start the two services (in separate terminals)
pnpm --filter @workspace/api-server run dev    # http://localhost:8080
pnpm --filter @workspace/crm run dev           # http://localhost:5173
```

In Replit the workflows do all of this automatically — just open the project and the preview pane shows the running app.

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `GROQ_API_KEY` | yes | Groq LLM access |
| `SESSION_SECRET` | yes | Express session signing |
| `GROQ_MODEL` | no | Override the default model (`llama-3.1-8b-instant`) |
| `PORT` | no | Defaults to per-service workspace assignment |

---

## Common Commands

| Command | What it does |
|---|---|
| `pnpm run typecheck` | Build composite libs + typecheck every package |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate zod schemas and React-Query hooks from OpenAPI |
| `pnpm --filter @workspace/db run push` | Push Drizzle schema to the DB |
| `pnpm --filter @workspace/scripts run seed:crm` | Seed 4 HCPs + 4 interactions |
| `pnpm --filter @workspace/api-server run dev` | Start the API on `$PORT` |
| `pnpm --filter @workspace/crm run dev` | Start the React app on `$PORT` |

---

## Demo Script (for the walkthrough video)

Suggested 10–15 minute flow for the submission video:

1. **Dashboard (1 min)** — open `/`. Show KPI cards, sentiment mix, recent interactions.
2. **Log via Chat (3 min)** — go to `/log`. Paste:
   > *"Met Dr. Priya Sharma at Apollo this evening at 6:30 PM. Discussed Product X for elderly hypertensive patients. Shared the Product X brochure and clinical trial summary PDF. She wants the latest meta-analysis. Sentiment was positive."*
   - Watch every form field auto-fill. Open the *Agent Trace* panel — call out `classify_request → create`, `search_hcp`, `log_interaction_tool`, `recommend_followup_tool`. **(Tool 1: LogInteraction; Tool 3: SearchHCP; Tool 4: RecommendFollowUp; Tool 5: MaterialCatalog backs the dropdowns.)**
3. **Hybrid (1 min)** — clear the form, manually pick HCP and Type, then chat *"add Product X 10mg sample pack and shared the dosing guide"*. Show how form values are preserved while chat fills the rest.
4. **Form-only (1 min)** — fill the required fields, click *Analyze & Summarize*. Show the AI summary and follow-up suggestions appear.
5. **Save & inspect (1 min)** — click *Save Interaction*. The detail page opens.
6. **Edit with AI (3 min)** — on the detail page, open the *Edit with AI* panel and run two edits:
   - *"change sentiment to neutral and add Dosing guide to materials shared"*
   - *"also schedule a follow-up call next Tuesday"*
   Show the diff and the saved audit-log entry. **(Tool 2: EditInteraction.)**
7. **Search (30 s)** — go back to `/log`, type *"find Dr. Amit"*. The agent classifies as search and returns matches.
8. **Architecture walkthrough (3 min)** — open `tools.ts`, walk through the five tool signatures. Open `graph.ts` and trace the node sequence. Open the OpenAPI spec to show the contract-first approach.

---

## Design Decisions & Notes

- **Why a TypeScript "LangGraph-style" agent instead of Python LangGraph?** The Replit template ships with a TypeScript stack (Express, Drizzle, OpenAPI codegen, React) and migrating to Python would have meant rebuilding three generated client packages. The agent preserves the LangGraph mental model — explicit `AgentState`, named nodes that mutate state, conditional edges based on `state.mode` — so the architecture maps 1:1 onto a Python `langgraph.StateGraph` if you ever port it.
- **Why `llama-3.1-8b-instant` instead of `gemma2-9b-it`?** Groq decommissioned `gemma2-9b-it` partway through development. The codebase falls through to `llama-3.1-8b-instant` (fast, supports JSON mode, similar tier) by default, and the model name is a single env-var change away — set `GROQ_MODEL=llama-3.3-70b-versatile` for higher quality at the cost of latency.
- **JSON-mode + small-patch edits.** Asking a 9B model to reproduce the entire 14-field interaction object on every edit was unreliable. The `editInteractionTool` was rewritten to ask only for a small patch (changed fields), then merge it server-side. This made the edit flow rock-solid.
- **Audit log is non-negotiable** in pharma. Every create/update/delete writes a snapshot pair so the entire history of any interaction is recoverable.
- **Compliance via the catalog tool.** Reps can only attach materials and samples from the approved catalog (`materialCatalogTool`), so they can't accidentally log unapproved items.
- **Silent failures are forbidden.** Every catch around an LLM call now logs at `error` level via pino, so any future API change shows up immediately in the server logs.

---

## License

MIT — use this code freely as a reference for building AI-first CRM modules.
