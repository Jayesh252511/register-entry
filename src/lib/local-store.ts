/**
 * Local-first register store. All screens read from this in-memory copy
 * (persisted in IndexedDB), so the app is instant and works offline.
 * Changes are queued as "pending" and pushed to the server by sync().
 */
import { openDB, type IDBPDatabase } from "idb";
import { useSyncExternalStore } from "react";
import type { Entry } from "./register.functions";

export type LocalEntry = Omit<Entry, "register_serial_no"> & {
  register_serial_no: number | null;
  archived_at?: string | null | undefined;
  _pending?: "create" | "update" | undefined;
  _error?: string | undefined;
};

type Meta = { nextBill: string; unit: string; businessName: string; lastPull: string | null };

type State = {
  ready: boolean;
  entries: LocalEntry[]; // active only, sorted newest first
  meta: Meta;
  online: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  syncError: string | null;
};

const DEFAULT_META: Meta = { nextBill: "168", unit: "MT", businessName: "Transport Register", lastPull: null };

let state: State = {
  ready: false,
  entries: [],
  meta: DEFAULT_META,
  online: true,
  syncing: false,
  lastSyncAt: null,
  syncError: null,
};
const all = new Map<string, LocalEntry>();
const listeners = new Set<() => void>();
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp)
    dbp = openDB("transport-register", 1, {
      upgrade(d) {
        d.createObjectStore("entries", { keyPath: "id" });
        d.createObjectStore("meta");
      },
    });
  return dbp;
}

/** Order key: synced by serial, pending after them in creation order. */
export function orderKey(e: LocalEntry) {
  return e.register_serial_no ?? 1e12 + new Date(e.created_at).getTime();
}

function emit(patch: Partial<State> = {}) {
  const entries = [...all.values()].filter((e) => !e.archived_at).sort((a, b) => orderKey(b) - orderKey(a));
  state = { ...state, ...patch, entries };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_STATE: State = { ...state };
export function useRegister() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}
export function getState() {
  return state;
}

