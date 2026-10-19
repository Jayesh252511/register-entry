export const BUSY_FIELDS = ['entry_date', 'source_reference', 'maal_diya', 'weight_value', 'unit', 'vehicle_no', 'item'] as const;
export type BusyField = typeof BUSY_FIELDS[number];
export type Mapping = Record<BusyField, number>;
export type BusyRow = { row: number; entry_date: string; source_reference: string; maal_diya: string; maal_liya: string; weight_value: string; vehicle_no: string; unit: string; item: string; selected: boolean; action: 'new' | 'update'; source_values: Record<string, string>; existing_updated_at?: string | undefined };
const aliases: Record<BusyField, string[]> = {
  entry_date: ['date', 'vchdate', 'voucherdate'], source_reference: ['vchbillno', 'voucherno', 'billno', 'vchno'],
  maal_diya: ['particulars', 'partyname', 'accountname'], weight_value: ['qty', 'quantity'], unit: ['unit'],
  vehicle_no: ['vehiclenumber', 'vehicleno', 'vechiclenumber'], item: ['itemdetails', 'itemname'],
};
export function detectMapping(grid: string[][]) {
  let header = 0, score = -1;
  let mapping = Object.fromEntries(BUSY_FIELDS.map(k => [k, -1])) as Mapping;
  grid.slice(0, 100).forEach((row, index) => {
    const normalized = row.map(v => v.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const m = Object.fromEntries(BUSY_FIELDS.map(k => [k, normalized.findIndex(v => aliases[k].includes(v))])) as Mapping;
    const s = BUSY_FIELDS.filter(k => m[k] >= 0).length;
    if (s > score) { score = s; header = index; mapping = m; }
  });
  return { header, mapping };
}
export function busyDate(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const text = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : text ? [Number(text[3]), Number(text[2]), Number(text[1])] : null;
  if (!parts) return '';
  const [y = 0, m = 0, d = 0] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function parseBusyRows(grid: string[][], header: number, m: Mapping): BusyRow[] {
  const result: BusyRow[] = [];
  grid.slice(header + 1).forEach((cells, i) => {
    if (cells.every(v => !v.trim())) return;
    const get = (k: BusyField) => cells[m[k]] ?? '';
    if (cells.some(v => /^(grand\s+total|total|summary|subtotal)$/i.test(v.trim())) && !get('source_reference').trim()) return;
    const row: BusyRow = { row: header + i + 2, entry_date: busyDate(get('entry_date')), source_reference: get('source_reference'), maal_diya: get('maal_diya'), maal_liya: '', weight_value: get('weight_value'), vehicle_no: get('vehicle_no'), unit: get('unit'), item: get('item'), selected: true, action: 'new', source_values: {} };
    row.source_values = { entry_date: row.entry_date || get('entry_date'), maal_diya: row.maal_diya, weight_value: row.weight_value, vehicle_no: row.vehicle_no, unit: row.unit, item: row.item };
    result.push(row);
  });
  return result;
}
export function rowIssues(row: BusyRow, incomplete = false) {
  const errors: string[] = [];
  if (!busyDate(row.entry_date)) errors.push('Missing or invalid date');
  if (!row.source_reference.trim()) errors.push('Missing BUSY reference');
  if (!row.maal_diya.trim()) errors.push('Missing party');
  if (!row.weight_value.trim()) { if (!incomplete) errors.push('Missing weight'); }
  else if (!/^\d+(\.\d+)?$/.test(row.weight_value.trim())) errors.push('Invalid quantity');
  if (!row.vehicle_no.trim() && !incomplete) errors.push('Missing vehicle');
  return errors;
}
export function duplicateFileRows(rows: BusyRow[]) {
  const refs = new Map<string, number[]>();
  rows.forEach(r => { if (r.source_reference) refs.set(r.source_reference, [...(refs.get(r.source_reference) ?? []), r.row]); });
  return new Map([...refs].filter(([, positions]) => positions.length > 1));
}
export function changedSource(old: Record<string, unknown>, next: Record<string, string>) {
  return Object.keys(next).filter(k => String(old[k] ?? '') !== next[k]);
}