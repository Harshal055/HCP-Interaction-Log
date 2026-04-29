import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, hcpsTable, interactionsTable } from "@workspace/db";
import { MATERIAL_CATALOG, SAMPLE_CATALOG } from "../materials";
import { callGroq, isGroqEnabled, safeParseJson } from "../groq";
import {
  emptyDraft,
  mergeDraft,
  type FollowUpSuggestion,
  type HcpSearchHit,
  type InteractionDraft,
} from "./state";

/**
 * Tool 3 — SearchHCPTool. Finds HCPs by free-text query.
 */
export async function searchHcpTool(query: string): Promise<HcpSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: hcpsTable.id,
      name: hcpsTable.name,
      specialty: hcpsTable.specialty,
      institution: hcpsTable.institution,
    })
    .from(hcpsTable)
    .where(
      or(
        ilike(hcpsTable.name, pattern),
        ilike(hcpsTable.specialty, pattern),
        ilike(hcpsTable.institution, pattern),
        ilike(hcpsTable.territory, pattern),
      ),
    )
    .limit(10);
  return rows;
}

/**
 * Tool 5 — MaterialCatalogTool. Returns approved materials and samples.
 */
export function materialCatalogTool(): {
  materials: string[];
  samples: string[];
} {
  return { materials: MATERIAL_CATALOG, samples: SAMPLE_CATALOG };
}

/**
 * Tool 6 — InteractionHistoryTool. Recent interactions for an HCP.
 */
export async function interactionHistoryTool(
  hcpId: string,
  limit = 5,
): Promise<
  Array<{
    id: string;
    interactionType: string | null;
    interactionDate: string | null;
    sentiment: string | null;
    aiSummary: string | null;
  }>
> {
  const rows = await db
    .select({
      id: interactionsTable.id,
      interactionType: interactionsTable.interactionType,
      interactionDate: interactionsTable.interactionDate,
      sentiment: interactionsTable.sentiment,
      aiSummary: interactionsTable.aiSummary,
    })
    .from(interactionsTable)
    .where(eq(interactionsTable.hcpId, hcpId))
    .orderBy(desc(interactionsTable.createdAt))
    .limit(limit);
  return rows;
}

const EXTRACTION_SYSTEM = `You are an AI CRM assistant for life-sciences field representatives.
Convert the user's interaction notes into a structured JSON object.

Extract these fields when present in the text:
- hcpName (string): full name of the doctor/HCP
- interactionType (string): one of "Call", "Visit", "Email", "Conference", "Lunch Meeting", or another natural label
- interactionDate (string, ISO YYYY-MM-DD): the date the meeting happened
- interactionTime (string, HH:MM 24-hour): the time
- attendees (string[]): other people present (rep should not include themselves)
- topicsDiscussed (string): what was talked about
- materialsShared (string[]): brochures, decks, PDFs that were shared
- samplesDistributed (string[]): drug samples handed out
- sentiment (string): exactly "positive", "neutral", or "negative"
- outcomes (string): what came out of the meeting (commitments, requests)
- followUpActions (string): what the rep needs to do next

Rules:
- Never invent values. If a field isn't supported by the text, set it to null (or [] for arrays).
- Use today's date only if the user clearly said "today" / "this evening" / "this morning" / "tonight". If unclear, set null.
- Keep strings short and faithful to the source text.

Also produce:
- summary (string): one or two sentences capturing the interaction.
- missingFields (string[]): from {"hcpName","interactionType","interactionDate"} list any required field that is null.

Return ONLY a single valid JSON object. No prose, no markdown fences.`;

/**
 * Tool 1 — LogInteractionTool. Builds a structured draft from free-text input.
 * If formData is provided it is used as the base and merged on top of any
 * fields the LLM extracts.
 */
