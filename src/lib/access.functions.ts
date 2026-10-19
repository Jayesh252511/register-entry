import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  DEVICE_COOKIE,
  admin,
  clientIp,
  currentDevice,
  randomToken,
  sha256,
} from "./device.server";

export const requireDevice = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const device = await currentDevice();
  if (!device) throw new Error("DEVICE_NOT_AUTHORIZED");
  return next({ context: { deviceId: device.id, deviceLabel: device.label } });
});

export const getAccessStatus = createServerFn({ method: "GET" }).handler(async () => {
  const device = await currentDevice();
  return { authorized: !!device, deviceLabel: device?.label ?? null };
});

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const authorizeDevice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ code: z.string().min(1).max(200), label: z.string().trim().min(1).max(60) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const expected = process.env['APP_ACCESS_CODE'];
    if (!expected) return { ok: false as const, error: "Access code is not set up yet." };
    const db = await admin();
    const ip = clientIp();
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await db
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("success", false)
      .gte("attempted_at", since);
    if ((count ?? 0) >= 5)
      return { ok: false as const, error: "Too many wrong attempts. Try again in 15 minutes." };

    const ok = safeEqual(await sha256(data.code.trim()), await sha256(expected.trim()));
    await db.from("auth_attempts").insert({ ip, success: ok });
    if (!ok) return { ok: false as const, error: "That access code is not correct." };

    const token = randomToken();
    const { error } = await db
      .from("devices")
      .insert({ label: data.label, token_hash: await sha256(token), last_seen_at: new Date().toISOString() });
    if (error) return { ok: false as const, error: "Could not authorize this device." };
    setCookie(DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return { ok: true as const };
  });

export const forgetThisDevice = createServerFn({ method: "POST" })
  .middleware([requireDevice])
  .handler(async ({ context }) => {
    const db = await admin();
    await db.from("devices").update({ revoked_at: new Date().toISOString() }).eq("id", context.deviceId);
    deleteCookie(DEVICE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    return { ok: true };
  });

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireDevice])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data, error } = await db
      .from("devices")
      .select("id,label,created_at,last_seen_at,revoked_at")
      .is("revoked_at", null)
      .order("created_at");
    if (error) throw new Error(error.message);
    return { devices: data, currentId: context.deviceId };
  });

export const revokeDevice = createServerFn({ method: "POST" })
  .middleware([requireDevice])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("devices").update({ revoked_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });
