import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Loader2, PlusCircle, Printer, Search as SearchIcon, X } from "lucide-react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntryList, EntryTable } from "@/components/EntryViews";
import { exportEntries, listEntries, type Entry, type Filters } from "@/lib/register.functions";
import { downloadRegisterXlsx, exportFilename } from "@/lib/excel";
import { friendlyError, fmtDate } from "@/lib/format";

const PAGE = 25;
const hasAny = (f: Filters) => Object.values(f).some((v) => v);

export function RegisterBrowser({ showFilters }: { showFilters: boolean }) {
  const [draft, setDraft] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<null | "all" | "filtered" | "print">(null);
  const [printRows, setPrintRows] = useState<Entry[] | null>(null);

  const q = useQuery({
    queryKey: ["entries", filters, page],
    queryFn: () => listEntries({ data: { ...filters, page, pageSize: PAGE } }),
    placeholderData: keepPreviousData,
  });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  async function doExport(kind: "all" | "filtered") {
    setBusy(kind);
    try {
      const f = kind === "all" ? {} : filters;
      const rows = await exportEntries({ data: f });
      if (!rows.length) { toast.info("No entries to export."); return; }
      await downloadRegisterXlsx(rows, exportFilename(f.from, f.to), rows.find((r) => r.weight_unit)?.weight_unit ?? "MT");
      toast.success(`Downloaded ${rows.length} entries`);
    } catch (e) {
      toast.error("Export failed: " + friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function doPrint() {
    setBusy("print");
    try {
      const rows = await exportEntries({ data: filters });
      flushSync(() => setPrintRows(rows));
      window.print();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFilters({ ...draft });
    setPage(1);
  };

  return (
    <div>
      {showFilters && (
        <form onSubmit={apply} className="no-print mb-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
          <FI label="From date" type="date" value={draft.from} onChange={(v) => setDraft({ ...draft, from: v })} />
          <FI label="To date" type="date" value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} />
          <FI label="Bill No." value={draft.bill} onChange={(v) => setDraft({ ...draft, bill: v })} />
          <FI label="Party (माल दिया / लिया)" value={draft.party} onChange={(v) => setDraft({ ...draft, party: v })} />
          <FI label="गाड़ी नं." value={draft.vehicle} onChange={(v) => setDraft({ ...draft, vehicle: v })} />
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1"><SearchIcon className="h-4 w-4" /> Search</Button>
            {hasAny(filters) && (
              <Button type="button" variant="ghost" size="icon" aria-label="Clear filters" onClick={() => { setDraft({}); setFilters({}); setPage(1); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      )}

      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? "Loading…" : `${total} ${total === 1 ? "entry" : "entries"}${hasAny(filters) ? " match" : ""}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => doExport("all")}>
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} All Entries
          </Button>
          {hasAny(filters) && (
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => doExport("filtered")}>
              {busy === "filtered" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Filtered Entries
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={!!busy} onClick={doPrint}>
            {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print
          </Button>
        </div>
      </div>

      <div className="no-print">
        {q.error ? (
          <p className="text-destructive">{friendlyError(q.error)}</p>
        ) : q.data && q.data.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-10 text-center">
            <p className="font-medium">{hasAny(filters) ? "No entries match these filters." : "The register is empty."}</p>
            {!hasAny(filters) && (
              <Button asChild className="mt-4"><Link to="/new"><PlusCircle className="h-4 w-4" /> Add First Entry</Link></Button>
            )}
          </div>
        ) : q.data ? (
          <EntryList rows={q.data.rows} />
        ) : null}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Newer</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older <ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {printRows && (
        <div className="print-only">
          <h1 className="mb-1 text-lg font-bold">Transport Register</h1>
          <p className="mb-3 text-xs">
            {filters.from || filters.to ? `${filters.from ? fmtDate(filters.from) : "Start"} – ${filters.to ? fmtDate(filters.to) : "Today"}` : "All entries"} · {printRows.length} entries
          </p>
          <EntryTable rows={printRows} actions={false} />
        </div>
      )}
    </div>
  );
}

function FI({ label, value, onChange, type = "text" }: { label: string; value?: string | undefined; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value || "")} />
    </div>
  );
}
