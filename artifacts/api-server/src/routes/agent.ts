import { Router, type IRouter } from "express";
import {
  AgentChatBody,
  AgentChatResponse,
  AgentDraftFromFormBody,
  AgentDraftFromFormResponse,
} from "@workspace/api-zod";
import { runAgent } from "../lib/agent/graph";
import { logInteractionTool, recommendFollowUpTool } from "../lib/agent/tools";
import { emptyDraft, mergeDraft } from "../lib/agent/state";

const router: IRouter = Router();

router.post("/agent/chat", async (req, res): Promise<void> => {
  const parsed = AgentChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const state = await runAgent({
    modeRequested: body.mode ?? "auto",
    userInput: body.message ?? "",
    formData: (body.formData ?? {}) as Record<string, unknown>,
    existingInteractionId: body.existingInteractionId ?? null,
    log: req.log,
  });

  const responsePayload = {
    mode: state.mode,
    draft: state.draft ?? null,
    existingInteraction: state.existingInteraction
      ? {
          id: state.existingInteraction.id,
          ...state.existingInteraction.draft,
          attendees: state.existingInteraction.draft.attendees ?? [],
          materialsShared: state.existingInteraction.draft.materialsShared ?? [],
          samplesDistributed:
            state.existingInteraction.draft.samplesDistributed ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null,
    missingFields: state.missingFields,
    followUpSuggestions: state.followUpSuggestions,
    hcpMatches: state.hcpMatches,
    summary: state.summary,
    toolTrace: state.toolTrace,
    assistantMessage: state.assistantMessage,
    changeSummary: state.changeSummary,
  };

  res.json(AgentChatResponse.parse(responsePayload));
});

router.post("/agent/draft", async (req, res): Promise<void> => {
  const parsed = AgentDraftFromFormBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const formData = parsed.data;

  const seedText = [
    formData.topicsDiscussed,
    formData.outcomes,
    formData.followUpActions,
  ]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n");

  const { draft, summary, missingFields } = await logInteractionTool({
    userInput: seedText,
    formData: mergeDraft(emptyDraft(), formData as Record<string, unknown>),
    todayIso: new Date().toISOString().slice(0, 10),
  });

  const followUpSuggestions = await recommendFollowUpTool(draft);
  draft.sourceMode = draft.sourceMode ?? "form";

  const data = {
    draft,
    summary,
    missingFields,
    followUpSuggestions,
    toolTrace: ["log_interaction_tool", "recommend_followup_tool"],
  };

  res.json(AgentDraftFromFormResponse.parse(data));
});

export default router;
