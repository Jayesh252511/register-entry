import { Link } from "@tanstack/react-router";
import { Eye, Pencil } from "lucide-react";
import type { Entry } from "@/lib/register.functions";
import { fmtDate, fmtWeight } from "@/lib/format";

export function EntryTable({ rows, actions = true }: { rows: Entry[]; actions?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="print-table w-full table-fixed text-sm">
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-[6%] px-3 py-2.5">Sr.</th>
            <th className="w-[11%] px-3 py-2.5 normal-case">Date / तारीख</th>
            <th className="w-[9%] px-3 py-2.5">Bill No.</th>
            <th className="px-3 py-2.5 normal-case">माल दिया</th>
            <th className="px-3 py-2.5 normal-case">माल लिया</th>
            <th className="w-[10%] px-3 py-2.5 text-right normal-case">वजन</th>
            <th className="w-[14%] px-3 py-2.5 normal-case">गाड़ी नं.</th>
            {actions && <th className="no-print w-[9%] px-3 py-2.5 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top hover:bg-accent/40">
              <td className="px-3 py-2 tabular text-muted-foreground">{r.register_serial_no}</td>
              <td className="px-3 py-2 tabular">{fmtDate(r.entry_date)}</td>
              <td className="px-3 py-2 font-mono font-medium">{r.bill_no}</td>
              <td className="break-words px-3 py-2">{r.maal_diya}</td>
              <td className="break-words px-3 py-2">{r.maal_liya}</td>
              <td className="px-3 py-2 text-right tabular">{fmtWeight(r.weight_value, r.weight_unit)}</td>
              <td className="break-all px-3 py-2 font-mono">{r.vehicle_no}</td>
              {actions && (
                <td className="no-print px-3 py-2 text-right">
                  <RowActions id={r.id} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ id }: { id: string }) {
  return (
    <div className="inline-flex gap-1">
      <Link to="/entries/$id" params={{ id }} aria-label="View" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-primary">
        <Eye className="h-4 w-4" />
      </Link>
      <Link to="/entries/$id/edit" params={{ id }} aria-label="Edit" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-primary">
        <Pencil className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function EntryCard({ r, actions = true, tone }: { r: Entry; actions?: boolean; tone?: "new" | "prev" }) {
  const ring = tone === "new" ? "border-success border-2" : "";
  return (
    <div className={`rounded-lg border bg-card p-3 ${ring}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Sr. {r.register_serial_no}</span>
        {actions && (
          <div className="no-print">
            <RowActions id={r.id} />
          </div>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <Field k="Date / तारीख" v={fmtDate(r.entry_date)} />
        <Field k="Bill No." v={r.bill_no} mono strong />
        <Field k="माल दिया" v={r.maal_diya} />
        <Field k="माल लिया" v={r.maal_liya} />
        <Field k="वजन" v={fmtWeight(r.weight_value, r.weight_unit)} />
        <Field k="गाड़ी नं." v={r.vehicle_no} mono />
      </dl>
    </div>
  );
}

function Field({ k, v, mono, strong }: { k: string; v: string; mono?: boolean; strong?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`break-words ${mono ? "font-mono" : ""} ${strong ? "font-semibold" : ""}`}>{v}</dd>
    </>
  );
}

/** Table on wide screens, cards on narrow screens. */
export function EntryList({ rows }: { rows: Entry[] }) {
  return (
    <>
      <div className="hidden lg:block">
        <EntryTable rows={rows} />
      </div>
      <div className="space-y-2 lg:hidden">
        {rows.map((r) => (
          <EntryCard key={r.id} r={r} />
        ))}
      </div>
    </>
  );
}

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
