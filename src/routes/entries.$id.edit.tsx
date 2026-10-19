import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { EntryForm, type FormValues } from "@/components/EntryForm";
import { PageTitle, Serial } from "@/components/EntryViews";
import { editEntry, findDuplicateBill, useRegister } from "@/lib/local-store";
import { friendlyError } from "@/lib/format";

export const Route = createFileRoute("/entries/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit Entry — Transport Register" },
      { name: "description", content: "Edit a register entry." },
      { property: "og:title", content: "Edit Entry — Transport Register" },
      { property: "og:description", content: "Edit a register entry." },
    ],
  }),
  component: EditEntry,
});

function EditEntry() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { entries, ready } = useRegister();
  const e = entries.find((x) => x.id === id);
  const initial = useMemo<FormValues | null>(
    () =>
      e
        ? {
            entry_date: e.entry_date,
            bill_no: e.bill_no,
            maal_diya: e.maal_diya,
            maal_liya: e.maal_liya,
            weight_value: e.weight_value === null ? "" : String(e.weight_value),
            vehicle_no: e.vehicle_no,
          }
        : null,
    // only reset form when switching entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [e?.id],
  );

  if (!ready) return <p className="text-muted-foreground">Loading…</p>;
  if (!e || !initial) return <p className="text-muted-foreground">Entry not found.</p>;

  return (
    <div>
      <PageTitle title="Edit Entry" sub="Serial number does not change" />
      {e._error && <p className="mb-4 rounded-md border border-destructive bg-card p-3 text-sm text-destructive">Could not sync: {e._error}</p>}
      <EntryForm
        mode="edit"
        initial={initial}
        serialLabel={e.register_serial_no ? String(e.register_serial_no) : "Assigned after sync"}
        unit={e.weight_unit ?? "MT"}
        onCancel={() => navigate({ to: "/entries/$id", params: { id } })}
        onSubmit={async (v) => {
          if (findDuplicateBill(v.bill_no, id)) {
            toast.error(`Bill No. ${v.bill_no.trim()} is already used. Please choose a different number.`);
            return false;
          }
          try {
            await editEntry(id, v);
            toast.success("Changes saved");
            navigate({ to: "/entries/$id", params: { id } });
            return true;
          } catch (err) {
            toast.error(friendlyError(err));
            return false;
          }
        }}
      />
      <span className="hidden"><Serial r={e} /></span>
    </div>
  );
}
