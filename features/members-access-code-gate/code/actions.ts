"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordAdmission, verifyCodeDetailed } from "@/lib/codes";
import {
  COOKIE_NAMES,
  SESSION_MAX_AGE,
  newSessionToken,
  signThrottle,
  verifyThrottle,
} from "@/lib/session";

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 1000;

export type EnterResult = { ok: true } | { ok: false; locked: boolean };

export async function enterAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  const jar = await cookies();
  const now = Date.now();
  const throttleCookie = jar.get(COOKIE_NAMES.throttle)?.value;
  const throttle = (await verifyThrottle(throttleCookie)) ?? { attempts: 0, lockedUntil: 0 };

  if (throttle.lockedUntil > now) {
    redirect("/?err=locked");
  }

  const verify = code ? await verifyCodeDetailed(code) : { ok: false as const };
  if (!verify.ok) {
    const attempts = throttle.attempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0;
    const newState = { attempts: lockedUntil ? 0 : attempts, lockedUntil };
    jar.set({
      name: COOKIE_NAMES.throttle,
      value: await signThrottle(newState),
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 30,
    });
    redirect(lockedUntil ? "/?err=locked" : "/?err=wrong");
  }

  const { token, sid } = await newSessionToken();
  await recordAdmission(code, verify.inviteId, sid);
  jar.set({
    name: COOKIE_NAMES.session,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  jar.set({ name: COOKIE_NAMES.throttle, value: "", path: "/", maxAge: 0 });
  redirect("/collection");
}
