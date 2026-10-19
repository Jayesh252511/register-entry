import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PageTitle } from "./EntryViews";
import {
  BUSY_FIELDS,
  changedSource,
  detectMapping,
  duplicateFileRows,
  extractVoucherNumber,
  generateSampleBusyWorkbook,
  parseBusyRows,
  rowIssues,
  type BusyRow,
  type Mapping,
} from "@/lib/busy-model";
import { readBusyWorkbook, type BusySheet } from "@/lib/busy-workbook";
import { busyHistory, confirmBusy, previewBusy, revertBusyBatch } from "@/lib/busy.functions";
import { getState, resetLocalStore, sync, useRegister } from "@/lib/local-store";

const LABELS = {
  entry_date: "Date / तारीख",
  source_reference: "BUSY Voucher Ref / वाउचर नं.",
  maal_diya: "माल दिया / Party Name",
  weight_value: "Qty. / वजन (MT)",
  unit: "Unit / इकाई",
  vehicle_no: "गाड़ी नं. / Vehicle Number",
  item: "Item Details / वस्तु विवरण",
};

type Comparison = Awaited<ReturnType<typeof previewBusy>>;
type Batch = Awaited<ReturnType<typeof confirmBusy>>;
type Submission = Parameters<typeof confirmBusy>[0]["data"];
const EMPTY_MAPPING = Object.fromEntries(BUSY_FIELDS.map((k) => [k, -1])) as Mapping;

