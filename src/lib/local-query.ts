import type { LocalEntry } from "./local-store";

export type Filters = { from?: string; to?: string; bill?: string; party?: string; vehicle?: string };

const has = (s: string, q: string) => s.toLowerCase().includes(q.toLowerCase());

export function filterEntries(rows: LocalEntry[], f: Filters) {
  const bill = f.bill?.trim();
  const party = f.party?.trim();
  const veh = f.vehicle?.trim();
  return rows.filter(
    (r) =>
      (!f.from || (!!r.entry_date && r.entry_date >= f.from)) &&
      (!f.to || (!!r.entry_date && r.entry_date <= f.to)) &&
      (!bill || has(r.bill_no, bill)) &&
      (!veh || has(r.vehicle_no, veh)) &&
      (!party || has(r.maal_diya, party) || has(r.maal_liya, party)),
  );
}
