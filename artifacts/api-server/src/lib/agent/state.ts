import type { Logger } from "pino";

export type AgentMode = "create" | "edit" | "search" | "recommend";

export interface InteractionDraft {
  hcpId: string | null;
  hcpName: string | null;
  interactionType: string | null;
  interactionDate: string | null;
  interactionTime: string | null;
  attendees: string[];
  topicsDiscussed: string | null;
  materialsShared: string[];
  samplesDistributed: string[];
  sentiment: "positive" | "neutral" | "negative" | null;
  outcomes: string | null;
  followUpActions: string | null;
  aiSummary: string | null;
  sourceMode: "form" | "chat" | "hybrid" | "edit" | null;
}

export interface FollowUpSuggestion {
  action: string;
  rationale?: string | null;
  dueInDays?: number | null;
}

export interface HcpSearchHit {
  id: string;
  name: string;
  specialty?: string | null;
  institution?: string | null;
}

export interface ExistingInteraction {
  id: string;
  draft: InteractionDraft;
}

export interface AgentState {
  mode: AgentMode;
  modeRequested: "auto" | AgentMode;
  userInput: string;
  formData: Partial<InteractionDraft>;
  existingInteractionId: string | null;
  existingInteraction: ExistingInteraction | null;
  draft: InteractionDraft | null;
  selectedHcp: HcpSearchHit | null;
  hcpMatches: HcpSearchHit[];
  missingFields: string[];
  followUpSuggestions: FollowUpSuggestion[];
  toolTrace: string[];
  summary: string | null;
  changeSummary: string | null;
  assistantMessage: string;
  log: Logger;
}

export const REQUIRED_DRAFT_FIELDS: Array<keyof InteractionDraft> = [
  "hcpName",
  "interactionType",
  "interactionDate",
];

export function emptyDraft(): InteractionDraft {
  return {
    hcpId: null,
    hcpName: null,
    interactionType: null,
    interactionDate: null,
    interactionTime: null,
    attendees: [],
    topicsDiscussed: null,
    materialsShared: [],
    samplesDistributed: [],
    sentiment: null,
    outcomes: null,
    followUpActions: null,
    aiSummary: null,
    sourceMode: null,
  };
}

export function mergeDraft(
  base: InteractionDraft,
  patch: Partial<InteractionDraft>,
): InteractionDraft {
  const out: InteractionDraft = { ...base };
  for (const key of Object.keys(patch) as Array<keyof InteractionDraft>) {
    const value = patch[key];
    if (value === undefined) continue;
    const target = out as unknown as Record<string, unknown>;
    if (Array.isArray(value)) {
      // arrays: replace if non-empty, otherwise keep
      if (value.length > 0) {
        target[key] = value;
      }
      continue;
    }
    if (value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    target[key] = value;
  }
  return out;
}
