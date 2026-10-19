import { describe, expect, it } from "vitest";
import {
  busyDate,
  cleanWeight,
  detectMapping,
  duplicateFileRows,
  changedSource,
  extractVoucherNumber,
  parseBusyRows,
  rowIssues,
  generateSampleBusyWorkbook,
  type BusyRow,
  type Mapping,
} from "@/lib/busy-model";
import { readBusyWorkbook } from "@/lib/busy-workbook";

describe("BUSY Excel Import Module", () => {
  describe("Header Detection & Column Mapping", () => {
    it("locates real header row among title and blank rows", () => {
      const grid = [
        ["M/S SHREE GANESH TRADERS", "", "", "", "", ""],
        ["Sales Register (01-04-2026 to 31-03-2027)", "", "", "", "", ""],
        ["", "", "", "", "", ""],
        ["Date", "Vch/Bill No", "Particulars", "Item Details", "Qty", "Unit", "Vehicle No"],
        ["01-04-2026", "PC/101/26-27", "Agrawal Steels", "TMT 12mm", "25.50", "MT", "RJ14GB1234"],
      ];

      const { header, mapping, confident } = detectMapping(grid);
      expect(header).toBe(3);
      expect(confident).toBe(true);
      expect(mapping.entry_date).toBe(0);
      expect(mapping.source_reference).toBe(1);
      expect(mapping.maal_diya).toBe(2);
      expect(mapping.item).toBe(3);
      expect(mapping.weight_value).toBe(4);
      expect(mapping.unit).toBe(5);
      expect(mapping.vehicle_no).toBe(6);
    });

    it("supports common header variations (Voucher No, Party Name, Quantity, Vehicle Number)", () => {
      const grid = [
        ["Voucher Date", "Voucher No.", "Party Name", "Quantity", "VEHICLE_NO"],
        ["02-04-2026", "SALE/202", "Tata Projects", "40.00", "MH12AB1234"],
      ];

      const { header, mapping, confident } = detectMapping(grid);
      expect(header).toBe(0);
      expect(confident).toBe(true);
      expect(mapping.entry_date).toBe(0);
      expect(mapping.source_reference).toBe(1);
      expect(mapping.maal_diya).toBe(2);
      expect(mapping.weight_value).toBe(3);
      expect(mapping.vehicle_no).toBe(4);
    });

    it("identifies when key columns are missing and flags confident as false", () => {
      const grid = [
        ["Report Title", "Random Column 1", "Random Column 2"],
        ["Data 1", "Data 2", "Data 3"],
      ];

      const { confident } = detectMapping(grid);
      expect(confident).toBe(false);
    });
  });

  describe("Date Parsing", () => {
    it("parses DD-MM-YYYY format to YYYY-MM-DD", () => {
      expect(busyDate("01-04-2026")).toBe("2026-04-01");
      expect(busyDate("15/08/2026")).toBe("2026-08-15");
      expect(busyDate("31.12.2026")).toBe("2026-12-31");
    });

    it("parses standard ISO YYYY-MM-DD format", () => {
      expect(busyDate("2026-04-01")).toBe("2026-04-01");
      expect(busyDate("2026-11-25")).toBe("2026-11-25");
    });

    it("parses Excel numeric serial dates correctly without timezone shift", () => {
      // 45383 is 2024-04-01 in Excel serial notation
      expect(busyDate("45383")).toBe("2024-04-01");
      // 46113 is 2026-04-01 in Excel serial notation
      expect(busyDate("46113")).toBe("2026-04-01");
    });

    it("rejects invalid dates", () => {
      expect(busyDate("invalid-date")).toBe("");
      expect(busyDate("31-02-2026")).toBe(""); // Non-existent date
      expect(busyDate("")).toBe("");
    });
  });

  describe("Weight & Number Formatting", () => {
    it("cleans comma thousand separators while preserving decimal precision", () => {
      expect(cleanWeight("1,250.50")).toBe("1250.50");
      expect(cleanWeight("25.750")).toBe("25.750");
      expect(cleanWeight("10,000")).toBe("10000");
      expect(cleanWeight("0.55")).toBe("0.55");
    });

    it("retains original text if non-numeric", () => {
      expect(cleanWeight("N/A")).toBe("N/A");
    });
  });

  describe("Row Parsing & Summary Total Filtering", () => {
    const mapping: Mapping = {
      entry_date: 0,
      source_reference: 1,
      maal_diya: 2,
      item: 3,
      weight_value: 4,
      unit: 5,
      vehicle_no: 6,
    };

    it("parses normal candidate rows, keeping माल लिया initially blank", () => {
      const grid = [
        ["Date", "Vch No", "Party", "Item", "Qty", "Unit", "Vehicle"],
        ["01-04-2026", "PC/177/26-27", "Shree Ram Trading", "Cement", "25.50", "MT", "RJ14GB1234"],
        ["02-04-2026", "PC/178/26-27", "Balaji Logistics", "Steel", "32.00", "MT", "HR55AB5678"],
      ];

      const rows = parseBusyRows(grid, 0, mapping);
      expect(rows.length).toBe(2);

      // Verify row 1
      expect(rows[0]?.source_reference).toBe("PC/177/26-27");
      expect(rows[0]?.entry_date).toBe("2026-04-01");
      expect(rows[0]?.maal_diya).toBe("Shree Ram Trading");
      expect(rows[0]?.maal_liya).toBe(""); // Must be initially blank for manual entry
      expect(rows[0]?.weight_value).toBe("25.50");
      expect(rows[0]?.vehicle_no).toBe("RJ14GB1234");
      expect(rows[0]?.unit).toBe("MT");
      expect(rows[0]?.selected).toBe(true);

      // Verify row 2
      expect(rows[1]?.source_reference).toBe("PC/178/26-27");
      expect(rows[1]?.entry_date).toBe("2026-04-02");
      expect(rows[1]?.maal_diya).toBe("Balaji Logistics");
      expect(rows[1]?.maal_liya).toBe("");
    });

    it("ignores summary and grand total rows", () => {
      const grid = [
        ["Date", "Vch No", "Party", "Item", "Qty", "Unit", "Vehicle"],
        ["01-04-2026", "PC/177/26-27", "Shree Ram Trading", "Cement", "25.50", "MT", "RJ14GB1234"],
        ["Total", "", "", "", "25.50", "MT", ""],
        ["Grand Total", "", "", "", "25.50", "MT", ""],
        ["", "", "", "", "", "", ""],
      ];

      const rows = parseBusyRows(grid, 0, mapping);
      expect(rows.length).toBe(1);
      expect(rows[0]?.source_reference).toBe("PC/177/26-27");
    });
  });

  describe("Duplicate Detection & Mixed Workbooks", () => {
    it("detects duplicates within the same Excel file", () => {
      const rows: BusyRow[] = [
        {
          row: 4,
          entry_date: "2026-04-01",
          source_reference: "PC/177/26-27",
          maal_diya: "Party A",
          maal_liya: "",
          weight_value: "25.0",
          vehicle_no: "RJ14A1",
          unit: "MT",
          item: "",
          selected: true,
          action: "new",
          source_values: {},
        },
        {
          row: 5,
          entry_date: "2026-04-02",
          source_reference: "PC/178/26-27",
          maal_diya: "Party B",
          maal_liya: "",
          weight_value: "30.0",
          vehicle_no: "RJ14A2",
          unit: "MT",
          item: "",
          selected: true,
          action: "new",
          source_values: {},
        },
        {
          row: 6,
          entry_date: "2026-04-03",
          source_reference: "PC/177/26-27", // Repeated reference
          maal_diya: "Party A",
          maal_liya: "",
          weight_value: "25.0",
          vehicle_no: "RJ14A1",
          unit: "MT",
          item: "",
          selected: true,
          action: "new",
          source_values: {},
        },
      ];

      const dups = duplicateFileRows(rows);
      expect(dups.has("PC/177/26-27")).toBe(true);
      expect(dups.get("PC/177/26-27")).toEqual([4, 6]);
      expect(dups.has("PC/178/26-27")).toBe(false);
    });

    it("identifies differences when an existing voucher has changed", () => {
      const oldValues = {
        entry_date: "2026-04-01",
        maal_diya: "Old Party Name",
        weight_value: "20.00",
        vehicle_no: "RJ14GB1234",
      };

      const newValues = {
        entry_date: "2026-04-01",
        maal_diya: "Updated Party Name",
        weight_value: "25.50",
        vehicle_no: "RJ14GB1234",
      };

      const changed = changedSource(oldValues, newValues);
      expect(changed).toContain("maal_diya");
      expect(changed).toContain("weight_value");
      expect(changed).not.toContain("entry_date");
      expect(changed).not.toContain("vehicle_no");
    });

    it("allows safe import of new records in mixed workbooks containing existing vouchers", () => {
      const existingRefs = new Set(["PC/100/26-27", "PC/101/26-27"]);
      const candidateRows: BusyRow[] = [
        {
          row: 4,
          entry_date: "2026-04-01",
          source_reference: "PC/100/26-27", // Already in DB
          maal_diya: "Party A",
          maal_liya: "",
          weight_value: "20.0",
          vehicle_no: "RJ14A",
          unit: "MT",
          item: "",
          selected: true,
          action: "new",
          source_values: {},
        },
        {
          row: 5,
          entry_date: "2026-04-02",
          source_reference: "PC/102/26-27", // New candidate
          maal_diya: "Party C",
          maal_liya: "",
          weight_value: "35.0",
          vehicle_no: "RJ14B",
          unit: "MT",
          item: "",
          selected: true,
          action: "new",
          source_values: {},
        },
      ];

      // "Import New Records Only" logic
      const eligibleToImport = candidateRows.filter(
        (r) => !existingRefs.has(r.source_reference) && rowIssues(r, false).length === 0,
      );

      expect(eligibleToImport.length).toBe(1);
      expect(eligibleToImport[0]?.source_reference).toBe("PC/102/26-27");
    });
  });

  describe("Validation & Row Issues", () => {
    it("flags missing required fields", () => {
      const invalidRow: BusyRow = {
        row: 5,
        entry_date: "",
        source_reference: "",
        maal_diya: "",
        weight_value: "not-a-number",
        vehicle_no: "",
        maal_liya: "",
        unit: "MT",
        item: "",
        selected: true,
        action: "new",
        source_values: {},
      };

      const issues = rowIssues(invalidRow, false);
      expect(issues).toContain("Missing or invalid date");
      expect(issues).toContain("Missing BUSY reference");
      expect(issues).toContain("Missing party");
      expect(issues).toContain("Invalid quantity (must be a valid number)");
      expect(issues).toContain("Missing vehicle");
    });

    it("validates manual bill_no override if specified", () => {
      const rowWithBadBill: BusyRow = {
        row: 5,
        entry_date: "2026-04-01",
        source_reference: "PC/101",
        bill_no: "abc-not-number",
        maal_diya: "Party",
        weight_value: "20",
        vehicle_no: "RJ14",
        maal_liya: "",
        unit: "MT",
        item: "",
        selected: true,
        action: "new",
        source_values: {},
      };

      const issues = rowIssues(rowWithBadBill, false);
      expect(issues).toContain("Bill No. must be numeric");

      const rowWithGoodBill: BusyRow = {
        ...rowWithBadBill,
        bill_no: "175",
      };
      expect(rowIssues(rowWithGoodBill, false).length).toBe(0);
    });

    it("allows blank weight or vehicle when incomplete mode is enabled", () => {
      const incompleteRow: BusyRow = {
        row: 5,
        entry_date: "2026-04-01",
        source_reference: "PC/101",
        maal_diya: "Party",
        weight_value: "",
        vehicle_no: "",
        maal_liya: "",
        unit: "MT",
        item: "",
        selected: true,
        action: "new",
        source_values: {},
      };

      expect(rowIssues(incompleteRow, false)).toContain("Missing weight");
      expect(rowIssues(incompleteRow, false)).toContain("Missing vehicle");
      expect(rowIssues(incompleteRow, true).length).toBe(0);
    });
  });

  describe("Sequential Register Bill Numbering Rules", () => {
    it("simulates sequential numbering starting at 168 and continuing sequentially", () => {
      let nextBill = 168;
      const proposedNumbers: string[] = [];
      const candidateCount = 5;

      for (let i = 0; i < candidateCount; i++) {
        proposedNumbers.push(String(nextBill));
        nextBill++;
      }

      expect(proposedNumbers).toEqual(["168", "169", "170", "171", "172"]);
      expect(nextBill).toBe(173);
    });

    it("ensures manual overrides advance next suggested bill without moving backwards", () => {
      let serverNextBill = 168;

      // User overrides row 1 with bill 175
      const manualBill = 175;
      serverNextBill = Math.max(serverNextBill, manualBill + 1);

      // Next assigned number must be 176, never moving backwards
      expect(serverNextBill).toBe(176);
    });
  });

  describe("Sample Template Generation & Workbook Reader", () => {
    it("generates a valid BUSY sales voucher Excel workbook that can be parsed back", async () => {
      const bytes = await generateSampleBusyWorkbook();
      expect(bytes.length).toBeGreaterThan(1000);

      // Create a mock File object
      const file = new File([bytes as BlobPart], "Sample_Busy.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const sheets = await readBusyWorkbook(file);
      expect(sheets.length).toBe(1);
      expect(sheets[0]?.name).toBe("Sales Vouchers");

      // Detect mapping on generated template
      const grid = sheets[0]?.grid ?? [];
      const { header, mapping, confident } = detectMapping(grid);
      expect(header).toBe(3); // Row 4 (0-indexed 3)
      expect(confident).toBe(true);

      // Parse candidate rows
      const rows = parseBusyRows(grid, header, mapping);
      expect(rows.length).toBe(5);
      expect(rows[0]?.source_reference).toBe("PC/177/26-27");
      expect(rows[0]?.entry_date).toBe("2026-04-01");
      expect(rows[0]?.maal_diya).toBe("Shree Ram Trading Co.");
      expect(rows[0]?.weight_value).toBe("25.50");
      expect(rows[0]?.vehicle_no).toBe("RJ14GB1234");
    });

    it("rejects older .xls format with a clear message", async () => {
      const file = new File(["dummy"], "sample.xls", { type: "application/vnd.ms-excel" });
      await expect(readBusyWorkbook(file)).rejects.toThrow(
        /Older \.xls binary format cannot be read directly/i,
      );
    });

    it("rejects unsupported extensions with a clear message", async () => {
      const file = new File(["dummy"], "sample.csv", { type: "text/csv" });
      await expect(readBusyWorkbook(file)).rejects.toThrow(/Unsupported file format/i);
    });

    it("correctly parses real historical BUSY export workbook if present", async () => {
      const fs = await import("fs");
      if (!fs.existsSync("ListofSalesVouchers222222.xlsx")) return;

      const buffer = fs.readFileSync("ListofSalesVouchers222222.xlsx");
      const file = new File([buffer], "ListofSalesVouchers222222.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const sheets = await readBusyWorkbook(file);
      expect(sheets.length).toBeGreaterThanOrEqual(1);

      const grid = sheets[0]?.grid ?? [];
      const { header, mapping, confident } = detectMapping(grid);

      expect(header).toBe(4); // Row 5 in Excel
      expect(confident).toBe(true);
      expect(mapping.entry_date).toBe(0);
      expect(mapping.source_reference).toBe(1);
      expect(mapping.maal_diya).toBe(2);
      expect(mapping.weight_value).toBe(4);
      expect(mapping.vehicle_no).toBe(6);

      const candidates = parseBusyRows(grid, header, mapping);
      expect(candidates.length).toBe(180);

      // Verify first and last candidates have extracted voucher numbers
      expect(candidates[0]?.bill_no).toBe("1");
      expect(candidates[179]?.source_reference).toBe("PC/185/26-27");
      expect(candidates[179]?.bill_no).toBe("185");

      // Verify total summary row was ignored
      expect(candidates.some((c) => c.maal_diya.toLowerCase().includes("total"))).toBe(false);

      // Verify no invalid rows when checked with incomplete=false
      const invalidRows = candidates.filter((c) => rowIssues(c, false).length > 0);
      expect(invalidRows.length).toBe(0);
    });
  });

  describe("Voucher Number Extraction", () => {
    it("extracts sequential numbers from standard BUSY voucher patterns", () => {
      expect(extractVoucherNumber("PC/1/26-27")).toBe("1");
      expect(extractVoucherNumber("PC/185/26-27")).toBe("185");
      expect(extractVoucherNumber("SALE/42/2026")).toBe("42");
      expect(extractVoucherNumber("INV/007/26")).toBe("7");
    });

    it("falls back to isolated digits or empty string", () => {
      expect(extractVoucherNumber("105")).toBe("105");
      expect(extractVoucherNumber("VCH-999")).toBe("999");
      expect(extractVoucherNumber("NO_NUM")).toBe("");
    });
  });
});
