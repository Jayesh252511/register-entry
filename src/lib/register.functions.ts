import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireDevice } from "./access.functions";
import { admin } from "./device.server";

export type Entry = {
  id: string;
  register_serial_no: number;
  entry_date: string;
  bill_no: string;
  maal_diya: string;
  maal_liya: string;
  weight_value: number | null;
  weight_unit: string | null;
  vehicle_no: string;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id,register_serial_no,entry_date,bill_no,maal_diya,maal_liya,weight_value,weight_unit,vehicle_no,created_at,updated_at";

const filterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bill: z.string().max(50).optional(),
  party: z.string().max(100).optional(),
  vehicle: z.string().max(50).optional(),
});
export type Filters = z.infer<typeof filterSchema>;

const clean = (s?: string) => (s ?? "").replace(/[%,()*\\]/g, "").trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: Filters) {
  q = q.is("archived_at", null);
  if (f.from) q = q.gte("entry_date", f.from);
  if (f.to) q = q.lte("entry_date", f.to);
  const bill = clean(f.bill);
  if (bill) q = q.ilike("bill_no", `%${bill}%`);
  const veh = clean(f.vehicle);
  if (veh) q = q.ilike("vehicle_no", `%${veh}%`);
  const party = clean(f.party);
  if (party) q = q.or(`maal_diya.ilike.%${party}%,maal_liya.ilike.%${party}%`);
  return q;
}

const entrySchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  bill_no: z.string().trim().min(1, "Bill No. is required").max(50),
  maal_diya: z.string().trim().min(1, "माल दिया is required").max(200),
  maal_liya: z.string().trim().min(1, "माल लिया is required").max(200),
  weight_value: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "वजन must be a number")
    .optional(),
  vehicle_no: z.string().trim().min(1, "गाड़ी नं. is required").max(50),
});

function dbError(msg: string) {
  const m = msg.match(/DUPLICATE_BILL:(.*)/);
  if (m) return new Error(`Bill No. ${(m[1] ?? "").trim()} is already used. Please choose a different number.`);
  if (msg.includes("NOT_FOUND")) return new Error("This entry no longer exists.");
  return new Error("Could not save. Please try again.");
}

export const getNextBill = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .handler(async () => {
    const db = await admin();
    const { data, error } = await db.from("app_settings").select("*").eq("id", 1).single();
    if (error) throw new Error(error.message);
    return {
      nextBill: String(data.next_bill_number),
      nextSerial: data.next_register_serial as number,
      unit: data.default_weight_unit,
      businessName: data.business_display_name,
    };
  });

export const createEntry = createServerFn({ method: "POST" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) => entrySchema.extend({ request_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row, error } = await db.rpc("create_entry", {
      p_entry_date: data.entry_date,
      p_bill_no: data.bill_no,
      p_maal_diya: data.maal_diya,
      p_maal_liya: data.maal_liya,
      p_weight_value: (data.weight_value ? data.weight_value : null) as unknown as number,
      p_vehicle_no: data.vehicle_no,
      p_client_request_id: data.request_id,
      p_device_id: context.deviceId,
    });
    if (error) throw dbError(error.message);
    return row as unknown as Entry;
  });

export const updateEntry = createServerFn({ method: "POST" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) => entrySchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row, error } = await db.rpc("update_entry", {
      p_id: data.id,
      p_entry_date: data.entry_date,
      p_bill_no: data.bill_no,
      p_maal_diya: data.maal_diya,
      p_maal_liya: data.maal_liya,
      p_weight_value: (data.weight_value ? data.weight_value : null) as unknown as number,
      p_vehicle_no: data.vehicle_no,
      p_device_id: context.deviceId,
    });
    if (error) throw dbError(error.message);
    return row as unknown as Entry;
  });

export const getEntry = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: entry, error } = await db
      .from("transport_entries")
      .select(COLS)
      .eq("id", data.id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!entry) return { entry: null, previous: null, history: [] };
    const [{ data: prev }, { data: history }] = await Promise.all([
      db
        .from("transport_entries")
        .select(COLS)
        .is("archived_at", null)
        .lt("register_serial_no", entry.register_serial_no)
        .order("register_serial_no", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("audit_log")
        .select("id,action,changed_at,old_values,new_values")
        .eq("entry_id", data.id)
        .order("changed_at", { ascending: false })
        .limit(20),
    ]);
    return {
      entry: entry as Entry,
      previous: (prev as Entry | null) ?? null,
      history: (history ?? []) as {
        id: string;
        action: string;
        changed_at: string;
        old_values: { [k: string]: string | number | null } | null;
        new_values: { [k: string]: string | number | null } | null;
      }[],
    };
  });

