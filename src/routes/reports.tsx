import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntryTable, PageTitle } from "@/components/EntryViews";
import { orderKey, useRegister, type LocalEntry as Entry } from "@/lib/local-store";
import { filterEntries } from "@/lib/local-query";
import { downloadRegisterXlsx, exportFilename } from "@/lib/excel";
import { fmtDate, friendlyError, localToday, monthStart, sumWeights, toISODate } from "@/lib/format";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Transport Register" },
      { name: "description", content: "Daily, monthly and custom-period register reports." },
      { property: "og:title", content: "Reports — Transport Register" },
      { property: "og:description", content: "Register reports." },
    ],
  }),
  component: Reports,
});

function lastMonth() {
  const d = new Date();
  return { from: toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: toISODate(new Date(d.getFullYear(), d.getMonth(), 0)) };
}

function Reports() {
  const [range, setRange] = useState({ from: localToday(), to: localToday() });
  const [exporting, setExporting] = useState(false);
  const { entries, ready } = useRegister();
  const rows = useMemo(() => filterEntries(entries, range).sort((a, b) => orderKey(a) - orderKey(b)), [entries, range]);

  const units = useMemo(() => [...new Set(rows.filter((r) => r.weight_value !== null).map((r) => r.weight_unit ?? ""))], [rows]);
  const unit = units[0] || "MT";
  const mixed = units.length > 1;

  const group = (key: (r: Entry) => string) => {
    const m = new Map<string, { n: number; w: (number | null)[] }>();
    for (const r of rows) {
      const k = key(r);
      const g = m.get(k) ?? { n: 0, w: [] };
      g.n++;
      g.w.push(r.weight_value);
      m.set(k, g);
    }
    return [...m.entries()].map(([k, g]) => ({ k, n: g.n, w: sumWeights(g.w) })).sort((a, b) => b.n - a.n);
  };
  const byDay = useMemo(() => group((r) => r.entry_date ?? "").sort((a, b) => a.k.localeCompare(b.k)), [rows]);
  const byDiya = useMemo(() => group((r) => r.maal_diya), [rows]);
  const byLiya = useMemo(() => group((r) => r.maal_liya), [rows]);
  const byVeh = useMemo(() => group((r) => r.vehicle_no), [rows]);
  const totalW = sumWeights(rows.map((r) => r.weight_value));
  const label = range.from === range.to ? fmtDate(range.from) : `${fmtDate(range.from)} – ${fmtDate(range.to)}`;

  async function dl() {
    setExporting(true);
    try {
      await downloadRegisterXlsx(rows, exportFilename(range.from, range.to), unit);
      toast.success(`Downloaded ${rows.length} entries`);
    } catch (e) {
      toast.error("Export failed: " + friendlyError(e));
    } finally {
      setExporting(false);
    }
  }

  const presets = [
    { l: "Today", r: { from: localToday(), to: localToday() } },
    { l: "This month", r: { from: monthStart(), to: localToday() } },
    { l: "Last month", r: lastMonth() },
  ];

  return (
    <div>
      <PageTitle title="Reports" sub={label}>
        <Button variant="outline" disabled={!rows.length || exporting} onClick={dl}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Current Report
        </Button>
        <Button variant="outline" disabled={!rows.length} onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
      </PageTitle>

      <div className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        {presets.map((p) => (
          <Button key={p.l} variant={p.r.from === range.from && p.r.to === range.to ? "default" : "secondary"} size="sm" onClick={() => setRange(p.r)}>{p.l}</Button>
        ))}
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></div>
      </div>

      {!ready ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:max-w-lg">
            <div className="rounded-lg border bg-card p-4"><div className="text-xs uppercase text-muted-foreground">Entries</div><div className="text-2xl font-bold">{rows.length}</div></div>
            <div className="rounded-lg border bg-card p-4"><div className="text-xs uppercase text-muted-foreground">Total वजन</div><div className="text-2xl font-bold">{mixed ? "Mixed units" : `${totalW} ${unit}`}</div></div>
          </div>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-card p-8 text-center text-muted-foreground">No entries in this period.</p>
          ) : (
            <div className="no-print grid gap-4 lg:grid-cols-2">
              <GroupTable title="Day-wise" col="Date" rows={byDay.map((g) => ({ ...g, k: fmtDate(g.k) }))} unit={unit} />
              <GroupTable title="Vehicle-wise (गाड़ी नं.)" col="गाड़ी नं." rows={byVeh} unit={unit} />
              <GroupTable title="Party-wise — माल दिया" col="माल दिया" rows={byDiya} unit={unit} />
              <GroupTable title="Party-wise — माल लिया" col="माल लिया" rows={byLiya} unit={unit} />
            </div>
          )}
          {rows.length > 0 && (
            <div className="print-only">
              <h1 className="mb-2 text-lg font-bold">Transport Register — {label}</h1>
              <EntryTable rows={rows} actions={false} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GroupTable({ title, col, rows, unit }: { title: string; col: string; rows: { k: string; n: number; w: number }[]; unit: string }) {
  return (
    <section className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2.5 font-semibold">{title}</h3>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
            <tr><th className="px-4 py-2">{col}</th><th className="px-4 py-2 text-right">Entries</th><th className="px-4 py-2 text-right">वजन ({unit})</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-t"><td className="break-words px-4 py-1.5">{r.k}</td><td className="px-4 py-1.5 text-right tabular">{r.n}</td><td className="px-4 py-1.5 text-right tabular">{r.w}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
