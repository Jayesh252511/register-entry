import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, X, Eraser, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRegister } from "@/lib/local-store";

export type FormValues = {
  entry_date: string;
  bill_no: string;
  maal_diya: string;
  maal_liya: string;
  weight_value: string;
  vehicle_no: string;
};

export function EntryForm({
  initial,
  serialLabel,
  unit,
  mode,
  onSubmit,
  onCancel,
}: {
  initial: FormValues;
  serialLabel: string;
  unit: string;
  mode: "create" | "edit";
  onSubmit: (v: FormValues, addAnother: boolean) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const busyRef = useRef(false);
  const { entries } = useRegister();
  const sugg = useMemo(() => {
    const u = (k: "maal_diya" | "maal_liya" | "vehicle_no") => [...new Set(entries.map((e) => e[k]))].slice(0, 200);
    return { data: { maal_diya: u("maal_diya"), maal_liya: u("maal_liya"), vehicle_no: u("vehicle_no") } };
  }, [entries]);

  useEffect(() => setV(initial), [initial]);

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((p) => ({ ...p, [k]: e.target.value }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  function validate() {
    const e: typeof errors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.entry_date)) e.entry_date = "Enter a valid date";
    if (!v.bill_no.trim()) e.bill_no = "Bill No. is required";
    if (!v.maal_diya.trim()) e.maal_diya = "माल दिया is required";
    if (!v.maal_liya.trim()) e.maal_liya = "माल लिया is required";
    if (v.weight_value.trim() && !/^\d+(\.\d+)?$/.test(v.weight_value.trim())) e.weight_value = "Enter a number, e.g. 12.5";
    if (!v.vehicle_no.trim()) e.vehicle_no = "गाड़ी नं. is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(addAnother: boolean) {
    if (busyRef.current || !validate()) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onSubmit(v, addAnother);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const dirty = (Object.keys(v) as (keyof FormValues)[]).some((k) => v[k] !== initial[k]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="max-w-2xl rounded-xl border bg-card p-4 md:p-6"
      noValidate
    >
      <div className="mb-4 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">Register Serial No.</span>
        <span className="font-mono font-semibold">{serialLabel}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Date / तारीख" id="entry_date" error={errors.entry_date}>
          <Input id="entry_date" type="date" value={v.entry_date} onChange={set("entry_date")} required />
        </F>
        <F label="Bill No." id="bill_no" error={errors.bill_no} hint={mode === "create" ? "Suggested automatically — you can change it" : undefined}>
          <Input id="bill_no" inputMode="numeric" className="font-mono text-base font-semibold" value={v.bill_no} onChange={set("bill_no")} required />
        </F>
        <F label="माल दिया" id="maal_diya" error={errors.maal_diya}>
          <Input id="maal_diya" list="dl-diya" value={v.maal_diya} onChange={set("maal_diya")} autoComplete="off" required />
        </F>
        <F label="माल लिया" id="maal_liya" error={errors.maal_liya}>
          <Input id="maal_liya" list="dl-liya" value={v.maal_liya} onChange={set("maal_liya")} autoComplete="off" required />
        </F>
        <F label={`वजन (${unit})`} id="weight_value" error={errors.weight_value} hint="Optional">
          <Input id="weight_value" inputMode="decimal" value={v.weight_value} onChange={set("weight_value")} placeholder="e.g. 12.5" />
        </F>
        <F label="गाड़ी नं." id="vehicle_no" error={errors.vehicle_no}>
          <Input id="vehicle_no" list="dl-veh" className="font-mono" value={v.vehicle_no} onChange={set("vehicle_no")} autoComplete="off" required />
        </F>
      </div>
      <datalist id="dl-diya">{sugg.data?.maal_diya.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="dl-liya">{sugg.data?.maal_liya.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="dl-veh">{sugg.data?.vehicle_no.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} size="lg">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Save Entry" : "Save Changes"}
        </Button>
        {mode === "create" && (
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={() => submit(true)}>
            <PlusCircle className="h-4 w-4" /> Save & Add Another
          </Button>
        )}
        <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={onCancel}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        {mode === "create" && (
          <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={() => (dirty ? setConfirmClear(true) : setV(initial))}>
            <Eraser className="h-4 w-4" /> Clear Form
          </Button>
        )}
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the form?</AlertDialogTitle>
            <AlertDialogDescription>The values you typed will be removed. Nothing has been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setV(initial); setErrors({}); }}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function F({ label, id, error, hint, children }: { label: string; id: string; error?: string | undefined; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