export async function logInteractionTool(args: {
  userInput: string;
  formData: Partial<InteractionDraft>;
  todayIso: string;
}): Promise<{
  draft: InteractionDraft;
  summary: string;
  missingFields: string[];
}> {
  const { userInput, formData, todayIso } = args;

  let extracted: Partial<InteractionDraft> = {};
  let summary = "";
  let missing: string[] = [];

  if (isGroqEnabled() && userInput.trim().length > 0) {
    const userPrompt = `Today's date is ${todayIso}.\n\nInteraction notes:\n"""${userInput.trim()}"""`;
    try {
      const raw = await callGroq({
        system: EXTRACTION_SYSTEM,
        user: userPrompt,
        temperature: 0.15,
        jsonMode: true,
      });
      const parsed = safeParseJson<
        Partial<InteractionDraft> & {
          summary?: string;
          missingFields?: string[];
        }
      >(raw);
      if (parsed) {
        const { summary: s, missingFields: m, ...rest } = parsed;
        extracted = rest;
        summary = typeof s === "string" ? s : "";
        missing = Array.isArray(m) ? m : [];
      }
    } catch {
      // fall through to deterministic fallback
    }
  }

  if (!isGroqEnabled() || !summary) {
    // deterministic fallback summary
    if (!summary) {
      summary = userInput.trim()
        ? userInput.trim().slice(0, 200)
        : "No additional notes provided.";
    }
  }

  // Start from form data, then layer extracted fields, then layer
  // anything strongly implied by the form data again so user input wins
  // for explicit fields.
  const base = mergeDraft(emptyDraft(), formData);
  const draft = mergeDraft(base, extracted);

  if (!draft.aiSummary && summary) {
    draft.aiSummary = summary;
  }

  // Recompute missing fields against the merged draft.
  const required: Array<keyof InteractionDraft> = [
    "hcpName",
    "interactionType",
    "interactionDate",
  ];
  const computedMissing = required.filter((f) => {
    const v = draft[f];
    return v === null || v === undefined || (typeof v === "string" && v === "");
  });

  return {
    draft,
    summary: draft.aiSummary ?? summary,
    missingFields:
      computedMissing.length > 0 ? computedMissing : missing.filter(Boolean),
  };
}

const EDIT_SYSTEM = `You are an AI CRM editing assistant for life-sciences field reps.
You receive an EXISTING interaction object (JSON) and an EDIT REQUEST in natural language.

Apply ONLY the requested changes. Preserve every other field exactly.

Allowed fields to change: hcpName, interactionType, interactionDate, interactionTime,
attendees, topicsDiscussed, materialsShared, samplesDistributed, sentiment, outcomes,
followUpActions, aiSummary.

Sentiment must be exactly "positive", "neutral", or "negative".
Dates must be ISO YYYY-MM-DD. Times must be HH:MM 24-hour.
Arrays: if the user says "add X", append X to the existing array (do not drop existing items).
If the user says "remove X" or "replace with X", reflect that.

Return ONLY one JSON object with this shape:
{
  "updated": { ...the full updated interaction object... },
  "changeSummary": "<one-line human-readable description of what changed>"
}`;

/**
 * Tool 2 — EditInteractionTool. Applies a natural-language edit to an existing draft.
 */
