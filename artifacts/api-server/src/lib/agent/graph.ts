import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { db, interactionsTable } from "@workspace/db";
import {
  emptyDraft,
  mergeDraft,
  REQUIRED_DRAFT_FIELDS,
  type AgentMode,
  type AgentState,
  type ExistingInteraction,
  type InteractionDraft,
} from "./state";
import {
  classifyRequestTool,
  editInteractionTool,
  logInteractionTool,
  recommendFollowUpTool,
  searchHcpTool,
} from "./tools";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function rowToDraft(row: typeof interactionsTable.$inferSelect): InteractionDraft {
  const sentiment =
    row.sentiment === "positive" ||
    row.sentiment === "neutral" ||
    row.sentiment === "negative"
      ? row.sentiment
      : null;
  const sourceMode =
    row.sourceMode === "form" ||
    row.sourceMode === "chat" ||
    row.sourceMode === "hybrid" ||
    row.sourceMode === "edit"
      ? row.sourceMode
      : null;
  return {
    hcpId: row.hcpId,
    hcpName: row.hcpName,
    interactionType: row.interactionType,
    interactionDate: row.interactionDate,
    interactionTime: row.interactionTime,
    attendees: row.attendees ?? [],
    topicsDiscussed: row.topicsDiscussed,
    materialsShared: row.materialsShared ?? [],
    samplesDistributed: row.samplesDistributed ?? [],
    sentiment,
    outcomes: row.outcomes,
    followUpActions: row.followUpActions,
    aiSummary: row.aiSummary,
    sourceMode,
  };
}

async function loadExistingInteraction(
  id: string,
): Promise<ExistingInteraction | null> {
  const [row] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));
  if (!row) return null;
  return { id: row.id, draft: rowToDraft(row) };
}

/* ============================================================
   LangGraph-style nodes — each node mutates state and returns it
   ============================================================ */

async function nodeClassifyRequest(state: AgentState): Promise<AgentState> {
  if (state.modeRequested !== "auto") {
    state.mode = state.modeRequested;
  } else {
    state.mode = await classifyRequestTool(
      state.userInput,
      state.existingInteractionId !== null,
    );
  }
  state.toolTrace.push(`classify_request → ${state.mode}`);
  return state;
}

async function nodeLoadExistingInteraction(
  state: AgentState,
): Promise<AgentState> {
  if (!state.existingInteractionId) return state;
  const existing = await loadExistingInteraction(state.existingInteractionId);
  if (existing) {
    state.existingInteraction = existing;
    state.toolTrace.push("load_existing_interaction");
  }
  return state;
}

async function nodeSearchHcp(state: AgentState): Promise<AgentState> {
  const explicitName = state.formData.hcpName ?? null;
  const text = state.userInput.toLowerCase();
  const drMatch = state.userInput.match(/\bdr\.?\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)?)/i);
  let query = explicitName ?? "";
  if (!query && drMatch) query = drMatch[1] ?? "";
  if (!query && state.mode === "search") {
    query = state.userInput;
  }
  query = query.trim();
  if (!query) return state;

  if (text.length === 0 && !explicitName) return state;

  const hits = await searchHcpTool(query);
  state.hcpMatches = hits;
  if (hits.length > 0) {
    state.toolTrace.push(`search_hcp("${query}") → ${hits.length} match(es)`);
    if (!state.selectedHcp) state.selectedHcp = hits[0] ?? null;
  } else {
    state.toolTrace.push(`search_hcp("${query}") → no matches`);
  }
  return state;
}

async function nodeExtractInteraction(state: AgentState): Promise<AgentState> {
  const { draft, summary, missingFields } = await logInteractionTool({
    userInput: state.userInput,
    formData: state.formData,
    todayIso: isoToday(),
  });
  state.draft = draft;
  state.summary = summary;
  state.missingFields = missingFields;
  state.toolTrace.push("log_interaction_tool");
  return state;
}

async function nodeApplyEdit(state: AgentState): Promise<AgentState> {
  const base =
    state.existingInteraction?.draft ??
    mergeDraft(emptyDraft(), state.formData);
  const { updated, changeSummary } = await editInteractionTool({
    existing: base,
    editRequest: state.userInput,
    log: state.log,
  });
  state.draft = updated;
  state.changeSummary = changeSummary;
  state.toolTrace.push("edit_interaction_tool");
  return state;
}

