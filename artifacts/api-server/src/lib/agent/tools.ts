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

const EDIT_SYSTEM = `You are a CRM edit-patch generator for pharma field reps.
You receive a CURRENT interaction (JSON) and an EDIT REQUEST in natural language.

Return a SMALL JSON PATCH that contains ONLY the fields that change.
Do NOT include unchanged fields. Do NOT echo the entire interaction.

Allowed patch fields:
- hcpName (string)
- interactionType (string)
- interactionDate (string, YYYY-MM-DD)
- interactionTime (string, HH:MM 24-hour)
- attendees (string[])      — replaces the existing list
- topicsDiscussed (string)
- materialsShared (string[]) — replaces the existing list
- samplesDistributed (string[]) — replaces the existing list
- sentiment ("positive" | "neutral" | "negative")
- outcomes (string)
- followUpActions (string)
- aiSummary (string)

For "add X to materials", include the FULL new list = existing + ["X"].
For "remove X from materials", include the full new list with X removed.
For "set sentiment to neutral", include {"sentiment":"neutral"}.

Output ONLY this JSON shape (no prose, no markdown):
{
  "patch": { ...changed fields only... },
  "changeSummary": "<one short sentence describing the change>"
}

Example 1:
CURRENT: {"sentiment":"positive","materialsShared":["Product X brochure"]}
EDIT: "change sentiment to neutral and add Dosing guide"
Output: {"patch":{"sentiment":"neutral","materialsShared":["Product X brochure","Dosing guide"]},"changeSummary":"Set sentiment to neutral and added Dosing guide to materials shared."}

Example 2:
CURRENT: {"followUpActions":"Send PDF"}
EDIT: "also schedule a visit next Tuesday"
Output: {"patch":{"followUpActions":"Send PDF; schedule a visit next Tuesday"},"changeSummary":"Added a Tuesday follow-up visit to the action list."}`;

interface EditPatch {
  patch?: Partial<InteractionDraft>;
  updated?: Partial<InteractionDraft>;
  changeSummary?: string;
}

/**
 * Tool 2 — EditInteractionTool. Applies a natural-language edit to an existing draft.
 * Strategy: ask the LLM only for a small patch (changed fields), then merge it
 * onto the existing draft. Falls back to deterministic heuristics for common
 * edits (sentiment changes, add/remove materials/samples) if the LLM call fails.
 */
export async function editInteractionTool(args: {
  existing: InteractionDraft;
  editRequest: string;
  log?: { warn: (...a: unknown[]) => void; info?: (...a: unknown[]) => void };
}): Promise<{
  updated: InteractionDraft;
  changeSummary: string;
}> {
  const { existing, editRequest, log } = args;
  const trimmed = editRequest.trim();

  if (isGroqEnabled() && trimmed.length > 0) {
    const compact = compactExisting(existing);
    const userPrompt = `CURRENT:\n${JSON.stringify(compact)}\n\nEDIT:\n${trimmed}`;
    try {
      const raw = await callGroq({
        system: EDIT_SYSTEM,
        user: userPrompt,
        temperature: 0.1,
        maxTokens: 512,
        jsonMode: true,
      });
      const parsed = safeParseJson<EditPatch>(raw);
      const patch = parsed?.patch ?? parsed?.updated ?? null;
      if (patch && Object.keys(patch).length > 0) {
        const cleanedPatch = sanitizePatch(patch);
        if (Object.keys(cleanedPatch).length > 0) {
          const updated = applyPatch(existing, cleanedPatch);
          return {
            updated,
            changeSummary:
              parsed?.changeSummary ?? describePatch(cleanedPatch),
          };
        }
      }
      log?.warn?.({ raw }, "edit_interaction_tool: LLM returned no usable patch");
    } catch (err) {
      log?.warn?.({ err }, "edit_interaction_tool: LLM call failed");
    }
  }

  // Deterministic heuristic fallback.
  const heuristic = applyHeuristicEdit(existing, trimmed);
  if (heuristic) {
    return heuristic;
  }

  return {
    updated: existing,
    changeSummary:
      "I couldn't determine the exact edit from that request — please adjust the fields manually.",
  };
}

function compactExisting(d: InteractionDraft): Record<string, unknown> {
  return {
    hcpName: d.hcpName,
    interactionType: d.interactionType,
    interactionDate: d.interactionDate,
    interactionTime: d.interactionTime,
    attendees: d.attendees,
    topicsDiscussed: d.topicsDiscussed,
    materialsShared: d.materialsShared,
    samplesDistributed: d.samplesDistributed,
    sentiment: d.sentiment,
    outcomes: d.outcomes,
    followUpActions: d.followUpActions,
    aiSummary: d.aiSummary,
  };
}

