import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, List, Pencil, PlusCircle } from "lucide-react";
import { z } from "zod";
import { EntryCard, PageTitle } from "@/components/EntryViews";
import { Button } from "@/components/ui/button";
import { getEntry, getNextBill } from "@/lib/register.functions";
import { friendlyError } from "@/lib/format";

export const Route = createFileRoute("/entries/$id")({
  validateSearch: z.object({ saved: z.number().optional() }),
  head: () => ({
    meta: [
      { title: "Entry — Transport Register" },
      { name: "description", content: "View a register entry and the entry before it." },
      { property: "og:title", content: "Entry — Transport Register" },
      { property: "og:description", content: "View a register entry." },
    ],
  }),
  component: EntryPage,
});

function EntryPage() {
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/entries/$id/edit", fuzzy: false })) return <Outlet />;
  return <EntryDetail />;
}

function EntryDetail() {
  const { id } = Route.useParams();
  const { saved } = Route.useSearch();
  const q = useQuery({ queryKey: ["entry", id], queryFn: () => getEntry({ data: { id } }) });
  const next = useQuery({ queryKey: ["nextBill"], queryFn: () => getNextBill(), enabled: !!saved });

  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{friendlyError(q.error)}</p>;
  if (!q.data?.entry) return <p className="text-muted-foreground">Entry not found.</p>;
  const { entry, previous, history } = q.data;

  return (
    <div className="max-w-3xl">
      {saved ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-success bg-card p-4">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
          <div>
            <p className="font-semibold">Entry saved successfully</p>
            <p className="text-sm text-muted-foreground">
              Bill No. {entry.bill_no} · Sr. {entry.register_serial_no}
              {next.data && <> · Next suggested Bill No.: <span className="font-mono font-semibold text-foreground">{next.data.nextBill}</span></>}
            </p>
          </div>
        </div>
      ) : (
        <PageTitle title={`Entry Sr. ${entry.register_serial_no}`} sub={`Bill No. ${entry.bill_no}`} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{saved ? "Newly saved entry" : "This entry"}</h2>
          <EntryCard r={entry} actions={false} tone={saved ? "new" : undefined} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Previous entry</h2>
          {previous ? (
            <EntryCard r={previous} />
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">This is the first entry in the register.</div>
          )}
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild size="lg">
          <Link to="/new"><PlusCircle className="h-4 w-4" /> Add Another Entry</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link to="/register"><List className="h-4 w-4" /> View Full Register</Link>
        </Button>
        {saved ? (
          <Button asChild variant="ghost" size="lg">
            <Link to="/entries/$id" params={{ id }}>View Saved Entry</Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="lg">
          <Link to="/entries/$id/edit" params={{ id }}><Pencil className="h-4 w-4" /> Edit</Link>
        </Button>
      </div>

      {!saved && history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Change history</h2>
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border bg-card px-3 py-2">
                <span className="font-medium capitalize">{h.action === "create" ? "Created" : "Edited"}</span>{" "}
                <span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString()}</span>
                {h.action === "update" && h.old_values && h.new_values && <Diff o={h.old_values} n={h.new_values} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const LABELS: Record<string, string> = {
  entry_date: "Date",
  bill_no: "Bill No.",
  maal_diya: "माल दिया",
  maal_liya: "माल लिया",
  weight_value: "वजन",
  vehicle_no: "गाड़ी नं.",
};

function Diff({ o, n }: { o: Record<string, unknown>; n: Record<string, unknown> }) {
  const changed = Object.keys(LABELS).filter((k) => String(o[k] ?? "") !== String(n[k] ?? ""));
  if (!changed.length) return <span className="text-muted-foreground"> — no field changes</span>;
  return (
    <ul className="mt-1 text-muted-foreground">
      {changed.map((k) => (
        <li key={k}>
          {LABELS[k]}: <s>{String(o[k] ?? "—")}</s> → <span className="text-foreground">{String(n[k] ?? "—")}</span>
        </li>
      ))}
    </ul>
  );
}