async function nodeValidateRequiredFields(
  state: AgentState,
): Promise<AgentState> {
  if (!state.draft) return state;
  const missing = REQUIRED_DRAFT_FIELDS.filter((f) => {
    const v = state.draft?.[f];
    return v === null || v === undefined || (typeof v === "string" && v === "");
  });
  state.missingFields = missing;
  if (missing.length > 0) {
    state.toolTrace.push(`validate_required_fields → missing: ${missing.join(", ")}`);
  } else {
    state.toolTrace.push("validate_required_fields → ok");
  }
  return state;
}

async function nodeEnrichWithFollowUp(state: AgentState): Promise<AgentState> {
  if (!state.draft) return state;
  state.followUpSuggestions = await recommendFollowUpTool(state.draft);
  state.toolTrace.push(
    `recommend_followup_tool → ${state.followUpSuggestions.length} suggestion(s)`,
  );
  return state;
}

async function nodeReturnDraft(state: AgentState): Promise<AgentState> {
  // attach selected HCP back into the draft if the agent resolved it
  if (state.draft && state.selectedHcp && !state.draft.hcpId) {
    state.draft.hcpId = state.selectedHcp.id;
    if (!state.draft.hcpName) state.draft.hcpName = state.selectedHcp.name;
  }
  if (state.draft && !state.draft.sourceMode) {
    state.draft.sourceMode = state.mode === "edit" ? "edit" : "chat";
  }
  state.assistantMessage = composeAssistantMessage(state);
  state.toolTrace.push("return_draft");
  return state;
}

function composeAssistantMessage(state: AgentState): string {
  if (state.mode === "search") {
    if (state.hcpMatches.length === 0) {
      return "I couldn't find any HCPs matching that. Try a different name, specialty, or institution.";
    }
    const names = state.hcpMatches
      .slice(0, 3)
      .map((h) => `${h.name}${h.specialty ? ` (${h.specialty})` : ""}`)
      .join(", ");
    return `I found ${state.hcpMatches.length} HCP${state.hcpMatches.length === 1 ? "" : "s"}: ${names}.`;
  }
  if (state.mode === "edit") {
    return state.changeSummary ?? "I've prepared the requested update — review and confirm.";
  }
  if (state.mode === "recommend" && state.followUpSuggestions.length > 0) {
    return `Here are ${state.followUpSuggestions.length} follow-up suggestions you can apply.`;
  }
  // create
  if (state.missingFields.length > 0) {
    return `Drafted the interaction. Please confirm: ${state.missingFields.join(", ")}.`;
  }
  return "Drafted the interaction — review the preview and save when ready.";
}

/* ============================================================
   Graph: linear edges with conditional branching, mirroring the
   LangGraph node pattern in the spec.
        START
          → classify_request
          → if edit:  load_existing_interaction → apply_edit
            elif search: search_hcp → return_draft (early)
            elif recommend: enrich_with_followup → return_draft
            else (create): search_hcp → extract_interaction
          → validate_required_fields
          → enrich_with_followup
          → return_draft
        END
   ============================================================ */

interface RunArgs {
  modeRequested: "auto" | AgentMode;
  userInput: string;
  formData: Partial<InteractionDraft>;
  existingInteractionId: string | null;
  log: Logger;
}

export async function runAgent(args: RunArgs): Promise<AgentState> {
  const state: AgentState = {
    mode: "create",
    modeRequested: args.modeRequested,
    userInput: args.userInput,
    formData: args.formData,
    existingInteractionId: args.existingInteractionId,
    existingInteraction: null,
    draft: null,
    selectedHcp: null,
    hcpMatches: [],
    missingFields: [],
    followUpSuggestions: [],
    toolTrace: [],
    summary: null,
    changeSummary: null,
    assistantMessage: "",
    log: args.log,
  };

  await nodeClassifyRequest(state);

  if (state.mode === "edit") {
    await nodeLoadExistingInteraction(state);
    await nodeApplyEdit(state);
    await nodeValidateRequiredFields(state);
    await nodeEnrichWithFollowUp(state);
    await nodeReturnDraft(state);
    return state;
  }

  if (state.mode === "search") {
    await nodeSearchHcp(state);
    await nodeReturnDraft(state);
    return state;
  }

  if (state.mode === "recommend") {
    if (Object.keys(state.formData).length > 0) {
      state.draft = mergeDraft(emptyDraft(), state.formData);
    }
    await nodeEnrichWithFollowUp(state);
    await nodeReturnDraft(state);
    return state;
  }

  // create (default)
  await nodeSearchHcp(state);
  await nodeExtractInteraction(state);
  await nodeValidateRequiredFields(state);
  await nodeEnrichWithFollowUp(state);
  await nodeReturnDraft(state);
  return state;
}
