import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, List, Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EntryList, PageTitle } from "@/components/EntryViews";
import { orderKey, suggestNextBill, useRegister } from "@/lib/local-store";
import { downloadRegisterXlsx, exportFilename } from "@/lib/excel";
import { friendlyError, localToday, monthStart, sumWeights } from "@/lib/format";

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
  const { entries, ready, meta } = useRegister();
  const [exporting, setExporting] = useState(false);
  const stats = useMemo(() => {
    const today = localToday();
    const ms = monthStart();
    const month = entries.filter((e) => e.entry_date >= ms && e.entry_date <= today);
    const units = new Set(month.filter((e) => e.weight_value !== null).map((e) => e.weight_unit ?? ""));
    return {
      total: entries.length,
      today: entries.filter((e) => e.entry_date === today).length,
      month: month.length,
      weight: units.size > 1 ? null : sumWeights(month.map((e) => e.weight_value)),
    };
  }, [entries]);

  async function exportAll() {
    setExporting(true);
    try {
      if (!entries.length) {
        toast.info("No entries to export yet.");
        return;
      }
      const list = [...entries].sort((a, b) => orderKey(a) - orderKey(b));
      await downloadRegisterXlsx(list, exportFilename(), meta.unit);
      toast.success(`Downloaded ${list.length} entries`);
    } catch (e) {
      toast.error("Export failed: " + friendlyError(e));
    } finally {
      setExporting(false);
    }
  }

  const monthName = new Date().toLocaleString("en-IN", { month: "long" });
  const show = (v: string | number) => (ready ? v : "…");

  return (
    <div>
      <PageTitle title="Dashboard" sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
        <Button asChild size="lg"><Link to="/new"><PlusCircle className="h-4 w-4" /> New Entry</Link></Button>
        <Button asChild variant="secondary" size="lg"><Link to="/register"><List className="h-4 w-4" /> Full Register</Link></Button>
        <Button variant="outline" size="lg" onClick={exportAll} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export Excel
        </Button>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total entries" value={show(stats.total)} />
        <Stat label="Today" value={show(stats.today)} />
        <Stat label={monthName} value={show(stats.month)} />
        <Stat label={`वजन in ${monthName}`} value={show(stats.weight === null ? "Mixed units" : `${stats.weight} ${meta.unit}`)} />
        <Stat label="Next Bill No." value={show(suggestNextBill())} mono />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recently added</h2>
      {ready && entries.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-lg font-semibold">Your register is ready</p>
          <p className="mt-1 text-sm text-muted-foreground">The first bill will be No. {suggestNextBill()}.</p>
          <Button asChild size="lg" className="mt-5"><Link to="/new"><PlusCircle className="h-4 w-4" /> Add First Entry</Link></Button>
        </div>
      ) : (
        <EntryList rows={entries.slice(0, 5)} />
      )}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: number | string; mono?: boolean | undefined }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