export const listEntries = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) =>
    filterSchema
      .extend({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(5).max(100).default(25) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const fromIdx = (data.page - 1) * data.pageSize;
    const q = applyFilters(db.from("transport_entries").select(COLS, { count: "exact" }), data)
      .order("register_serial_no", { ascending: false })
      .range(fromIdx, fromIdx + data.pageSize - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Entry[], total: (count ?? 0) as number };
  });

/** All matching rows (paged internally) — used for exports, print and reports. */
export const exportEntries = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) => filterSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const out: Entry[] = [];
    const size = 1000;
    for (let i = 0; ; i += size) {
      const { data: rows, error } = await applyFilters(db.from("transport_entries").select(COLS), data)
        .order("register_serial_no", { ascending: true })
        .range(i, i + size - 1);
      if (error) throw new Error(error.message);
      out.push(...((rows ?? []) as Entry[]));
      if (!rows || rows.length < size) break;
    }
    return out;
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) =>
    z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), monthStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const base = () => db.from("transport_entries").select("id", { count: "exact", head: true }).is("archived_at", null);
    const [total, today, month, recent, settings, monthRows] = await Promise.all([
      base(),
      base().eq("entry_date", data.today),
      base().gte("entry_date", data.monthStart).lte("entry_date", data.today),
      db.from("transport_entries").select(COLS).is("archived_at", null).order("register_serial_no", { ascending: false }).limit(5),
      db.from("app_settings").select("*").eq("id", 1).single(),
      db
        .from("transport_entries")
        .select("weight_value,weight_unit")
        .is("archived_at", null)
        .gte("entry_date", data.monthStart)
        .lte("entry_date", data.today)
        .not("weight_value", "is", null)
        .limit(10000),
    ]);
    const units = new Set((monthRows.data ?? []).map((r) => r.weight_unit ?? ""));
    const monthWeight =
      units.size <= 1 ? (monthRows.data ?? []).reduce((s, r) => s + Number(r.weight_value ?? 0), 0) : null;
    return {
      total: total.count ?? 0,
      today: today.count ?? 0,
      month: month.count ?? 0,
      monthWeight,
      unit: [...units][0] || settings.data?.default_weight_unit || "MT",
      recent: (recent.data ?? []) as Entry[],
      nextBill: String(settings.data?.next_bill_number ?? ""),
    };
  });

export const getSuggestions = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .handler(async () => {
    const db = await admin();
    const { data } = await db
      .from("transport_entries")
      .select("maal_diya,maal_liya,vehicle_no")
      .is("archived_at", null)
      .order("register_serial_no", { ascending: false })
      .limit(500);
    const uniq = (k: "maal_diya" | "maal_liya" | "vehicle_no") => [...new Set((data ?? []).map((r) => r[k]))].slice(0, 100);
    return { maal_diya: uniq("maal_diya"), maal_liya: uniq("maal_liya"), vehicle_no: uniq("vehicle_no") };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) =>
    z
      .object({
        business_display_name: z.string().trim().min(1).max(80),
        next_bill_number: z.number().int().min(1).max(1e12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: old } = await db.from("app_settings").select("*").eq("id", 1).single();
    const { data: dup } = await db
      .from("transport_entries")
      .select("id")
      .eq("bill_no", String(data.next_bill_number))
      .is("archived_at", null)
      .maybeSingle();
    if (dup) throw new Error(`Bill No. ${data.next_bill_number} is already used. Choose a higher number.`);
    const { error } = await db
      .from("app_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error("Could not save settings.");
    await db.from("audit_log").insert({
      action: "settings_update",
      actor_reference: `device:${context.deviceId}`,
      old_values: old,
      new_values: data,
    });
    return { ok: true };
  });

/** Rows changed since a timestamp (incl. archived) + settings, for device sync. */
export const pullChanges = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) => z.object({ since: z.string().max(40).nullable() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const out: (Entry & { archived_at: string | null })[] = [];
    for (let i = 0; ; i += 1000) {
      let q = db.from("transport_entries").select(COLS + ",archived_at");
      if (data.since) q = q.gte("updated_at", data.since);
      const { data: rows, error } = await q.order("updated_at", { ascending: true }).range(i, i + 999);
      if (error) throw new Error(error.message);
      out.push(...((rows ?? []) as unknown as (Entry & { archived_at: string | null })[]));
      if (!rows || rows.length < 1000) break;
    }
    const { data: s } = await db.from("app_settings").select("*").eq("id", 1).single();
    return {
      rows: out,
      nextBill: String(s?.next_bill_number ?? "168"),
      unit: s?.default_weight_unit ?? "MT",
      businessName: s?.business_display_name ?? "Transport Register",
    };
  });
