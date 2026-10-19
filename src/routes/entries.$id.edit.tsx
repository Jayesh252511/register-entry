import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { EntryForm, type FormValues } from "@/components/EntryForm";
import { PageTitle } from "@/components/EntryViews";
import { getEntry, updateEntry } from "@/lib/register.functions";
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
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["entry", id], queryFn: () => getEntry({ data: { id } }), staleTime: 0 });
  const e = q.data?.entry;
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
    [e],
  );

  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{friendlyError(q.error)}</p>;
  if (!e || !initial) return <p className="text-muted-foreground">Entry not found.</p>;

  return (
    <div>
      <PageTitle title="Edit Entry" sub={`Sr. ${e.register_serial_no} — serial number does not change`} />
      <EntryForm
        mode="edit"
        initial={initial}
        serialLabel={String(e.register_serial_no)}
        unit={e.weight_unit ?? "MT"}
        onCancel={() => navigate({ to: "/entries/$id", params: { id } })}
        onSubmit={async (v) => {
          try {
            await updateEntry({ data: { ...v, id } });
            await qc.invalidateQueries();
            toast.success("Changes saved");
            navigate({ to: "/entries/$id", params: { id } });
            return true;
          } catch (err) {
            toast.error(friendlyError(err));
            return false;
          }
        }}
      />
    </div>
  );
}
