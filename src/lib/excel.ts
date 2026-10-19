import type { LocalEntry as Entry } from "./local-store";

export const COLUMNS = ["Sr. No.", "Date / तारीख", "Bill No.", "माल दिया", "माल लिया", "वजन", "गाड़ी नं."] as const;

function parseISO(iso: string) {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Builds a real .xlsx workbook in the browser and triggers download. */
export async function downloadRegisterXlsx(rows: Entry[], filename: string, unit: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet("Register", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: COLUMNS[0], key: "sr", width: 9 },
    { header: COLUMNS[1], key: "date", width: 14, style: { numFmt: "dd-mm-yyyy" } },
    { header: COLUMNS[2], key: "bill", width: 12, style: { numFmt: "@" } },
    { header: COLUMNS[3], key: "diya", width: 28 },
    { header: COLUMNS[4], key: "liya", width: 28 },
    { header: `${COLUMNS[5]} (${unit})`, key: "wt", width: 12, style: { numFmt: "General" } },
    { header: COLUMNS[6], key: "veh", width: 18, style: { numFmt: "@" } },
  ];
  for (const r of rows) {
    ws.addRow({
      sr: r.register_serial_no,
      date: parseISO(r.entry_date),
      bill: String(r.bill_no),
      diya: r.maal_diya,
      liya: r.maal_liya,
      wt: r.weight_value === null ? null : Number(r.weight_value),
      veh: String(r.vehicle_no),
    });
  }
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportFilename(from?: string, to?: string) {
  const today = new Date();
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (from || to) return `Transport_Register_${from ?? "start"}_to_${to ?? t}.xlsx`;
  return `Transport_Register_${t}.xlsx`;
}