export function BusyImport() {
  const { online } = useRegister();
  const upload = useRef<HTMLInputElement>(null);
  const submission = useRef<Submission | null>(null);
  const previewFn = useServerFn(previewBusy);
  const confirmFn = useServerFn(confirmBusy);
  const revertFn = useServerFn(revertBusyBatch);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["busy-history"],
    queryFn: () => busyHistory(),
    retry: false,
    enabled: online,
  });

  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<BusySheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [header, setHeader] = useState(0);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [mappingConfidence, setMappingConfidence] = useState(false);
  const [showMappingConfig, setShowMappingConfig] = useState(false);
  const [company, setCompany] = useState("");
  const [rows, setRows] = useState<BusyRow[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [checkedCompany, setCheckedCompany] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "duplicates" | "issues" | "selected">("all");
  const [sort, setSort] = useState<"row" | "date">("row");
  const [incomplete, setIncomplete] = useState(false);
  const [weightConfirmed, setWeightConfirmed] = useState(false);
  const [fillReceiver, setFillReceiver] = useState("");
  const [result, setResult] = useState<Batch | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);

  const sheet = sheets[sheetIndex];
  const repeats = duplicateFileRows(rows);
  const existing = new Map((comparison?.existing ?? []).map((e) => [e.source_reference, e]));
  const frozen = working || uncertain || !!result || !!revertingId;

  async function handleRevert(batchId: string, filename: string) {
    if (
      !window.confirm(
        `Are you sure you want to revert import "${filename}"?\n\nThis will DELETE all entries imported in this batch from the register and restore the serial / bill sequence.`,
      )
    ) {
      return;
    }
    setRevertingId(batchId);
    try {
      const res = await revertFn({ data: { id: batchId } });
      toast.success(
        `Batch reverted: removed ${res.deleted_entries} entries and restored sequence.`,
      );
      await resetLocalStore();
      await history.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revert batch.");
    } finally {
      setRevertingId(null);
    }
  }

  function resetPreview() {
    setRows([]);
    setComparison(null);
    setResult(null);
    setWeightConfirmed(false);
    setError("");
    submission.current = null;
  }

  function clear() {
    setFile(null);
    setSheets([]);
    resetPreview();
    setCompany("");
    setUncertain(false);
    setShowMappingConfig(false);
    if (upload.current) upload.current.value = "";
  }

  function chooseSheet(i: number, choices = sheets) {
    const s = choices[i];
    if (!s) return;
    const found = detectMapping(s.grid);
    setSheetIndex(i);
    setHeader(found.header);
    setMapping(found.mapping);
    setMappingConfidence(found.confident);
    setShowMappingConfig(!found.confident);
    resetPreview();
  }

  async function loadFile(f: File | undefined) {
    if (!f || frozen) return;
    setWorking(true);
    setError("");
    try {
      const parsed = await readBusyWorkbook(f);
      if (!parsed.length) throw new Error("No worksheets found in workbook.");
      setFile(f);
      setSheets(parsed);
      chooseSheet(0, parsed);
      const initialCompany = parsed[0]?.grid[0]?.[0]?.trim() ?? "";
      setCompany(initialCompany);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read workbook.");
    } finally {
      setWorking(false);
    }
  }

  async function downloadSampleTemplate() {
    try {
      const bytes = await generateSampleBusyWorkbook();
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "BUSY_Sales_Voucher_Sample.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Sample BUSY template downloaded");
    } catch (e) {
      toast.error("Could not generate sample template: " + String(e));
    }
  }

  async function preview() {
    if (!sheet) return;
    setWorking(true);
    setError("");
    try {
      await sync();
      if (getState().syncError || getState().entries.some((e) => e._pending)) {
        throw new Error("Sync pending register entries first, then preview the import.");
      }
      const candidates = parseBusyRows(sheet.grid, header, mapping);
      if (!candidates.length) {
        throw new Error("No voucher rows found. Check the header row and column mapping.");
      }
      if (candidates.length > 500) {
        throw new Error("Preview up to 500 vouchers at a time. Export a smaller date range.");
      }

      const res = await previewFn({
        data: {
          company: company.trim(),
          references: candidates.map((r) => r.source_reference),
          count: candidates.length,
        },
      });

      const duplicates = duplicateFileRows(candidates);
      setRows(
        candidates.map((r) => ({
          ...r,
          selected:
            !duplicates.has(r.source_reference) &&
            !res.existing.some((e) => e.source_reference === r.source_reference) &&
            !rowIssues(r, incomplete).length,
        })),
      );
      setComparison(res);
      setCheckedCompany(company.trim());
      setResult(null);
      submission.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setWorking(false);
    }
  }

  function status(r: BusyRow): string {
    if (repeats.has(r.source_reference)) return "Duplicate within file";
    const old = existing.get(r.source_reference);
    if (old) {
      const diff = changedSource(
        (old.source_values ?? {}) as Record<string, unknown>,
        r.source_values,
      );
      if (r.action === "update") {
        return rowIssues(r, incomplete).length ? "Missing required fields" : "Ready to update";
      }
      return diff.length ? "Existing voucher has changed" : "Duplicate — already imported";
    }
    return rowIssues(r, incomplete).length ? "Missing required fields" : "Ready to import";
  }

  const selected = rows.filter((r) => r.selected);
  const duplicateCount = rows.filter(
    (r) => existing.has(r.source_reference) || repeats.has(r.source_reference),
  ).length;
  const invalidCount = rows.filter((r) => rowIssues(r, incomplete).length).length;
  const ready =
    selected.length > 0 &&
    selected.every((r) => ["Ready to import", "Ready to update"].includes(status(r))) &&
    !!comparison &&
    weightConfirmed &&
    checkedCompany === company.trim() &&
    online;

  // Detect unique units in parsed rows
  const unitsInFile = [...new Set(rows.map((r) => r.unit.trim().toUpperCase()).filter(Boolean))];
  const hasMixedUnits = unitsInFile.length > 1;
  const hasNonMtUnit = unitsInFile.some(
    (u) => !["MT", "TON", "TONS", "M.T.", "M.T", "METRIC TON"].includes(u),
  );

  const visible = rows
    .filter((r) => {
      if (filter === "duplicates") {
        return existing.has(r.source_reference) || repeats.has(r.source_reference);
      }
      if (filter === "issues") {
        return rowIssues(r, incomplete).length > 0;
      }
      if (filter === "selected") {
        return r.selected;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "date") {
        return a.entry_date.localeCompare(b.entry_date) || a.row - b.row;
      }
      return a.row - b.row;
    });

  const proposed = new Map<number, string>();
  // Auto-suggested sequential bill numbers for new records without manual override
  let proposedIndex = 0;
  selected.forEach((r) => {
    if (r.action === "new" && !existing.has(r.source_reference)) {
      if (r.bill_no?.trim()) {
        proposed.set(r.row, r.bill_no.trim());
      } else {
        proposed.set(r.row, comparison?.numbers[proposedIndex] ?? "Auto-assigned on import");
        proposedIndex++;
      }
    }
  });

  function edit(row: number, key: keyof BusyRow, value: string) {
    setRows((current) => current.map((r) => (r.row === row ? { ...r, [key]: value } : r)));
  }

  function paste(
    event: React.ClipboardEvent<HTMLInputElement>,
    row: number,
    key: "maal_liya" | "vehicle_no" | "weight_value" | "maal_diya" | "bill_no",
  ) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    event.preventDefault();
    const start = visible.findIndex((r) => r.row === row);
    const values = text.replace(/\r/g, "").trimEnd().split("\n");
    setRows((current) =>
      current.map((r) => {
        const i = visible.findIndex((v) => v.row === r.row) - start;
        return i >= 0 && i < values.length ? { ...r, [key]: values[i]?.split("\t")[0] ?? "" } : r;
      }),
    );
  }

  async function importRows(retry = false) {
    if (!retry && (!ready || !file)) return;
    if (
      !retry &&
      !window.confirm(
        `Import ${selected.length} selected vouchers? Sequential register Bill Nos. (starting at 168 or continuing existing sequence) are safely assigned on save. Approved updates retain their existing Bill No., serial, and receiver.`,
      )
    ) {
      return;
    }

    if (!retry && file) {
      submission.current = {
        id: crypto.randomUUID(),
        filename: file.name,
        company: checkedCompany,
        candidate_count: rows.length,
        review_count: rows.filter(
          (r) => rowIssues(r, incomplete).length || repeats.has(r.source_reference),
        ).length,
        rows: selected.map((r) => ({
          row: r.row,
          source_reference: r.source_reference,
          entry_date: r.entry_date,
          bill_no: r.bill_no?.trim() || undefined,
          maal_diya: r.maal_diya,
          maal_liya: r.maal_liya,
          weight_value: r.weight_value.trim(),
          vehicle_no: r.vehicle_no,
          action: r.action,
          existing_updated_at: r.existing_updated_at,
          source_values: r.source_values,
          allow_incomplete: incomplete,
          weight_confirmed: true as const,
        })),
      };
    }

    const payload = submission.current;
    if (!payload) return;
    setWorking(true);
    setError("");

    try {
      const saved = await confirmFn({ data: payload });
      setResult(saved);
      setUncertain(false);
      await history.refetch();
      await sync();
      toast.success(
        `${saved.inserted_count} added · ${saved.updated_count} updated · ${saved.duplicate_count} skipped · ${saved.failed_count} failed`,
      );
    } catch {
      const found = (await history.refetch()).data?.find((b) => b.id === payload.id);
      if (found) {
        setResult(found);
        setUncertain(false);
        await sync();
      } else {
        setUncertain(true);
        setError(
          'Confirmation was interrupted by a network issue. Click "Check / retry same batch" to safely verify or retry without creating duplicates.',
        );
      }
    } finally {
      setWorking(false);
    }
  }

  const fields = ["entry_date", "maal_diya", "maal_liya", "weight_value", "vehicle_no"] as const;
  const fieldLabels: Record<string, string> = {
    entry_date: "Date / तारीख",
    maal_diya: "माल दिया",
    maal_liya: "माल लिया",
    weight_value: "वजन (MT)",
    vehicle_no: "गाड़ी नं.",
  };

  function inputs(r: BusyRow, mobile: boolean) {
    return fields.map((key, index) => {
      const input = (
        <Input
          aria-label={`${fieldLabels[key]} row ${r.row}`}
          type={key === "entry_date" ? "date" : "text"}
          inputMode={key === "weight_value" ? "decimal" : undefined}
          value={r[key]}
          disabled={frozen || (r.action === "update" && key === "maal_liya")}
          maxLength={key === "weight_value" ? 30 : key === "vehicle_no" ? 50 : 200}
          onChange={(e) => edit(r.row, key, e.target.value)}
          onPaste={(e) => {
            if (key !== "entry_date") paste(e, r.row, key);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const nextKey = fields[index + 1];
            const label = nextKey
              ? `${fieldLabels[nextKey]} row ${r.row}`
              : `Date / तारीख row ${visible[visible.findIndex((x) => x.row === r.row) + 1]?.row}`;
            const root = e.currentTarget.closest("[data-preview]");
            const target = root?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
            target?.focus();
          }}
        />
      );

      return mobile ? (
        <div
          key={key}
          className={
            key === "maal_diya" || key === "maal_liya" ? "col-span-2 space-y-1" : "space-y-1"
          }
        >
          <Label className="text-xs font-medium">{fieldLabels[key]}</Label>
          {input}
        </div>
      ) : (
        <td key={key} className="min-w-36 p-2">
          {input}
        </td>
      );
    });
  }

  function rowActions(r: BusyRow) {
    const old = existing.get(r.source_reference);
    const issues = rowIssues(r, incomplete);
    const duplicate = repeats.get(r.source_reference);
    const differences = old
      ? changedSource((old.source_values ?? {}) as Record<string, unknown>, r.source_values)
      : [];

    const currentStatus = status(r);
    const isReady = currentStatus.startsWith("Ready");

    return (
      <div className="min-w-44 space-y-2 text-xs">
        <div
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold ${
            isReady
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          }`}
        >
          {isReady ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {currentStatus}
        </div>

        {issues.map((issue) => (
          <div key={issue} className="text-destructive font-medium">
            • {issue}
          </div>
        ))}

        {duplicate && (
          <div className="text-amber-600 dark:text-amber-400">
            Excel rows: {duplicate.join(", ")}. Review item rows; remove duplicates.
          </div>
        )}

        {old && (
          <div className="font-mono text-muted-foreground">
            Existing: Bill #{old.bill_no} · Serial #{old.register_serial_no}
          </div>
        )}

        {differences.map((k) => (
          <div key={k} className="break-words text-amber-700 dark:text-amber-300">
            <strong>{k}:</strong>{" "}
            {String((old?.source_values as Record<string, unknown> | null)?.[k] ?? "—")} →{" "}
            {r.source_values[k]}
          </div>
        ))}

        {old && differences.length > 0 && !old.archived_at && !old.cancelled_at && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            disabled={frozen}
            onClick={() => {
              if (
                !window.confirm(
                  `Update Bill No. ${old.bill_no} from this BUSY voucher? Receiver (${old.maal_liya || "blank"}), Bill No., and serial number remain protected.`,
                )
              ) {
                return;
              }
              setRows((current) =>
                current.map((x) =>
                  x.row === r.row
                    ? {
                        ...x,
                        action: "update",
                        selected: true,
                        maal_liya: old.maal_liya,
                        existing_updated_at: old.updated_at,
                      }
                    : x,
                ),
              );
            }}
          >
            Review & approve update
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-destructive"
          disabled={frozen}
          onClick={() => {
            if (window.confirm(`Remove Excel row ${r.row} from this preview?`)) {
              setRows((current) => current.filter((x) => x.row !== r.row));
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove row
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Import from BUSY Excel" />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void downloadSampleTemplate()}
            className="gap-1.5"
            title="Download a pre-formatted sample BUSY Excel file"
          >
            <Download className="h-4 w-4" /> Download Sample Template
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInstructions((prev) => !prev)}
            className="gap-1.5 text-muted-foreground"
          >
            <Info className="h-4 w-4" /> {showInstructions ? "Hide Guide" : "Instructions"}
          </Button>
        </div>
      </div>

      {!online && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>
            You can load and inspect Excel workbooks offline. Duplicate checks and final import
            require an active internet connection.
          </span>
        </div>
      )}

      {/* Instructions Card */}
      {showInstructions && (
        <div className="rounded-lg border bg-card p-4 shadow-sm text-sm space-y-3">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Info className="h-4 w-4" /> Quick Import Guide for BUSY Sales Vouchers
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <span className="font-semibold text-foreground">1. Export from BUSY</span>
              <p>Export your Sales Vouchers from BUSY as a standard Excel (.xlsx) file.</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <span className="font-semibold text-foreground">2. Upload & Detect</span>
              <p>
                Header row and columns are detected automatically, skipping report titles & blank
                rows.
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <span className="font-semibold text-foreground">3. Review & Fill 'माल लिया'</span>
              <p>
                Enter the receiver name (माल लिया) manually or with bulk-fill. Confirm weight is in
                MT.
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <span className="font-semibold text-foreground">4. Bill Numbering</span>
              <p>
                Auto-uses voucher numbers (e.g. PC/1/... → Bill 1). Can also use sequential or custom numbers.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive text-sm break-words flex items-start gap-2"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Upload and File Section */}
      <section className="space-y-4">
        <input
          ref={upload}
          aria-label="Upload BUSY Excel file"
          className="hidden"
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => void loadFile(e.target.files?.[0])}
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void loadFile(e.dataTransfer.files[0]);
          }}
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-muted/30 px-4 py-8 text-center transition-colors hover:bg-muted/50"
        >
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <FileSpreadsheet className="h-8 w-8" />
          </div>

          {file ? (
            <div className="max-w-full space-y-0.5">
              <div className="break-all font-semibold text-base">{file.name}</div>
              <div className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB · {sheets.length} worksheet
                {sheets.length === 1 ? "" : "s"}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="font-medium">Drag & drop your BUSY Excel file here, or browse</div>
              <div className="text-xs text-muted-foreground">
                Accepts .xlsx sales voucher workbooks exported from BUSY
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button
              size="default"
              disabled={frozen}
              onClick={() => upload.current?.click()}
              className="gap-2"
            >
              {working ? (
                <Loader2 className="animate-spin h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {file ? "Browse Another File" : "Upload Excel File"}
            </Button>
            {file && (
              <Button
                variant="outline"
                size="default"
                disabled={working || uncertain}
                onClick={clear}
                className="gap-1.5"
              >
                <Trash2 className="h-4 w-4" /> Clear File
              </Button>
            )}
          </div>
        </div>

        {/* Sheet and Column Configuration */}
        {sheet && (
          <fieldset disabled={frozen} className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="font-semibold text-sm">Workbook Configuration</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMappingConfig((prev) => !prev)}
                className="text-xs text-muted-foreground h-7"
              >
                {showMappingConfig ? "Hide Column Mapping" : "Adjust Column Mapping"}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="busy-company" className="text-xs font-medium">
                  Company / Financial Year Scope
                </Label>
                <Input
                  id="busy-company"
                  maxLength={200}
                  placeholder="e.g. FY 2026-27"
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setComparison(null);
                  }}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="busy-sheet" className="text-xs font-medium">
                  Worksheet
                </Label>
                <select
                  id="busy-sheet"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={sheetIndex}
                  onChange={(e) => chooseSheet(Number(e.target.value))}
                >
                  {sheets.map((s, i) => (
                    <option value={i} key={s.name}>
                      {s.name} ({s.grid.length} rows)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="busy-header" className="text-xs font-medium">
                  Header Row Number
                </Label>
                <Input
                  id="busy-header"
                  type="number"
                  min={1}
                  max={sheet.grid.length}
                  value={header + 1}
                  onChange={(e) => {
                    setHeader(
                      Math.max(0, Math.min(sheet.grid.length - 1, Number(e.target.value) - 1)),
                    );
                    setRows([]);
                    setComparison(null);
                  }}
                />
              </div>
            </div>

            {/* Column Mapping Section */}
            {showMappingConfig && (
              <div className="pt-2 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    Excel Column to Transport Register Mapping
                  </div>
                  {mappingConfidence && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <Check className="h-3 w-3" /> Auto-detected
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {BUSY_FIELDS.map((k) => (
                    <div key={k} className="space-y-1">
                      <Label htmlFor={`map-${k}`} className="text-xs font-medium">
                        {LABELS[k]}
                      </Label>
                      <select
                        id={`map-${k}`}
                        value={mapping[k]}
                        className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                        onChange={(e) => {
                          setMapping((m) => ({ ...m, [k]: Number(e.target.value) }));
                          setRows([]);
                          setComparison(null);
                        }}
                      >
                        <option value={-1}>-- Choose column --</option>
                        {sheet.grid[header]?.map((v, i) => (
                          <option key={i} value={i}>
                            Col {i + 1}: {v || "(blank)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <Button
                disabled={
                  working ||
                  !online ||
                  !company.trim() ||
                  ["entry_date", "source_reference", "maal_diya"].some(
                    (k) => mapping[k as keyof Mapping] < 0,
                  ) ||
                  (!incomplete && (mapping.weight_value < 0 || mapping.vehicle_no < 0))
                }
                onClick={() => void preview()}
                className="gap-2"
              >
                {working ? (
                  <Loader2 className="animate-spin h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Preview Import Candidates
              </Button>

              <span className="text-xs text-muted-foreground">
                Requires Date, BUSY Ref, and Party Name columns to be mapped.
              </span>
            </div>
          </fieldset>
        )}
      </section>

      {/* Validation & Weight Confirmation Options */}
      {sheet && (
        <fieldset
          disabled={frozen}
          className="space-y-3 rounded-lg border bg-card p-4 shadow-sm text-sm"
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 rounded accent-primary"
              checked={incomplete}
              onChange={(e) => setIncomplete(e.target.checked)}
            />
            <div>
              <span className="font-medium">
                Allow blank weight or vehicle for later correction
              </span>
              <p className="text-xs text-muted-foreground">
                Date, BUSY reference, and party name are always mandatory. Receiver (माल लिया) is
                entered manually.
              </p>
            </div>
          </label>

          {hasMixedUnits && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Mixed Units Detected in File:</strong> Found [{unitsInFile.join(", ")}].
                Transport Register stores weight in MT (Metric Tonnes). Please ensure your
                quantities represent MT weight before confirming.
              </div>
            </div>
          )}

          {hasNonMtUnit && !hasMixedUnits && (
            <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-700/50 dark:bg-blue-950/30 dark:text-blue-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Unit Information:</strong> Source unit detected as [{unitsInFile.join(", ")}
                ]. Confirm below that the numeric quantities represent MT.
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded accent-primary"
                checked={weightConfirmed}
                onChange={(e) => setWeightConfirmed(e.target.checked)}
              />
              <div>
                <span className="font-medium">
                  I confirm the selected quantities represent weight in MT, without conversion.
                </span>
                <span className="text-xs text-muted-foreground block">
                  Units in file: {unitsInFile.length ? unitsInFile.join(", ") : "None specified"}
                </span>
              </div>
            </label>
          )}
        </fieldset>
      )}

      {/* Preview Grid and Action Toolbar */}
      {rows.length > 0 && (
        <section className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["Candidate rows", rows.length, "border-blue-500"],
              [
                "Valid new records",
                rows.filter((r) => status(r) === "Ready to import").length,
                "border-emerald-500",
              ],
              ["Duplicates / existing", duplicateCount, "border-amber-500"],
              ["Missing information", invalidCount, "border-rose-500"],
              ["Selected for import", selected.length, "border-primary font-bold"],
            ].map(([label, n, border]) => (
              <div
                key={label as string}
                className={`rounded-lg border bg-card p-3 shadow-sm border-l-4 ${border}`}
              >
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-2xl font-bold tabular-nums mt-0.5">{n}</div>
              </div>
            ))}
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter preview"
                value={filter}
                onChange={(e) =>
                  setFilter(e.target.value as "all" | "duplicates" | "issues" | "selected")
                }
                className="h-9 rounded-md border bg-background px-2 text-xs"
              >
                <option value="all">All rows ({rows.length})</option>
                <option value="duplicates">Review Duplicates ({duplicateCount})</option>
                <option value="issues">Missing / Invalid ({invalidCount})</option>
                <option value="selected">Selected ({selected.length})</option>
              </select>

              <select
                aria-label="Sort preview"
                value={sort}
                onChange={(e) => setSort(e.target.value as "row" | "date")}
                className="h-9 rounded-md border bg-background px-2 text-xs"
              >
                <option value="row">Order: Excel row order</option>
                <option value="date">Order: Voucher date</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                disabled={frozen}
                onClick={() =>
                  setRows((current) =>
                    current.map((r) => ({
                      ...r,
                      action: "new",
                      selected: status(r) === "Ready to import",
                    })),
                  )
                }
              >
                Import New Records Only
              </Button>

              <Button
                variant="ghost"
                size="sm"
                disabled={frozen}
                onClick={() =>
                  setRows((current) => current.map((r) => ({ ...r, selected: false })))
                }
              >
                Deselect all
              </Button>
            </div>

            {/* Bulk Fill 'माल लिया' (Receiver) */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Fill receiver for selected rows"
                placeholder="माल लिया (receiver) for selected"
                className="h-9 max-w-xs text-xs"
                value={fillReceiver}
                onChange={(e) => setFillReceiver(e.target.value)}
                disabled={frozen}
                maxLength={200}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={frozen || !selected.length || !fillReceiver.trim()}
                onClick={() => {
                  setRows((current) =>
                    current.map((r) =>
                      r.selected && r.action === "new"
                        ? { ...r, maal_liya: fillReceiver.trim() }
                        : r,
                    ),
                  );
                  toast.success(`Filled receiver for ${selected.length} selected row(s)`);
                }}
              >
                Fill selected receivers
              </Button>
              <div className="h-4 w-px bg-border mx-1" />
              <Button
                variant="outline"
                size="sm"
                disabled={frozen || !rows.length}
                title="Extracts voucher number from BUSY ref (e.g. PC/1/26-27 -> 1, PC/185/26-27 -> 185)"
                onClick={() => {
                  setRows((current) =>
                    current.map((r) => ({
                      ...r,
                      bill_no: extractVoucherNumber(r.source_reference),
                    })),
                  );
                  toast.success("Applied BUSY Voucher numbers (1, 2, ... 185) as Bill Nos.");
                }}
              >
                Use Voucher No. as Bill No.
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={frozen || !rows.length}
                title="Clears specific bill numbers so register auto-assigns next sequential numbers"
                onClick={() => {
                  setRows((current) =>
                    current.map((r) => ({
                      ...r,
                      bill_no: "",
                    })),
                  );
                  toast.info("Cleared Bill Nos. Register will auto-assign sequential numbers.");
                }}
              >
                Use Sequential Bill Nos.
              </Button>
            </div>
          </div>

          {/* Desktop Table Preview */}
          <div
            data-preview
            className="hidden max-h-[600px] overflow-auto rounded-lg border bg-card shadow-sm md:block"
          >
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur text-left">
                <tr>
                  {[
                    "Select",
                    "Row",
                    "BUSY Ref",
                    "Proposed Bill No.",
                    "Date / तारीख",
                    "माल दिया (Party)",
                    "माल लिया (Receiver)",
                    "वजन (MT)",
                    "गाड़ी नं. (Vehicle)",
                    "Status / Actions",
                  ].map((h) => (
                    <th
                      className="whitespace-nowrap p-2 font-semibold text-muted-foreground"
                      key={h}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((r) => (
                  <tr
                    key={r.row}
                    className={`transition-colors hover:bg-muted/40 ${r.selected ? "bg-primary/5" : ""}`}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Select row ${r.row}`}
                        className="h-4 w-4 rounded accent-primary cursor-pointer"
                        checked={r.selected}
                        disabled={
                          frozen ||
                          repeats.has(r.source_reference) ||
                          (!!existing.get(r.source_reference) && r.action !== "update")
                        }
                        onChange={(e) =>
                          setRows((current) =>
                            current.map((x) =>
                              x.row === r.row ? { ...x, selected: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="p-2 font-mono text-muted-foreground">{r.row}</td>
                    <td className="min-w-36 p-2">
                      <div className="font-mono font-medium">{r.source_reference}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.item || "Item"} · {r.unit || "MT"}
                      </div>
                    </td>
                    <td className="p-2 font-mono min-w-28">
                      {existing.get(r.source_reference) ? (
                        <span className="font-semibold">
                          {existing.get(r.source_reference)?.bill_no}
                        </span>
                      ) : (
                        <Input
                          aria-label={`Bill No row ${r.row}`}
                          type="text"
                          inputMode="numeric"
                          placeholder={proposed.get(r.row) ?? "Auto"}
                          value={r.bill_no ?? ""}
                          disabled={frozen}
                          maxLength={15}
                          className="h-8 text-xs font-mono"
                          onChange={(e) =>
                            edit(r.row, "bill_no", e.target.value.replace(/[^0-9]/g, ""))
                          }
                        />
                      )}
                    </td>
                    {inputs(r, false)}
                    <td className="p-2">{rowActions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Preview */}
          <div data-preview className="space-y-3 md:hidden">
            {visible.map((r) => (
              <article
                key={r.row}
                className="space-y-3 rounded-lg border bg-card p-4 shadow-sm text-xs"
              >
                <div className="flex items-start justify-between gap-2 border-b pb-2">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label={`Select mobile row ${r.row}`}
                      className="h-4 w-4 rounded accent-primary"
                      checked={r.selected}
                      disabled={
                        frozen ||
                        repeats.has(r.source_reference) ||
                        (!!existing.get(r.source_reference) && r.action !== "update")
                      }
                      onChange={(e) =>
                        setRows((current) =>
                          current.map((x) =>
                            x.row === r.row ? { ...x, selected: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    Row {r.row}
                  </label>
                  <div className="font-mono text-muted-foreground">
                    Bill No:{" "}
                    {existing.get(r.source_reference)?.bill_no ?? proposed.get(r.row) ?? "Auto"}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="font-mono font-medium text-sm">{r.source_reference}</div>
                  <div className="text-muted-foreground">
                    {r.item || "Item"} · {r.unit || "MT"}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    Proposed Bill No. (optional override)
                  </Label>
                  <Input
                    aria-label={`Bill No mobile row ${r.row}`}
                    type="text"
                    inputMode="numeric"
                    placeholder={proposed.get(r.row) ?? "Auto-assigned"}
                    value={r.bill_no ?? ""}
                    disabled={frozen || !!existing.get(r.source_reference)}
                    maxLength={15}
                    className="h-8 text-xs font-mono"
                    onChange={(e) => edit(r.row, "bill_no", e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">{inputs(r, true)}</div>

                <div className="border-t pt-2">{rowActions(r)}</div>
              </article>
            ))}
          </div>

          {!visible.length && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No candidate rows match this filter.
            </p>
          )}

          {/* Sticky Bottom Confirmation Bar */}
          {!result && (
            <div className="sticky bottom-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 backdrop-blur p-4 shadow-lg md:bottom-0">
              <div className="text-sm">
                <strong className="text-foreground">{selected.length} vouchers selected</strong>
                <div className="text-xs text-muted-foreground">
                  Sequential Bill Nos. are safely assigned on confirmation. BUSY voucher references
                  are preserved internally.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" disabled={frozen} onClick={resetPreview}>
                  Cancel Import
                </Button>
                {uncertain ? (
                  <Button
                    disabled={working || !online}
                    onClick={() => void importRows(true)}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" /> Check / retry same batch
                  </Button>
                ) : (
                  <Button
                    disabled={!ready || working}
                    onClick={() => void importRows()}
                    className="gap-2"
                  >
                    {working ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Confirm Import
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Import Result Section */}
      {result && (
        <section role="status" className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-base font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" /> Import Completed
          </div>
          <p className="text-sm">
            <strong>{result.inserted_count}</strong> added · <strong>{result.updated_count}</strong>{" "}
            updated · <strong>{result.duplicate_count}</strong> skipped as duplicates ·{" "}
            <strong>{result.failed_count}</strong> failed
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">Batch ID: {result.id}</p>
          <ResultRows results={result.results} />
          <div className="pt-2">
            <Button asChild variant="outline">
              <Link to="/register">View Full Transport Register</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Import History Section */}
      <section className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Import History</h2>
            <p className="text-xs text-muted-foreground">
              Audit log of previous BUSY voucher imports
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Refresh import history"
            aria-label="Refresh import history"
            onClick={() => void history.refetch()}
            disabled={!online}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {history.isError && (
          <p className="text-sm text-destructive">
            Import history requires an authorized online connection.
          </p>
        )}

        {!history.data?.length && !history.isError && (
          <p className="text-sm text-muted-foreground">
            {history.isPending ? "Checking history…" : "No previous imports recorded."}
          </p>
        )}

        <div className="space-y-3">
          {history.data?.map((b) => (
            <article
              key={b.id}
              className="rounded-lg border bg-card p-4 shadow-sm text-xs space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="break-all font-semibold text-sm">{b.filename}</div>
                  <div className="text-muted-foreground">
                    {new Date(b.created_at).toLocaleString("en-IN")} · Scope:{" "}
                    {b.company || "Default"} · Status:{" "}
                    <span className="font-medium text-foreground">
                      {b.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {b.candidate_count} candidates · {b.inserted_count} added · {b.updated_count}{" "}
                    updated · {b.duplicate_count} duplicates · {b.review_count} review ·{" "}
                    {b.failed_count} failed
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHistoryOpen(historyOpen === b.id ? null : b.id)}
                    className="text-xs"
                  >
                    {historyOpen === b.id ? "Close result" : "Inspect result"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!online || revertingId === b.id}
                    onClick={() => void handleRevert(b.id, b.filename)}
                    className="text-xs"
                    title="Undo this import, delete imported entries, and restore bill numbering sequence"
                  >
                    {revertingId === b.id ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Reverting…
                      </>
                    ) : (
                      <>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Undo / Revert
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {historyOpen === b.id && (
                <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3">
                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    Batch UUID: {b.id}
                  </p>
                  <ResultRows results={b.results} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResultRows({ results }: { results: unknown }) {
  if (!Array.isArray(results) || !results.length) return null;
  return (
    <ul className="max-h-64 overflow-auto space-y-1 text-xs border rounded-md p-2 bg-background/50 font-mono">
      {results.map((r, i) => (
        <li
          key={i}
          className={
            r.status === "failed"
              ? "text-destructive font-medium"
              : r.status === "updated"
                ? "text-blue-600 dark:text-blue-400"
                : "text-foreground"
          }
        >
          Row {r.row}: <strong>{r.status}</strong>
          {r.bill && ` · Bill No. ${r.bill}`}
          {r.reason && ` · Reason: ${r.reason}`}
        </li>
      ))}
    </ul>
  );
}