function sanitizePatch(
  patch: Partial<InteractionDraft>,
): Partial<InteractionDraft> {
  const out: Partial<InteractionDraft> = {};
  const allowed: Array<keyof InteractionDraft> = [
    "hcpName",
    "interactionType",
    "interactionDate",
    "interactionTime",
    "attendees",
    "topicsDiscussed",
    "materialsShared",
    "samplesDistributed",
    "sentiment",
    "outcomes",
    "followUpActions",
    "aiSummary",
  ];
  for (const key of allowed) {
    if (!(key in patch)) continue;
    const value = (patch as Record<string, unknown>)[key];
    if (value === null || value === undefined) continue;
    if (key === "sentiment") {
      if (value === "positive" || value === "neutral" || value === "negative") {
        out.sentiment = value;
      }
      continue;
    }
    if (
      key === "attendees" ||
      key === "materialsShared" ||
      key === "samplesDistributed"
    ) {
      if (Array.isArray(value)) {
        const arr = value
          .filter((v): v is string => typeof v === "string" && v.trim() !== "");
        (out as Record<string, unknown>)[key] = arr;
      }
      continue;
    }
    if (typeof value === "string") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function applyPatch(
  base: InteractionDraft,
  patch: Partial<InteractionDraft>,
): InteractionDraft {
  // Use direct assignment so arrays REPLACE (per the system-prompt contract);
  // mergeDraft would skip empty arrays, but the patch sanitizer already filters
  // empty entries, and a deliberate empty array (e.g. "remove all materials")
  // should overwrite.
  const out: InteractionDraft = { ...base };
  for (const key of Object.keys(patch) as Array<keyof InteractionDraft>) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}

function describePatch(patch: Partial<InteractionDraft>): string {
  const parts: string[] = [];
  for (const key of Object.keys(patch)) {
    parts.push(key);
  }
  return `Updated ${parts.join(", ")}.`;
}

/**
 * Cheap deterministic edits for the most common rep requests so the demo never
 * goes silent if the LLM fails: sentiment, add/remove materials, add/remove
 * samples, append follow-up actions.
 */
function applyHeuristicEdit(
  existing: InteractionDraft,
  request: string,
): { updated: InteractionDraft; changeSummary: string } | null {
  if (!request) return null;
  const text = request.toLowerCase();
  const patch: Partial<InteractionDraft> = {};
  const notes: string[] = [];

  // sentiment
  const sentimentMatch = text.match(/sentiment\s+(?:to\s+)?(positive|neutral|negative)/);
  if (sentimentMatch && sentimentMatch[1]) {
    const v = sentimentMatch[1] as "positive" | "neutral" | "negative";
    if (existing.sentiment !== v) {
      patch.sentiment = v;
      notes.push(`set sentiment to ${v}`);
    }
  } else if (/\b(positive)\b/.test(text) && existing.sentiment !== "positive" && /sentiment|mood|tone/.test(text)) {
    patch.sentiment = "positive";
    notes.push("set sentiment to positive");
  } else if (/\b(neutral)\b/.test(text) && existing.sentiment !== "neutral" && /sentiment|mood|tone/.test(text)) {
    patch.sentiment = "neutral";
    notes.push("set sentiment to neutral");
  } else if (/\b(negative)\b/.test(text) && existing.sentiment !== "negative" && /sentiment|mood|tone/.test(text)) {
    patch.sentiment = "negative";
    notes.push("set sentiment to negative");
  }

  // add materials / samples (matches "add X to materials shared", "add X brochure")
  const addMaterialMatch =
    request.match(/add\s+(.+?)\s+(?:to|in|into)\s+materials?(?:\s+shared)?/i) ??
    request.match(/add\s+(.+?\b(?:brochure|pdf|guide|deck|leaflet)\b)/i);
  if (addMaterialMatch && addMaterialMatch[1]) {
    const item = addMaterialMatch[1].trim().replace(/^the\s+/i, "");
    const list = existing.materialsShared ?? [];
    if (!list.some((m) => m.toLowerCase() === item.toLowerCase())) {
      patch.materialsShared = [...list, item];
      notes.push(`added "${item}" to materials shared`);
    }
  }

  const addSampleMatch =
    request.match(/add\s+(.+?)\s+(?:to|in|into)\s+samples?(?:\s+distributed)?/i) ??
    request.match(/add\s+(.+?\bsample(?:\s+pack)?\b)/i);
  if (addSampleMatch && addSampleMatch[1]) {
    const item = addSampleMatch[1].trim().replace(/^the\s+/i, "");
    const list = existing.samplesDistributed ?? [];
    if (!list.some((s) => s.toLowerCase() === item.toLowerCase())) {
      patch.samplesDistributed = [...list, item];
      notes.push(`added "${item}" to samples distributed`);
    }
  }

  // remove from materials
  const removeMaterialMatch = request.match(
    /remove\s+(.+?)\s+from\s+materials?(?:\s+shared)?/i,
  );
  if (removeMaterialMatch && removeMaterialMatch[1]) {
    const item = removeMaterialMatch[1].trim();
    const list = existing.materialsShared ?? [];
    const filtered = list.filter(
      (m) => m.toLowerCase() !== item.toLowerCase(),
    );
    if (filtered.length !== list.length) {
      patch.materialsShared = filtered;
      notes.push(`removed "${item}" from materials shared`);
    }
  }

  // append to follow-up actions
  const followUpMatch = request.match(
    /(?:also\s+)?(?:schedule|set\s+up|book|add|plan)\s+(?:a\s+)?(.+?)(?:\s+(?:as|to)\s+follow[\s-]?up.*)?$/i,
  );
  if (
    !patch.followUpActions &&
    followUpMatch &&
    /follow[\s-]?up/.test(text) &&
    followUpMatch[1]
  ) {
    const action = followUpMatch[1].trim();
    const existingFollowUp = existing.followUpActions ?? "";
    const newFollowUp = existingFollowUp
      ? `${existingFollowUp}; ${action}`
      : action;
    patch.followUpActions = newFollowUp;
    notes.push(`added follow-up action: ${action}`);
  }

  if (Object.keys(patch).length === 0) return null;

  return {
    updated: applyPatch(existing, patch),
    changeSummary: notes.join(", "),
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
