import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  expectedAdminPinCookieValue,
  timingSafeEqualHex,
  verifyAdminPinCookieValue,
} from "@/lib/admin-pin-edge";

const env = process.env as Record<string, string | undefined>;

const ENV_KEYS = ["ADMIN_PIN", "AUTH_SECRET", "APP_ADMIN_PIN_SECRET", "NODE_ENV"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.ADMIN_PIN = "4321";
  process.env.AUTH_SECRET = "test-secret";
  delete process.env.APP_ADMIN_PIN_SECRET;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("expectedAdminPinCookieValue", () => {
  test("matches the node-crypto signature admin-pin-gate produces", async () => {
    const nodeValue = createHmac("sha256", "test-secret")
      .update("admin-pin-gate:4321")
      .digest("hex");
    expect(await expectedAdminPinCookieValue()).toBe(nodeValue);
  });

  test("falls back to APP_ADMIN_PIN_SECRET when AUTH_SECRET is unset", async () => {
    delete process.env.AUTH_SECRET;
    process.env.APP_ADMIN_PIN_SECRET = "alt-secret";
    const nodeValue = createHmac("sha256", "alt-secret")
      .update("admin-pin-gate:4321")
      .digest("hex");
    expect(await expectedAdminPinCookieValue()).toBe(nodeValue);
  });

  test("is empty (fails closed, no throw) in production without a secret", async () => {
    env.NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    expect(await expectedAdminPinCookieValue()).toBe("");
  });

  test("is empty in production without a PIN", async () => {
    env.NODE_ENV = "production";
    delete process.env.ADMIN_PIN;
    expect(await expectedAdminPinCookieValue()).toBe("");
  });
});

describe("verifyAdminPinCookieValue", () => {
  test("accepts the expected cookie value", async () => {
    const expected = await expectedAdminPinCookieValue();
    expect(expected).not.toBe("");
    expect(await verifyAdminPinCookieValue(expected)).toBe(true);
  });

  test("rejects a tampered cookie of the same length", async () => {
    const expected = await expectedAdminPinCookieValue();
    const flipped = (expected[0] === "a" ? "b" : "a") + expected.slice(1);
    expect(await verifyAdminPinCookieValue(flipped)).toBe(false);
  });

  test("rejects empty and wrong-length candidates", async () => {
    expect(await verifyAdminPinCookieValue("")).toBe(false);
    expect(await verifyAdminPinCookieValue("abc123")).toBe(false);
  });

  test("rejects everything when unconfigured in production", async () => {
    const expected = await expectedAdminPinCookieValue();
    env.NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    expect(await verifyAdminPinCookieValue(expected)).toBe(false);
  });
});

describe("timingSafeEqualHex", () => {
  test("equal strings compare true, unequal false", () => {
    expect(timingSafeEqualHex("deadbeef", "deadbeef")).toBe(true);
    expect(timingSafeEqualHex("deadbeef", "deadbeee")).toBe(false);
    expect(timingSafeEqualHex("dead", "deadbeef")).toBe(false);
  });
});
