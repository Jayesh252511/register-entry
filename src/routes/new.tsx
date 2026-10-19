import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { EntryForm, type FormValues } from "@/components/EntryForm";
import { PageTitle } from "@/components/EntryViews";
import { createEntry, getNextBill } from "@/lib/register.functions";
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

export const nextBillQuery = { queryKey: ["nextBill"], queryFn: () => getNextBill() };

function NewEntry() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const next = useQuery({ ...nextBillQuery, staleTime: 0, refetchOnMount: "always" });
  const requestId = useRef(crypto.randomUUID());

  const initial = useMemo<FormValues>(
    () => ({
      entry_date: localToday(),
      bill_no: next.data?.nextBill ?? "",
      maal_diya: "",
      maal_liya: "",
      weight_value: "",
      vehicle_no: "",
    }),
    [next.data?.nextBill],
  );

  async function onSubmit(v: FormValues, addAnother: boolean) {
    try {
      const saved = await createEntry({ data: { ...v, request_id: requestId.current } });
      requestId.current = crypto.randomUUID();
      qc.invalidateQueries();
      if (addAnother) {
        toast.success(`Saved — Bill No. ${saved.bill_no} (Sr. ${saved.register_serial_no})`);
        await next.refetch();
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
      {next.isLoading ? (
        <p className="text-muted-foreground">Loading next Bill No.…</p>
      ) : next.error ? (
        <p className="text-destructive">{friendlyError(next.error)}</p>
      ) : (
        <EntryForm
          mode="create"
          initial={initial}
          serialLabel={`Assigned on save (next: ${next.data?.nextSerial})`}
          unit={next.data?.unit ?? "MT"}
          onSubmit={onSubmit}
          onCancel={() => navigate({ to: "/" })}
        />
      )}
    </div>
  );
}
