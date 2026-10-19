export const BUSY_FIELDS = [
  "entry_date",
  "source_reference",
  "maal_diya",
  "weight_value",
  "unit",
  "vehicle_no",
  "item",
] as const;
export type BusyField = (typeof BUSY_FIELDS)[number];
export type Mapping = Record<BusyField, number>;

export type BusyRow = {
  row: number;
  entry_date: string;
  source_reference: string;
  bill_no?: string; // Proposed or user-overridden register Bill No.
  maal_diya: string;
  maal_liya: string;
  weight_value: string;
  vehicle_no: string;
  unit: string;
  item: string;
  selected: boolean;
  action: "new" | "update";
  source_values: Record<string, string>;
  existing_updated_at?: string | undefined;
};

export const BUSY_HEADER_ALIASES: Record<BusyField, string[]> = {
  entry_date: [
    "date",
    "vchdate",
    "voucherdate",
    "billdate",
    "vch_date",
    "voucher_date",
    "docdate",
    "tithi",
    "entrydate",
    "invoicedate",
    "dt",
  ],
  source_reference: [
    "vchbillno",
    "voucherno",
    "billno",
    "vchno",
    "vchnumber",
    "vouchernumber",
    "invoiceno",
    "invoicenumber",
    "invno",
    "billnumber",
    "docno",
    "referenceno",
    "reference",
    "voucher",
    "vch",
  ],
  maal_diya: [
    "particulars",
    "partyname",
    "accountname",
    "party",
    "account",
    "customer",
    "customername",
    "buyer",
    "client",
    "partyaccount",
  ],
  weight_value: [
    "qty",
    "quantity",
    "weight",
    "wt",
    "netwt",
    "netweight",
    "vajan",
    "grossweight",
    "billqty",
  ],
  unit: ["unit", "uom", "units", "measurement", "pkg"],
  vehicle_no: [
    "vehiclenumber",
    "vehicleno",
    "vechiclenumber",
    "vechicleno",
    "truckno",
    "trucknumber",
    "lorryno",
    "lorrynumber",
    "gadinumber",
    "gadino",
    "vehno",
    "vehicle",
    "vehiclenum",
  ],
  item: [
    "itemdetails",
    "itemname",
    "item",
    "description",
    "itemdescription",
    "material",
    "goods",
    "product",
    "productname",
  ],
};

export function detectMapping(grid: string[][]): {
  header: number;
  mapping: Mapping;
  confident: boolean;
  detectedAliases: Record<string, string>;
} {
  let bestHeader = 0;
  let bestScore = -1;
  let bestMapping = Object.fromEntries(BUSY_FIELDS.map((k) => [k, -1])) as Mapping;
  const detectedAliases: Record<string, string> = {};

  // Scan up to first 100 rows for the real header row
  const scanLimit = Math.min(100, grid.length);
  for (let index = 0; index < scanLimit; index++) {
    const row = grid[index] ?? [];
    if (!row.some((cell) => cell.trim())) continue;

    const normalized = row.map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const m = Object.fromEntries(BUSY_FIELDS.map((k) => [k, -1])) as Mapping;
    const rowAliases: Record<string, string> = {};

    for (const field of BUSY_FIELDS) {
      const fieldAliases = BUSY_HEADER_ALIASES[field];
      const matchIdx = normalized.findIndex((v) => fieldAliases.includes(v));
      if (matchIdx >= 0) {
        m[field] = matchIdx;
        rowAliases[field] = row[matchIdx] ?? "";
      }
    }

    // Weight core vs secondary fields
    const coreMatches =
      (m.entry_date >= 0 ? 3 : 0) + (m.source_reference >= 0 ? 3 : 0) + (m.maal_diya >= 0 ? 3 : 0);
    const secondaryMatches =
      (m.weight_value >= 0 ? 2 : 0) +
      (m.vehicle_no >= 0 ? 2 : 0) +
      (m.unit >= 0 ? 1 : 0) +
      (m.item >= 0 ? 1 : 0);
    const totalScore = coreMatches + secondaryMatches;

    // Header requires at least two core fields or totalScore >= 5
    if (totalScore > bestScore && (coreMatches >= 6 || totalScore >= 5)) {
      bestScore = totalScore;
      bestHeader = index;
      bestMapping = m;
      Object.assign(detectedAliases, rowAliases);
    }
  }

  // Fallback if no high-confidence header found: pick best match across any row
  if (bestScore < 0) {
    for (let index = 0; index < scanLimit; index++) {
      const row = grid[index] ?? [];
      const normalized = row.map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, ""));
      const m = Object.fromEntries(BUSY_FIELDS.map((k) => [k, -1])) as Mapping;
      for (const field of BUSY_FIELDS) {
        const fieldAliases = BUSY_HEADER_ALIASES[field];
        m[field] = normalized.findIndex((v) => fieldAliases.includes(v));
      }
      const s = BUSY_FIELDS.filter((k) => m[k] >= 0).length;
      if (s > bestScore) {
        bestScore = s;
        bestHeader = index;
        bestMapping = m;
      }
    }
  }

  const confident =
    bestMapping.entry_date >= 0 && bestMapping.source_reference >= 0 && bestMapping.maal_diya >= 0;
  return { header: bestHeader, mapping: bestMapping, confident, detectedAliases };
}

/**
 * Parses dates from various formats (ISO YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, or Excel serial numbers)
 * into a standard YYYY-MM-DD string without timezone shifting.
 */
export function busyDate(value: string | number): string {
  if (value == null) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";

  // 1. Check ISO format: YYYY-MM-DD
  const iso = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // 2. Check Indian/standard format: DD-MM-YYYY or DD/MM/YYYY
  const text = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (text) {
    const d = Number(text[1]);
    const m = Number(text[2]);
    const y = Number(text[3]);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // 3. Check Excel numeric serial date (e.g. 45383 for 2024-04-01)
  if (/^\d{4,5}(\.\d+)?$/.test(trimmed)) {
    const serial = Math.floor(Number(trimmed));
    // Valid Excel date serials between 1980 and 2100 (approx 29000 to 73000)
    if (serial >= 25000 && serial <= 80000) {
      // Excel epoch: 1899-12-30 (incorporating Lotus 1-2-3 1900 leap day bug)
      const epoch = Date.UTC(1899, 11, 30);
      const date = new Date(epoch + serial * 86400 * 1000);
      const y = date.getUTCFullYear();
      const m = date.getUTCMonth() + 1;
      const d = date.getUTCDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // 4. Fallback for stringified Date objects (e.g. "Thu Apr 02 2026 05:30:00 GMT+0530")
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const dObj = new Date(parsed);
    const y = dObj.getFullYear();
    const m = dObj.getMonth() + 1;
    const d = dObj.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return "";
}

/** Cleans numeric quantities, removing thousand commas while preserving decimal precision */
export function cleanWeight(raw: string): string {
  const cleaned = raw.replace(/,/g, "").trim();
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return cleaned;
  }
  return raw.trim();
}

export function parseBusyRows(grid: string[][], header: number, m: Mapping): BusyRow[] {
  const result: BusyRow[] = [];
  grid.slice(header + 1).forEach((cells, i) => {
    if (cells.every((v) => !v.trim())) return;
    const get = (k: BusyField) => (cells[m[k]] ?? "").trim();

    // Skip summary / total rows
    const isTotalRow = cells.some((v) =>
      /^(grand\s+total|total|summary|subtotal|sub-total|page\s+total)$/i.test(v.trim()),
    );
    if (isTotalRow && !get("source_reference")) return;

    // Skip rows where reference, party, and date are all blank (report noise)
    if (!get("source_reference") && !get("maal_diya") && !get("entry_date")) return;

    const rawWeight = get("weight_value");
    const cleanedWeight = cleanWeight(rawWeight);

    const row: BusyRow = {
      row: header + i + 2,
      entry_date: busyDate(get("entry_date")),
      source_reference: get("source_reference"),
      bill_no: "",
      maal_diya: get("maal_diya"),
      maal_liya: "",
      weight_value: cleanedWeight,
      vehicle_no: get("vehicle_no"),
      unit: get("unit"),
      item: get("item"),
      selected: true,
      action: "new",
      source_values: {},
    };

    row.source_values = {
      entry_date: row.entry_date || get("entry_date"),
      maal_diya: row.maal_diya,
      weight_value: row.weight_value,
      vehicle_no: row.vehicle_no,
      unit: row.unit,
      item: row.item,
    };

    result.push(row);
  });
  return result;
}

export function rowIssues(row: BusyRow, incomplete = false): string[] {
  const errors: string[] = [];
  if (!busyDate(row.entry_date)) errors.push("Missing or invalid date");
  if (!row.source_reference.trim()) errors.push("Missing BUSY reference");
  if (!row.maal_diya.trim()) errors.push("Missing party");

  if (!row.weight_value.trim()) {
    if (!incomplete) errors.push("Missing weight");
  } else if (!/^\d+(\.\d+)?$/.test(row.weight_value.trim())) {
    errors.push("Invalid quantity (must be a valid number)");
  }

  if (!row.vehicle_no.trim() && !incomplete) {
    errors.push("Missing vehicle");
  }

  if (row.bill_no && !/^[0-9]{1,15}$/.test(row.bill_no.trim())) {
    errors.push("Bill No. must be numeric");
  }

  return errors;
}

export function duplicateFileRows(rows: BusyRow[]): Map<string, number[]> {
  const refs = new Map<string, number[]>();
  rows.forEach((r) => {
    const ref = r.source_reference.trim();
    if (ref) refs.set(ref, [...(refs.get(ref) ?? []), r.row]);
  });
  return new Map([...refs].filter(([, positions]) => positions.length > 1));
}

export function changedSource(
  old: Record<string, unknown>,
  next: Record<string, string>,
): string[] {
  return Object.keys(next).filter((k) => String(old[k] ?? "") !== next[k]);
}

/** Generates a sample BUSY Sales Voucher workbook as an ArrayBuffer */
export async function generateSampleBusyWorkbook(): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "BUSY Accounting Software";
  wb.created = new Date();

  const ws = wb.addWorksheet("Sales Vouchers");

  // Title block (typical in BUSY exports)
  ws.addRow(["M/S SHREE GANESH ENTERPRISES"]);
  ws.addRow(["Sales Register / Vouchers (01-04-2026 to 31-03-2027)"]);
  ws.addRow([]); // Blank row

  // Header row (Row 4)
  const headerRow = ws.addRow([
    "Date",
    "Vch/Bill No",
    "Particulars",
    "Item Details",
    "Qty",
    "Unit",
    "Vehicle No",
  ]);
  headerRow.font = { bold: true };

  // Sample data rows
  const samples = [
    [
      "01-04-2026",
      "PC/177/26-27",
      "Shree Ram Trading Co.",
      "Cement Grade 53",
      "25.50",
      "MT",
      "RJ14GB1234",
    ],
    [
      "02-04-2026",
      "PC/178/26-27",
      "Balaji Logistics Ltd.",
      "Steel TMT Bars",
      "32.00",
      "MT",
      "HR55AB5678",
    ],
    [
      "02-04-2026",
      "PC/179/26-27",
      "Jai Kisan Fertilisers",
      "Urea Granules",
      "18.75",
      "MT",
      "DL1AA9999",
    ],
    [
      "03-04-2026",
      "PC/180/26-27",
      "Khandelwal Minerals",
      "Gypsum Powder",
      "40.00",
      "MT",
      "RJ27CD3456",
    ],
    ["04-04-2026", "PC/181/26-27", "Vikas Agro Traders", "Wheat Bori", "15.20", "MT", "UP16EF7890"],
  ];

  samples.forEach((row) => ws.addRow(row));

  // Total summary row
  const totalRow = ws.addRow(["Total", "", "", "", "131.45", "MT", ""]);
  totalRow.font = { bold: true };

  // Format column widths
  ws.columns = [
    { width: 14 },
    { width: 18 },
    { width: 28 },
    { width: 22 },
    { width: 12 },
    { width: 8 },
    { width: 16 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