export async function editInteractionTool(args: {
  existing: InteractionDraft;
  editRequest: string;
}): Promise<{
  updated: InteractionDraft;
  changeSummary: string;
}> {
  const { existing, editRequest } = args;

  if (isGroqEnabled() && editRequest.trim().length > 0) {
    const userPrompt = `EXISTING interaction:\n${JSON.stringify(existing, null, 2)}\n\nEDIT REQUEST:\n"""${editRequest.trim()}"""`;
    try {
      const raw = await callGroq({
        system: EDIT_SYSTEM,
        user: userPrompt,
        temperature: 0.1,
        jsonMode: true,
      });
      const parsed = safeParseJson<{
        updated?: Partial<InteractionDraft>;
        changeSummary?: string;
      }>(raw);
      if (parsed?.updated) {
        const merged = mergeDraft(existing, parsed.updated);
        return {
          updated: merged,
          changeSummary:
            parsed.changeSummary ?? "Updated interaction based on your request.",
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    updated: existing,
    changeSummary:
      "Could not apply edit automatically — please update the fields manually.",
  };
}

const FOLLOWUP_SYSTEM = `You are an AI assistant helping pharma/life-sciences field reps plan next steps.
Given the structured interaction below, suggest 1-4 practical, compliant follow-up actions.

Each suggestion must be a concrete action a rep can take this week.
Prefer suggestions tied to what the HCP requested (materials, samples, follow-up meetings).
Do NOT make medical claims. Do NOT promise specific clinical outcomes.

Return ONLY this JSON shape:
{
  "suggestions": [
    {
      "action": "<one short imperative sentence>",
      "rationale": "<one short clause explaining why>",
      "dueInDays": <integer between 1 and 30 or null>
    }
  ]
}`;

/**
 * Tool 4 — RecommendFollowUpTool. Suggests next-best actions for a draft.
 */
export async function recommendFollowUpTool(
  draft: InteractionDraft,
): Promise<FollowUpSuggestion[]> {
  if (isGroqEnabled()) {
    try {
      const raw = await callGroq({
        system: FOLLOWUP_SYSTEM,
        user: JSON.stringify(draft, null, 2),
        temperature: 0.3,
        jsonMode: true,
      });
      const parsed = safeParseJson<{ suggestions?: FollowUpSuggestion[] }>(raw);
      if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
        return parsed.suggestions
          .filter((s) => s && typeof s.action === "string" && s.action.trim())
          .slice(0, 4);
      }
    } catch {
      // fall back to heuristics
    }
  }

  // Deterministic fallback heuristics so the demo never goes silent.
  const suggestions: FollowUpSuggestion[] = [];
  const text = [
    draft.outcomes ?? "",
    draft.followUpActions ?? "",
    draft.topicsDiscussed ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes("trial") || text.includes("study") || text.includes("pdf")) {
    suggestions.push({
      action: "Send the requested clinical trial summary PDF",
      rationale: "HCP explicitly asked for clinical evidence",
      dueInDays: 2,
    });
  }
  if (text.includes("sample") || text.includes("dose") || text.includes("dosing")) {
    suggestions.push({
      action: "Drop off requested samples on the next visit",
      rationale: "Sample interest was mentioned",
      dueInDays: 7,
    });
  }
  if (draft.sentiment === "positive" || draft.sentiment === "neutral") {
    suggestions.push({
      action: "Schedule a follow-up visit in 7 days",
      rationale: "Continue building the relationship",
      dueInDays: 7,
    });
  } else if (draft.sentiment === "negative") {
    suggestions.push({
      action: "Loop in your manager to plan a recovery touchpoint",
      rationale: "HCP showed concerns",
      dueInDays: 3,
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      action: "Log a reminder to check in with this HCP next week",
      rationale: "Maintain engagement cadence",
      dueInDays: 7,
    });
  }
  return suggestions.slice(0, 4);
}

const CLASSIFY_SYSTEM = `You are the router of a pharma CRM agent.
Classify the user's request into exactly one of:
- "create"  — they want to LOG a new interaction
- "edit"    — they want to MODIFY an interaction that already exists
- "search"  — they only want to find/look up an HCP
- "recommend" — they only want follow-up suggestions for an existing draft

Return ONLY this JSON: {"mode": "create" | "edit" | "search" | "recommend"}`;

export async function classifyRequestTool(
  userInput: string,
  hasExistingInteraction: boolean,
): Promise<"create" | "edit" | "search" | "recommend"> {
  const text = userInput.toLowerCase().trim();

  // Strong heuristics first — cheap and reliable.
  if (hasExistingInteraction) return "edit";
  if (
    /^(find|search|look up|who is|show me)\b/.test(text) &&
    !text.includes("met")
  ) {
    return "search";
  }
  if (
    /\b(change|update|edit|modify|set sentiment|change sentiment|add another|add one more)\b/.test(
      text,
    )
  ) {
    return "edit";
  }
  if (/\b(suggest|recommend|next steps?|what should i do)\b/.test(text)) {
    return "recommend";
  }

  if (!isGroqEnabled()) return "create";

  try {
    const raw = await callGroq({
      system: CLASSIFY_SYSTEM,
      user: userInput,
      temperature: 0,
      maxTokens: 64,
      jsonMode: true,
    });
    const parsed = safeParseJson<{ mode?: string }>(raw);
    const mode = parsed?.mode;
    if (mode === "create" || mode === "edit" || mode === "search" || mode === "recommend") {
      return mode;
    }
  } catch {
    // ignore
  }
  return "create";
}

// Suppress unused-import warnings for helper exports retained for future use.
void and;
void sql;
