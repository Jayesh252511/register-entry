import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EntryForm, type FormValues } from "@/components/EntryForm";
import { PageTitle } from "@/components/EntryViews";
import { addEntry, findDuplicateBill, suggestNextBill, useRegister } from "@/lib/local-store";
import { friendlyError, localToday } from "@/lib/format";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "New Entry — Transport Register" },
      { name: "description", content: "Add a new entry to the transport register." },
      { property: "og:title", content: "New Entry — Transport Register" },
      { property: "og:description", content: "Add a new entry to the transport register." },
    ],
  }),
  component: NewEntry,
});

function NewEntry() {
  const navigate = useNavigate();
  const { ready, meta, entries } = useRegister();
  const [round, setRound] = useState(0);

  const initial = useMemo<FormValues>(
    () => ({ entry_date: localToday(), bill_no: ready ? suggestNextBill() : "", maal_diya: "", maal_liya: "", weight_value: "", vehicle_no: "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, round, meta.nextBill, entries.length],
  );

  async function onSubmit(v: FormValues, addAnother: boolean) {
    const dup = findDuplicateBill(v.bill_no);
    if (dup) {
      toast.error(`Bill No. ${v.bill_no.trim()} is already used. Please choose a different number.`);
      return false;
    }
    try {
      const saved = await addEntry(v);
      if (addAnother) {
        toast.success(`Saved — Bill No. ${saved.bill_no}`);
        setRound((r) => r + 1);
      } else {
        navigate({ to: "/entries/$id", params: { id: saved.id }, search: { saved: 1 } });
      }
      return true;
    } catch (e) {
      toast.error(friendlyError(e));
      return false;
    }
  }

  return (
    <div>
      <PageTitle title="New Entry" sub="नई एंट्री — fill all fields and save" />
      {!ready ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <EntryForm
          key={round}
          mode="create"
          initial={initial}
          serialLabel="Assigned automatically"
          unit={meta.unit}
          onSubmit={onSubmit}
          onCancel={() => navigate({ to: "/" })}
        />
      )}
    </div>
  );
}
