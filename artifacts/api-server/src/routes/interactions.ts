import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  hcpsTable,
  interactionAuditTable,
  interactionsTable,
} from "@workspace/db";
import {
  CreateInteractionBody,
  DeleteInteractionParams,
  GetInteractionParams,
  GetInteractionResponse,
  ListInteractionAuditParams,
  ListInteractionAuditResponse,
  ListInteractionsQueryParams,
  ListInteractionsResponse,
  UpdateInteractionBody,
  UpdateInteractionParams,
  UpdateInteractionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type RawInput = ReturnType<typeof CreateInteractionBody.parse>;

function serialize(row: typeof interactionsTable.$inferSelect) {
  return {
    id: row.id,
    hcpId: row.hcpId,
    hcpName: row.hcpName,
    interactionType: row.interactionType,
    interactionDate: row.interactionDate,
    interactionTime: row.interactionTime,
    attendees: row.attendees ?? [],
    topicsDiscussed: row.topicsDiscussed,
    materialsShared: row.materialsShared ?? [],
    samplesDistributed: row.samplesDistributed ?? [],
    sentiment: row.sentiment,
    outcomes: row.outcomes,
    followUpActions: row.followUpActions,
    aiSummary: row.aiSummary,
    sourceMode: row.sourceMode,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function toDbValues(input: RawInput) {
  return {
    hcpId: input.hcpId ?? null,
    hcpName: input.hcpName ?? null,
    interactionType: input.interactionType ?? null,
    interactionDate: input.interactionDate ?? null,
    interactionTime: input.interactionTime ?? null,
    attendees: input.attendees ?? [],
    topicsDiscussed: input.topicsDiscussed ?? null,
    materialsShared: input.materialsShared ?? [],
    samplesDistributed: input.samplesDistributed ?? [],
    sentiment: input.sentiment ?? null,
    outcomes: input.outcomes ?? null,
    followUpActions: input.followUpActions ?? null,
    aiSummary: input.aiSummary ?? null,
    sourceMode: input.sourceMode ?? null,
  };
}

async function ensureHcpName(input: RawInput): Promise<RawInput> {
  if (!input.hcpName && input.hcpId) {
    const [hcp] = await db
      .select({ name: hcpsTable.name })
      .from(hcpsTable)
      .where(eq(hcpsTable.id, input.hcpId));
    if (hcp) {
      return { ...input, hcpName: hcp.name };
    }
  }
  return input;
}

router.get("/interactions", async (req, res): Promise<void> => {
  const parsed = ListInteractionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { hcpId, limit } = parsed.data;
  const baseSelect = db
    .select()
    .from(interactionsTable);
  const query = hcpId
    ? baseSelect.where(eq(interactionsTable.hcpId, hcpId))
    : baseSelect;

  const rows = await query
    .orderBy(desc(interactionsTable.createdAt))
    .limit(limit ?? 50);

  res.json(ListInteractionsResponse.parse(rows.map(serialize)));
});

router.post("/interactions", async (req, res): Promise<void> => {
  const parsed = CreateInteractionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (
    !parsed.data.hcpName &&
    !parsed.data.hcpId
  ) {
    res.status(400).json({ error: "hcpName or hcpId is required" });
    return;
  }

  const enriched = await ensureHcpName(parsed.data);
  const values = toDbValues(enriched);

  const [row] = await db
    .insert(interactionsTable)
    .values(values)
    .returning();

  if (!row) {
    res.status(500).json({ error: "Failed to create interaction" });
    return;
  }

  await db.insert(interactionAuditTable).values({
    interactionId: row.id,
    actionType: "create",
    changeSummary: `Logged via ${row.sourceMode ?? "form"}`,
  });

  res.status(201).json(GetInteractionResponse.parse(serialize(row)));
});

router.get("/interactions/:id", async (req, res): Promise<void> => {
  const params = GetInteractionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Interaction not found" });
    return;
  }
  res.json(GetInteractionResponse.parse(serialize(row)));
});

router.put("/interactions/:id", async (req, res): Promise<void> => {
  const params = UpdateInteractionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateInteractionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const enriched = await ensureHcpName(parsed.data);
  const values = toDbValues(enriched);

  const [row] = await db
    .update(interactionsTable)
    .set(values)
    .where(eq(interactionsTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Interaction not found" });
    return;
  }

  await db.insert(interactionAuditTable).values({
    interactionId: row.id,
    actionType: "update",
    changeSummary:
      enriched.sourceMode === "edit"
        ? "Updated via AI edit"
        : "Updated manually",
  });

  res.json(UpdateInteractionResponse.parse(serialize(row)));
});

router.delete("/interactions/:id", async (req, res): Promise<void> => {
  const params = DeleteInteractionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(interactionsTable)
    .where(eq(interactionsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Interaction not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/interactions/:id/audit", async (req, res): Promise<void> => {
  const params = ListInteractionAuditParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(interactionAuditTable)
    .where(eq(interactionAuditTable.interactionId, params.data.id))
    .orderBy(desc(interactionAuditTable.createdAt));
  const data = rows.map((row) => ({
    id: row.id,
    interactionId: row.interactionId,
    actionType: row.actionType,
    changeSummary: row.changeSummary,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
  res.json(ListInteractionAuditResponse.parse(data));
});

export default router;
