export type BusySheet = { name: string; grid: string[][] };
export async function readBusyWorkbook(file: File): Promise<BusySheet[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx workbook. Older .xls files must be saved as .xlsx in BUSY or Excel.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Workbook is too large. Export a smaller date range (maximum 15 MB).');
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook.worksheets.map(sheet => {
    if (sheet.rowCount > 20000 || sheet.columnCount > 100) throw new Error('Worksheet is too large. Export a smaller date range.');
    const grid: string[][] = [];
    for (let i = 1; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const values: string[] = [];
      for (let j = 1; j <= sheet.columnCount; j++) {
        const cell = row.getCell(j), v = cell.value;
        if (v instanceof Date) values.push(`${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`);
        else if (v && typeof v === 'object' && 'formula' in v) values.push(v.result == null ? '' : String(v.result));
        else values.push(cell.text);
      }
      grid.push(values);
    }
    return { name: sheet.name, grid };
  });
}