let started = false;
export async function initStore() {
  if (started || typeof window === "undefined") return;
  started = true;
  const d = await db();
  const [rows, meta] = await Promise.all([d.getAll("entries"), d.get("meta", "meta")]);
  rows.forEach((r: LocalEntry) => all.set(r.id, r));
  state.meta = { ...DEFAULT_META, ...(meta ?? {}) };
  emit({ ready: true, online: navigator.onLine });
  window.addEventListener("online", () => {
    emit({ online: true });
    void sync();
  });
  window.addEventListener("offline", () => emit({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  setInterval(() => void sync(), 30_000);
  void sync();
}

async function put(e: LocalEntry) {
  all.set(e.id, e);
  await (await db()).put("entries", e);
}

async function saveMeta(m: Partial<Meta>) {
  state.meta = { ...state.meta, ...m };
  await (await db()).put("meta", state.meta, "meta");
}

/** Suggested next Bill No.: never below the server's, never reuses a local number. */
export function suggestNextBill() {
  let n = Number(state.meta.nextBill) || 168;
  for (const e of all.values()) {
    if (!e.archived_at && /^\d{1,15}$/.test(e.bill_no)) n = Math.max(n, Number(e.bill_no) + 1);
  }
  return String(n);
}

export function findDuplicateBill(bill: string, exceptId?: string) {
  const b = bill.trim();
  if (!b) return null;
  for (const e of all.values()) if (!e.archived_at && e.id !== exceptId && e.bill_no === b) return e;
  return null;
}

export function getEntryLocal(id: string) {
  return all.get(id) ?? null;
}

export function previousOf(e: LocalEntry) {
  const k = orderKey(e);
  return state.entries.find((x) => orderKey(x) < k) ?? null;
}

export type EntryInput = {
  entry_date: string;
  bill_no: string;
  maal_diya: string;
  maal_liya: string;
  weight_value: string;
  vehicle_no: string;
};

function clean(v: EntryInput) {
  return {
    entry_date: v.entry_date || null,
    bill_no: v.bill_no.trim(),
    maal_diya: v.maal_diya.trim(),
    maal_liya: v.maal_liya.trim(),
    weight_value: v.weight_value.trim() === "" ? null : Number(v.weight_value.trim()),
    vehicle_no: v.vehicle_no.trim(),
  };
}

export async function addEntry(v: EntryInput) {
  const now = new Date().toISOString();
  const c = clean(v);
  const e: LocalEntry = {
    id: crypto.randomUUID(),
    register_serial_no: null,
    ...c,
    weight_unit: c.weight_value === null ? null : state.meta.unit,
    created_at: now,
    updated_at: now,
    _pending: "create",
  };
  await put(e);
  emit();
  void sync();
  return e;
}

export async function editEntry(id: string, v: EntryInput) {
  const old = all.get(id);
  if (!old) throw new Error("This entry no longer exists.");
  const c = clean(v);
  const e: LocalEntry = {
    ...old,
    ...c,
    weight_unit: c.weight_value === null ? null : old.weight_unit ?? state.meta.unit,
    updated_at: new Date().toISOString(),
    _pending: old._pending === "create" ? "create" : "update",
    _error: undefined,
  };
  await put(e);
  emit();
  void sync();
  return e;
}

let syncing: Promise<void> | null = null;
export function sync() {
  if (!started || typeof navigator === "undefined" || !navigator.onLine) return Promise.resolve();
  if (!syncing) syncing = doSync().finally(() => (syncing = null));
  return syncing;
}

async function doSync() {
  emit({ syncing: true });
  const { createEntry, updateEntry, pullChanges } = await import("./register.functions");
  try {
    // 1. push pending changes, oldest first
    const pending = [...all.values()]
      .filter((e) => e._pending)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const e of pending) {
      const payload = {
        entry_date: e.entry_date ?? "",
        bill_no: e.bill_no,
        maal_diya: e.maal_diya,
        maal_liya: e.maal_liya,
        weight_value: e.weight_value === null ? "" : String(e.weight_value),
        vehicle_no: e.vehicle_no,
      };
      try {
        const saved =
          e._pending === "create"
            ? await createEntry({ data: { ...payload, request_id: e.id } })
            : await updateEntry({ data: { ...payload, id: e.id } });
        const cur = all.get(e.id);
        // if edited again while sending, keep the newer local change pending
        if (cur && cur.updated_at !== e.updated_at) {
          await put({ ...cur, register_serial_no: saved.register_serial_no, _pending: "update" });
        } else {
          await put({ ...saved });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("DEVICE_NOT_AUTHORIZED")) throw err;
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) throw err;
        await put({ ...e, _error: msg });
      }
      emit();
    }
    // 2. pull everything changed on the server
    const res = await pullChanges({ data: { since: state.meta.lastPull } });
    let maxTs = state.meta.lastPull;
    for (const r of res.rows) {
      const local = all.get(r.id);
      if (!local?._pending) await put(r as LocalEntry);
      else if (local.register_serial_no === null) await put({ ...local, register_serial_no: r.register_serial_no });
      if (!maxTs || r.updated_at > maxTs) maxTs = r.updated_at;
    }
    await saveMeta({ nextBill: res.nextBill, unit: res.unit, businessName: res.businessName, lastPull: maxTs });
    emit({ syncing: false, lastSyncAt: Date.now(), syncError: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("DEVICE_NOT_AUTHORIZED")) {
      await wipeLocal();
      window.location.reload();
      return;
    }
    emit({ syncing: false, syncError: "Could not reach the server. Will retry automatically." });
  }
}

export async function wipeLocal() {
  const d = await db();
  await d.clear("entries");
  await d.clear("meta");
  all.clear();
  try {
    localStorage.removeItem("tr_authorized");
  } catch {
    /* ignore */
  }
}

export function pendingCount() {
  return state.entries.filter((e) => e._pending).length;
}
