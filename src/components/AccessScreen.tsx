import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { BookOpen, KeyRound, Loader2 } from "lucide-react";
import { authorizeDevice } from "@/lib/access.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/format";

export function AccessScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authorizeDevice({ data: { code, label } });
      if (!res.ok) setError(res.error);
      else await router.invalidate();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-nav px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Transport Register</h1>
            <p className="text-sm text-muted-foreground">Digital Roznamcha</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          One-time setup for this phone or computer. After this, the register opens directly.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="label">Device name</Label>
            <Input id="label" placeholder="e.g. Papa's phone" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />
          </div>
          <div>
            <Label htmlFor="code">Access code</Label>
            <Input id="code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Authorize this device
          </Button>
        </div>
      </form>
    </div>
  );
}
