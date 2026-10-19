export function localToday() {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthStart() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** "2026-10-19" -> "19-10-2026" */
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function fmtWeight(v: number | null | undefined, unit?: string | null) {
  if (v === null || v === undefined) return "—";
  return `${String(v)}${unit ? " " + unit : ""}`;
}

/** Sum without float noise, keeping up to 6 decimals and trimming zeros. */
export function sumWeights(values: (number | null)[]) {
  const s = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  return Number(s.toFixed(6));
}

export function friendlyError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("DEVICE_NOT_AUTHORIZED")) return "This device is no longer authorized. Reload the page.";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
    return "No internet connection. Nothing was saved — please try again.";
  return msg || "Something went wrong.";
}
