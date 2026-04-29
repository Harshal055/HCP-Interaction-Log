import { Router, type IRouter } from "express";
import { desc, eq, gte, sql, isNotNull } from "drizzle-orm";
import { db, hcpsTable, interactionsTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalsRow] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
    })
    .from(interactionsTable);

  const [weekRow] = await db
    .select({ week: sql<number>`COUNT(*)::int` })
    .from(interactionsTable)
    .where(gte(interactionsTable.createdAt, sevenDaysAgo));

  const [hcpsRow] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(hcpsTable);

  const [pendingRow] = await db
    .select({ pending: sql<number>`COUNT(*)::int` })
    .from(interactionsTable)
    .where(isNotNull(interactionsTable.followUpActions));

  const sentimentRows = await db
    .select({
      sentiment: interactionsTable.sentiment,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(interactionsTable)
    .groupBy(interactionsTable.sentiment);

  const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
  for (const row of sentimentRows) {
    if (
      row.sentiment === "positive" ||
      row.sentiment === "neutral" ||
      row.sentiment === "negative"
    ) {
      sentimentBreakdown[row.sentiment] = row.n;
    }
  }

  const topHcpRows = await db
    .select({
      id: hcpsTable.id,
      name: hcpsTable.name,
      specialty: hcpsTable.specialty,
      institution: hcpsTable.institution,
      territory: hcpsTable.territory,
      email: hcpsTable.email,
      phone: hcpsTable.phone,
      lastInteractionAt: sql<Date | null>`MAX(${interactionsTable.createdAt})`,
      interactionCount: sql<number>`COUNT(${interactionsTable.id})::int`,
    })
    .from(hcpsTable)
    .leftJoin(interactionsTable, eq(interactionsTable.hcpId, hcpsTable.id))
    .groupBy(hcpsTable.id)
    .orderBy(desc(sql`COUNT(${interactionsTable.id})`))
    .limit(5);

  const recentRows = await db
    .select({
      id: interactionsTable.id,
      hcpName: interactionsTable.hcpName,
      summary: interactionsTable.aiSummary,
      sentiment: interactionsTable.sentiment,
      createdAt: interactionsTable.createdAt,
    })
    .from(interactionsTable)
    .orderBy(desc(interactionsTable.createdAt))
    .limit(8);

  const data = {
    totalInteractions: totalsRow?.total ?? 0,
    weekInteractions: weekRow?.week ?? 0,
    totalHcps: hcpsRow?.total ?? 0,
    pendingFollowUps: pendingRow?.pending ?? 0,
    sentimentBreakdown,
    topHcps: topHcpRows.map((h) => ({
      id: h.id,
      name: h.name,
      specialty: h.specialty,
      institution: h.institution,
      territory: h.territory,
      email: h.email,
      phone: h.phone,
      lastInteractionAt: h.lastInteractionAt
        ? new Date(h.lastInteractionAt).toISOString()
        : null,
      interactionCount: h.interactionCount,
    })),
    recentActivity: recentRows.map((r) => ({
      id: r.id,
      hcpName: r.hcpName,
      summary: r.summary,
      sentiment: r.sentiment,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  };

  res.json(GetDashboardSummaryResponse.parse(data));
});

export default router;
