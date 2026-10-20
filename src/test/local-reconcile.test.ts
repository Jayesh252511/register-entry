import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  meta: { nextBill: "367", lastPull: "2026-10-20T10:04:26Z" },
  pull: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("idb", () => ({ openDB: async () => ({
  getAll: async () => [...mocks.rows.values()],
  get: async () => mocks.meta,
  put: async (store: string, row: Record<string, unknown>) => {
    if (store === "entries") mocks.rows.set(String(row.id), row);
  },
  delete: async (_store: string, id: string) => { mocks.rows.delete(id); },
}) }));
vi.mock("../lib/register.functions", () => ({
  pullChanges: mocks.pull, createEntry: mocks.create,
  updateEntry: mocks.update, setCancelled: mocks.cancel,
}));
const row = (id: string, serial: number, bill: string) => ({
  id, register_serial_no: serial, bill_no: bill, entry_date: "2026-10-19",
  maal_diya: "Saved party", maal_liya: "", weight_value: 21.26,
  weight_unit: "MT", vehicle_no: "MH46AR4053",
  created_at: "2026-10-19T10:00:00Z", updated_at: "2026-10-20T10:04:01Z",
});
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mocks.rows.clear();
  mocks.pull.mockResolvedValue({ rows: [row("corrected", 180, "180")], nextBill: "181", unit: "MT", businessName: "Transport Register" });
});
it("removes orphaned synced imports and replaces old 366/181 numbering with 180/180", async () => {
  mocks.rows.set("orphan", row("orphan", 181, "366"));
  mocks.rows.set("corrected", row("corrected", 181, "366"));
  const store = await import("../lib/local-store");
  await store.initStore(); await store.sync();
  expect(mocks.pull).toHaveBeenCalledWith({ data: { since: null } });
  expect(store.getState().entries).toHaveLength(1);
  expect(store.getState().entries[0]).toMatchObject({ register_serial_no: 180, bill_no: "180" });
  expect(store.suggestNextBill()).toBe("181");
  expect(mocks.rows.has("orphan")).toBe(false);
});
it("keeps unsynced work when a full refresh removes stale copies", async () => {
  mocks.rows.set("pending", { ...row("pending", 181, "181"), _pending: "update" });
  mocks.rows.set("cancel", { ...row("cancel", 182, "182"), _cancel: true });
  mocks.update.mockRejectedValue(new Error("Save must be reviewed"));
  mocks.cancel.mockRejectedValue(new Error("Cancellation must be reviewed"));
  const store = await import("../lib/local-store");
  await store.initStore(); await store.sync();
  expect(store.getState().entries.map((r) => r.id)).toContain("pending");
  expect(store.getState().entries.map((r) => r.id)).toContain("cancel");
  expect(mocks.rows.has("pending")).toBe(true);
  expect(mocks.rows.has("cancel")).toBe(true);
});