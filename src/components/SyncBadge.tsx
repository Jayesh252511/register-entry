import { Cloud, CloudOff, Loader2, AlertTriangle } from "lucide-react";
import { sync, useRegister } from "@/lib/local-store";

export function SyncBadge() {
  const { online, syncing, entries, syncError } = useRegister();
  const pending = entries.filter((e) => e._pending).length;
  const errors = entries.filter((e) => e._error).length;
  let icon = <Cloud className="h-3.5 w-3.5" />;
  let text = "Synced";
  if (!online) { icon = <CloudOff className="h-3.5 w-3.5" />; text = pending ? `Offline · ${pending} to sync` : "Offline"; }
  else if (errors) { icon = <AlertTriangle className="h-3.5 w-3.5" />; text = `${errors} need fixing`; }
  else if (syncing) { icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />; text = pending ? `Syncing ${pending}…` : "Syncing…"; }
  else if (pending || syncError) { icon = <CloudOff className="h-3.5 w-3.5" />; text = `${pending} waiting`; }
  return (
    <button type="button" onClick={() => void sync()} title="Tap to sync now"
      className={`inline-flex items-center gap-1.5 rounded-full bg-nav-active px-2.5 py-1 text-xs ${errors ? "text-destructive" : "text-nav-foreground"}`}>
      {icon}{text}
    </button>
  );
}
