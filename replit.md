# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run seed:crm` — reseed the CRM demo data (HCPs + interactions)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- **api-server** — Express 5 + Drizzle backend on `/api`. Houses the LangGraph-style agent under `src/lib/agent/` (state.ts, tools.ts, graph.ts) plus routes for hcps, interactions (with audit log), materials, agent (chat + draft), and dashboard.
- **crm** — React + Vite + Redux Toolkit frontend (the AI-First HCP CRM) at `/`. Uses generated React Query hooks from `@workspace/api-client-react` and Redux slices under `src/features/` for form draft, AI chat history, and selected HCP. The `/log` page is the centerpiece (form on the left, AI assistant on the right). The form is the source of truth — only AI-driven updates flow from redux back into the form via a one-way `form.reset` effect (mirroring keystrokes back into redux causes an infinite render loop, so don't add it).
- **mockup-sandbox** — Component preview server.

## Agent

- LLM: Groq `gemma2-9b-it` via `groq-sdk`, called from `artifacts/api-server/src/lib/groq.ts`. JSON-mode with `safeParseJson` fallback. Falls back to deterministic heuristics when `GROQ_API_KEY` is absent or the call fails.
- Five tools: LogInteraction, EditInteraction, SearchHCP, RecommendFollowUp, MaterialCatalog (+ a small classify_request router and InteractionHistory helper).
- Graph nodes (linear with conditional branching): classify_request → (load_existing_interaction + apply_edit) | search_hcp | (search_hcp + extract_interaction) → validate_required_fields → enrich_with_followup → return_draft.
- The `agentChat` operationId is preserved as-is so generated zod's `AgentChatResponse` does not collide with anything; the OpenAPI component schema is named `AgentResult`.
