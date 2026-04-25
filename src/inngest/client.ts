// ─────────────────────────────────────────────────────────────────────────────
// Inngest stub — Chunk E removed Inngest in favour of direct webhooks + cron.
// This stub preserves the import surface for legacy callers without pulling
// the runtime dependency. All `inngest.send()` calls are no-ops and return
// resolved promises.
//
// Migration path for any remaining callers:
//   • Campaign generation dispatch → call /api/generations/create directly
//   • Image approval side-effects  → handled inline in /api/approvals/[id]
//                                    (Chunk E new approval workflow)
// ─────────────────────────────────────────────────────────────────────────────

export type GenerationCreatedEvent = {
  name: "generation/created";
  data: { generation_id: string };
};

export type GenerationApprovedEvent = {
  name: "generation/approved";
  data: { generation_id: string };
};

export type GenerationRejectedEvent = {
  name: "generation/rejected";
  data: { generation_id: string };
};

export type FaiceoffEvent =
  | GenerationCreatedEvent
  | GenerationApprovedEvent
  | GenerationRejectedEvent
  | { name: string; data?: Record<string, unknown> };

interface InngestStub {
  send(payload: FaiceoffEvent | FaiceoffEvent[]): Promise<{ ids: string[] }>;
}

export const inngest: InngestStub = {
  async send(payload) {
    if (process.env.NODE_ENV !== "test") {
      const events = Array.isArray(payload) ? payload : [payload];
      for (const evt of events) {
        console.warn(
          `[inngest-stub] Dropped event '${evt.name}' — Inngest removed in Chunk E.`,
        );
      }
    }
    return { ids: [] };
  },
};
