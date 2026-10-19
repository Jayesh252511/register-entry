import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, List, Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EntryList, PageTitle } from "@/components/EntryViews";
import { exportEntries, getDashboard } from "@/lib/register.functions";
import { downloadRegisterXlsx, exportFilename } from "@/lib/excel";
import { friendlyError, localToday, monthStart } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Transport Register" },
      { name: "description", content: "Today's and this month's transport register summary." },
      { property: "og:title", content: "Dashboard — Transport Register" },
      { property: "og:description", content: "Transport register summary." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const q = useQuery({
    queryKey: ["dashboard", localToday()],
    queryFn: () => getDashboard({ data: { today: localToday(), monthStart: monthStart() } }),
    refetchInterval: 60_000,
  });
  const [exporting, setExporting] = useState(false);

  async function exportAll() {
    setExporting(true);
    try {
      const rows = await exportEntries({ data: {} });
      if (!rows.length) return toast.info("No entries to export yet.");
      await downloadRegisterXlsx(rows, exportFilename(), q.data?.unit ?? "MT");
      toast.success(`Downloaded ${rows.length} entries`);
    } catch (e) {
      toast.error("Export failed: " + friendlyError(e));
    } finally {
      setExporting(false);
    }
  }

  const d = q.data;
  const month = new Date().toLocaleString("en-IN", { month: "long" });

  return (
    <div>
      <PageTitle title="Dashboard" sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
        <Button asChild size="lg"><Link to="/new"><PlusCircle className="h-4 w-4" /> New Entry</Link></Button>
        <Button asChild variant="secondary" size="lg"><Link to="/register"><List className="h-4 w-4" /> Full Register</Link></Button>
        <Button variant="outline" size="lg" onClick={exportAll} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export Excel
        </Button>
      </PageTitle>

      {q.error && <p className="text-destructive">{friendlyError(q.error)}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total entries" value={d?.total} />
        <Stat label="Today" value={d?.today} />
        <Stat label={`${month}`} value={d?.month} />
        <Stat label={`वजन in ${month}`} value={d ? (d.monthWeight === null ? "Mixed units" : `${Number(d.monthWeight.toFixed(6))} ${d.unit}`) : undefined} />
        <Stat label="Next Bill No." value={d?.nextBill} mono />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recently added</h2>
      {d && d.recent.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-lg font-semibold">Your register is ready</p>
          <p className="mt-1 text-sm text-muted-foreground">The first bill will be No. {d.nextBill}.</p>
          <Button asChild size="lg" className="mt-5"><Link to="/new"><PlusCircle className="h-4 w-4" /> Add First Entry</Link></Button>
        </div>
      ) : d ? (
        <EntryList rows={d.recent} />
      ) : (
        <p className="text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value?: number | string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular ${mono ? "font-mono" : ""}`}>{value ?? "…"}</div>
    </div>
  );
}
