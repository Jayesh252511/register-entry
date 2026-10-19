import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTitle } from "@/components/EntryViews";
import { forgetThisDevice, listDevices, revokeDevice } from "@/lib/access.functions";
import { getNextBill, updateSettings } from "@/lib/register.functions";
import { friendlyError } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Transport Register" },
      { name: "description", content: "Register settings and authorized devices." },
      { property: "og:title", content: "Settings — Transport Register" },
      { property: "og:description", content: "Register settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const s = useQuery({ queryKey: ["nextBill"], queryFn: () => getNextBill() });
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => listDevices() });
  const [name, setName] = useState("");
  const [bill, setBill] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (s.data) {
      setName(s.data.businessName);
      setBill(s.data.nextBill);
    }
  }, [s.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d+$/.test(bill)) return toast.error("Next Bill No. must be a whole number");
    setSaving(true);
    try {
      await updateSettings({ data: { business_display_name: name, next_bill_number: Number(bill) } });
      await qc.invalidateQueries();
      toast.success("Settings saved");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string, isCurrent: boolean) {
    if (!confirm(isCurrent ? "Remove access for THIS device? You will need the access code again." : "Remove access for this device?")) return;
    try {
      if (isCurrent) {
        await forgetThisDevice();
        await router.invalidate();
      } else {
        await revokeDevice({ data: { id } });
        devices.refetch();
        toast.success("Device access removed");
      }
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PageTitle title="Settings" />
      <form onSubmit={save} className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Register</h2>
        <div className="space-y-1.5"><Label htmlFor="bn">Business name</Label><Input id="bn" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="nb">Next Bill No.</Label>
          <Input id="nb" inputMode="numeric" className="font-mono" value={bill} onChange={(e) => setBill(e.target.value)} />
          <p className="text-xs text-muted-foreground">Used as the suggestion on the next new entry. Weight unit: {s.data?.unit ?? "MT"}.</p>
        </div>
        <Button type="submit" disabled={saving || !s.data}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save settings</Button>
      </form>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Authorized devices</h2>
        <p className="mb-3 text-sm text-muted-foreground">If a phone is lost, remove it here — it loses access immediately.</p>
        <ul className="divide-y">
          {devices.data?.devices.map((d) => {
            const current = d.id === devices.data?.currentId;
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{d.label} {current && <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">This device</span>}</div>
                    <div className="text-xs text-muted-foreground">Added {new Date(d.created_at).toLocaleDateString()}{d.last_seen_at && ` · last used ${new Date(d.last_seen_at).toLocaleDateString()}`}</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke(d.id, current)}><Trash2 className="h-4 w-4" /> Remove</Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
