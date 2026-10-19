export type BusySheet = { name: string; grid: string[][] };

export async function readBusyWorkbook(file: File): Promise<BusySheet[]> {
  const name = file.name.trim();

  if (/\.xls$/i.test(name) && !/\.xlsx$/i.test(name)) {
    throw new Error(
      "Older .xls binary format cannot be read directly. Please open the file in Excel or BUSY and save it as modern .xlsx format.",
    );
  }

  if (!/\.xlsx$/i.test(name)) {
    throw new Error(
      "Unsupported file format. Please select an Excel workbook with a .xlsx extension.",
    );
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error(
      "Workbook is too large. Export a smaller date range (maximum file size is 15 MB).",
    );
  }

  let buffer: ArrayBuffer;
  if (typeof file.arrayBuffer === "function") {
    buffer = await file.arrayBuffer();
  } else if (typeof FileReader !== "undefined") {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
      reader.readAsArrayBuffer(file);
    });
  } else {
    buffer = await new Response(file).arrayBuffer();
  }

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new Error(
      `Could not open Excel file: ${err instanceof Error ? err.message : "Corrupt or protected workbook"}. Ensure the file is not password-protected and is a valid .xlsx file.`,
    );
  }

  if (!workbook.worksheets.length) {
    throw new Error("The uploaded Excel file contains no worksheets.");
  }

  return workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > 20000 || sheet.columnCount > 100) {
      throw new Error(
        `Worksheet "${sheet.name}" is too large (${sheet.rowCount} rows). Please export a smaller date range.`,
      );
    }

    const grid: string[][] = [];
    for (let i = 1; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const values: string[] = [];
      for (let j = 1; j <= sheet.columnCount; j++) {
        const cell = row.getCell(j);
        const v = cell.value;

        if (v instanceof Date) {
          values.push(
            `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`,
          );
        } else if (v && typeof v === "object") {
          if ("result" in v && v.result != null) {
            values.push(String(v.result));
          } else if ("text" in v && typeof (v as { text: unknown }).text === "string") {
            values.push((v as { text: string }).text);
          } else if ("richText" in v && Array.isArray((v as { richText: unknown[] }).richText)) {
            values.push(
              (v as { richText: { text: string }[] }).richText.map((t) => t.text ?? "").join(""),
            );
          } else {
            values.push(cell.text ?? "");
          }
        } else {
          values.push(cell.text ?? (v == null ? "" : String(v)));
        }
      }
      grid.push(values);
    }
    return { name: sheet.name, grid };
  });
}
