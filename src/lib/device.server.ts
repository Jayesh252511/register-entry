import { getCookie, getRequestHeader } from "@tanstack/react-start/server";

export const DEVICE_COOKIE = "tr_device";

export async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function clientIp() {
  return (
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Returns the authorized device row for the current request, or null. */
export async function currentDevice() {
  const token = getCookie(DEVICE_COOKIE);
  if (!token || token.length < 32) return null;
  const db = await admin();
  const { data } = await db
    .from("devices")
    .select("id,label,revoked_at,last_seen_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  const last = data.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
  if (Date.now() - last > 10 * 60 * 1000) {
    await db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { id: data.id as string, label: data.label as string };
}
