import {
  db,
  hcpsTable,
  interactionAuditTable,
  interactionsTable,
} from "@workspace/db";

async function main(): Promise<void> {
  console.log("Clearing existing CRM data…");
  await db.delete(interactionAuditTable);
  await db.delete(interactionsTable);
  await db.delete(hcpsTable);

  console.log("Inserting HCPs…");
  const insertedHcps = await db
    .insert(hcpsTable)
    .values([
      {
        name: "Dr. Priya Sharma",
        specialty: "Cardiology",
        institution: "Apollo Hospital",
        territory: "Mumbai West",
        email: "priya.sharma@apollo.example",
        phone: "+91 90000 11122",
      },
      {
        name: "Dr. Amit Rao",
        specialty: "Endocrinology",
        institution: "Fortis Hospital",
        territory: "Mumbai West",
        email: "amit.rao@fortis.example",
        phone: "+91 90000 33344",
      },
      {
        name: "Dr. Neha Iyer",
        specialty: "Diabetology",
        institution: "Lilavati Hospital",
        territory: "Mumbai West",
        email: "neha.iyer@lilavati.example",
        phone: "+91 90000 55566",
      },
      {
        name: "Dr. Rohit Verma",
        specialty: "General Physician",
        institution: "Kokilaben Hospital",
        territory: "Mumbai North",
        email: "rohit.verma@kdah.example",
        phone: "+91 90000 77788",
      },
    ])
    .returning();

  const priya = insertedHcps.find((h) => h.name === "Dr. Priya Sharma")!;
  const amit = insertedHcps.find((h) => h.name === "Dr. Amit Rao")!;
  const neha = insertedHcps.find((h) => h.name === "Dr. Neha Iyer")!;

  console.log("Inserting sample interactions…");
  const today = new Date();
  const isoDays = (n: number): string =>
    new Date(today.getTime() - n * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const inserted = await db
    .insert(interactionsTable)
    .values([
      {
        hcpId: priya.id,
        hcpName: priya.name,
        interactionType: "Visit",
        interactionDate: isoDays(1),
        interactionTime: "18:30",
        attendees: ["Dr. Priya Sharma"],
        topicsDiscussed:
          "Discussed Product X efficacy in elderly hypertensive patients and reviewed recent clinical data.",
        materialsShared: ["Product X brochure", "Clinical trial summary PDF"],
        samplesDistributed: ["Product X 10mg sample pack"],
        sentiment: "positive",
        outcomes:
          "Dr. Sharma was impressed by the safety profile and asked for the latest meta-analysis PDF.",
        followUpActions:
          "Send Q1 meta-analysis PDF and schedule a follow-up visit next week.",
        aiSummary:
          "Productive evening visit at Apollo. Dr. Sharma is interested in Product X for elderly hypertensive patients and requested follow-up materials.",
        sourceMode: "hybrid",
      },
      {
        hcpId: amit.id,
        hcpName: amit.name,
        interactionType: "Lunch Meeting",
        interactionDate: isoDays(3),
        interactionTime: "13:00",
        attendees: ["Dr. Amit Rao", "Dr. Suresh Patel"],
        topicsDiscussed:
          "Reviewed Product Y dosing strategies for type-2 diabetes patients and answered safety questions.",
        materialsShared: ["Product Y brochure", "Dosing guide"],
        samplesDistributed: ["Product Y 50mg sample pack"],
        sentiment: "neutral",
        outcomes:
          "Dr. Rao wants more real-world evidence before changing prescribing patterns.",
        followUpActions:
          "Share real-world evidence summary and arrange a peer-to-peer call.",
        aiSummary:
          "Lunch meeting at Fortis. Dr. Rao is open but cautious — wants real-world evidence before prescribing.",
        sourceMode: "form",
      },
      {
        hcpId: neha.id,
        hcpName: neha.name,
        interactionType: "Call",
        interactionDate: isoDays(5),
        interactionTime: "10:15",
        attendees: ["Dr. Neha Iyer"],
        topicsDiscussed:
          "Quick call to confirm receipt of patient education leaflets and answer dosing questions.",
        materialsShared: ["Patient education leaflet"],
        samplesDistributed: [],
        sentiment: "positive",
        outcomes: "Materials well received. No concerns raised.",
        followUpActions: "Check in again in two weeks.",
        aiSummary:
          "Short positive check-in call. Dr. Iyer confirmed receipt of patient leaflets.",
        sourceMode: "chat",
      },
      {
        hcpId: priya.id,
        hcpName: priya.name,
        interactionType: "Email",
        interactionDate: isoDays(8),
        interactionTime: "09:00",
        attendees: ["Dr. Priya Sharma"],
        topicsDiscussed:
          "Email follow-up sharing the requested clinical trial summary PDF.",
        materialsShared: ["Clinical trial summary PDF"],
        samplesDistributed: [],
        sentiment: "positive",
        outcomes: "Acknowledged with thanks.",
        followUpActions: "Plan in-person visit next week to discuss further.",
        aiSummary:
          "Sent requested clinical trial summary. Acknowledged with thanks.",
        sourceMode: "form",
      },
    ])
    .returning();

  console.log(`Inserted ${inserted.length} interactions.`);

  await db.insert(interactionAuditTable).values(
    inserted.map((row) => ({
      interactionId: row.id,
      actionType: "create",
      changeSummary: `Seeded via ${row.sourceMode ?? "form"}`,
    })),
  );

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
