import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, hcpsTable, interactionsTable } from "@workspace/db";
import {
  GetHcpParams,
  GetHcpResponse,
  ListHcpsQueryParams,
  ListHcpsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

interface HcpRow {
  id: string;
  name: string;
  specialty: string | null;
  institution: string | null;
  territory: string | null;
  email: string | null;
  phone: string | null;
  lastInteractionAt: Date | null;
  interactionCount: number;
}

async function buildHcpRows(filter?: string): Promise<HcpRow[]> {
  const lastInteractionAt = sql<Date | null>`MAX(${interactionsTable.createdAt})`;
  const interactionCount = sql<number>`COUNT(${interactionsTable.id})::int`;

  const baseSelect = db
    .select({
      id: hcpsTable.id,
      name: hcpsTable.name,
      specialty: hcpsTable.specialty,
      institution: hcpsTable.institution,
      territory: hcpsTable.territory,
      email: hcpsTable.email,
      phone: hcpsTable.phone,
      lastInteractionAt,
      interactionCount,
    })
    .from(hcpsTable)
    .leftJoin(interactionsTable, eq(interactionsTable.hcpId, hcpsTable.id));

  const query =
    filter && filter.trim().length > 0
      ? baseSelect.where(
          or(
            ilike(hcpsTable.name, `%${filter}%`),
            ilike(hcpsTable.specialty, `%${filter}%`),
            ilike(hcpsTable.institution, `%${filter}%`),
            ilike(hcpsTable.territory, `%${filter}%`),
          ),
        )
      : baseSelect;

  const rows = await query
    .groupBy(hcpsTable.id)
    .orderBy(hcpsTable.name);
  return rows;
}

router.get("/hcps", async (req, res): Promise<void> => {
  const parsed = ListHcpsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await buildHcpRows(parsed.data.q);
  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    specialty: r.specialty,
    institution: r.institution,
    territory: r.territory,
    email: r.email,
    phone: r.phone,
    lastInteractionAt: r.lastInteractionAt
      ? new Date(r.lastInteractionAt).toISOString()
      : null,
    interactionCount: r.interactionCount,
  }));
  res.json(ListHcpsResponse.parse(data));
});

router.get("/hcps/:id", async (req, res): Promise<void> => {
  const params = GetHcpParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [hcp] = await db
    .select()
    .from(hcpsTable)
    .where(eq(hcpsTable.id, params.data.id));

  if (!hcp) {
    res.status(404).json({ error: "HCP not found" });
    return;
  }

  const stats = await db
    .select({
      lastInteractionAt: sql<Date | null>`MAX(${interactionsTable.createdAt})`,
      interactionCount: sql<number>`COUNT(${interactionsTable.id})::int`,
    })
    .from(interactionsTable)
    .where(eq(interactionsTable.hcpId, hcp.id));

  const recent = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.hcpId, hcp.id))
    .orderBy(desc(interactionsTable.createdAt))
    .limit(10);

  const recentInteractions = recent.map((row) => ({
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
  }));

  const data = {
    id: hcp.id,
    name: hcp.name,
    specialty: hcp.specialty,
    institution: hcp.institution,
    territory: hcp.territory,
    email: hcp.email,
    phone: hcp.phone,
    lastInteractionAt: stats[0]?.lastInteractionAt
      ? new Date(stats[0].lastInteractionAt).toISOString()
      : null,
    interactionCount: stats[0]?.interactionCount ?? 0,
    recentInteractions,
  };

  res.json(GetHcpResponse.parse(data));
});

void and; // keep import for future filter combinations

export default router;
