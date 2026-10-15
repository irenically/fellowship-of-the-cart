import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createHousehold,
  createHouseholdInvite,
  forgetHousehold,
  householdId,
  householdInviteLink,
  householdStorageKey,
  initialHouseholdSecret,
  loginHousehold,
  newHouseholdSecret,
  openHousehold,
  rememberHousehold,
  readHouseholdInvite,
  secretFromLink,
  validateHouseholdPassword,
} from "./household";
const secret = "a".repeat(64);
const input = {
  name: "My Household",
  slug: "my-household",
  password: "fixture-password",
};
const metadata = {
  id: "one",
  name: input.name,
  slug: input.slug,
  needs_password: false,
};
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function mockRpc(data: unknown, status = 200) {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("suggests readable valid IDs from household names", () => {
  expect(householdId("My Household")).toBe("my-household");
  expect(householdId("  Café & Second Breakfast! ")).toBe(
    "cafe-second-breakfast",
  );
  expect(householdId("A")).toBe("a-home");
  expect(householdId("Наш дім")).toBe("household");
  expect(householdId("")).toBe("");
  expect(householdId("word ".repeat(100))).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(householdId("word ".repeat(100)).length).toBeLessThanOrEqual(64);
});
it("uses random 256-bit session tokens rather than passwords", () => {
  expect(newHouseholdSecret()).toMatch(/^[a-f0-9]{64}$/);
  expect(newHouseholdSecret()).not.toBe(newHouseholdSecret());
});

it("round-trips invite credentials in a fragment without putting them in request paths or queries", () => {
  const password = " +&#=?é emoji🧙 ";
  const link = householdInviteLink(
    "my-household",
    password,
    "https://example.com/cart/?tracking=1#old",
  );
  const url = new URL(link);
  expect(url.pathname).toBe("/cart/");
  expect(url.search).toBe("");
  expect(readHouseholdInvite(link)).toEqual({ slug: "my-household", password });
  expect(readHouseholdInvite("https://example.com/cart/")).toBeNull();
  for (const hash of [
    "invite=1",
    "invite=2&id=my-household&password=password123",
    "invite=1&id=my-household&id=other-home&password=password123",
    "invite=1&id=INVALID&password=password123",
  ])
    expect(() =>
      readHouseholdInvite(`https://example.com/cart/#${hash}`),
    ).toThrow("invite link is invalid");
});

it("generates invites using the existing session without sending a password", async () => {
  const credential = "c".repeat(64);
  const fetch = mockRpc({ slug: input.slug, credential });
  const household = { ...metadata, needsPassword: false, secret };
  const link = await createHouseholdInvite(household);
  expect(readHouseholdInvite(link)).toEqual({
    slug: input.slug,
    password: credential,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toContain("/rpc/create_household_invite");
  expect(new Headers(options.headers).get("x-household-key")).toBe(secret);
  expect(String(options.body)).not.toContain("p_password");
  expect(localStorage.length).toBe(0);
  expect(window.location.hash).toBe("");
  mockRpc({ code: "28000", message: "Session expired" }, 401);
  await expect(createHouseholdInvite(household)).rejects.toThrow(
    "Sign in with the household ID",
  );
});
it("allows short, whitespace, Unicode and long passwords without composition rules", () => {
  for (const password of [
    "x",
    "short",
    " ",
    "a".repeat(10000),
    "\u00e9".repeat(1000),
  ])
    expect(() => validateHouseholdPassword(password)).not.toThrow();
  expect(() => validateHouseholdPassword("")).toThrow(
    "Enter a household password",
  );
});
it("sends ID and password only in the RPC body, with a separate session header", async () => {
  const fetch = mockRpc(metadata);
  const result = await createHousehold(input, secret);
  expect(result).toEqual({
    id: "one",
    name: input.name,
    slug: input.slug,
    needsPassword: false,
    secret,
  });
  const [url, options] = fetch.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(String(url)).not.toContain(input.password);
  expect(new Headers(options.headers).get("x-household-key")).toBe(secret);
  expect(JSON.parse(options.body as string)).toEqual({
    p_name: input.name,
    p_slug: input.slug,
    p_password: input.password,
  });
  expect(localStorage.length).toBe(0);
});
it("normalizes the login ID while preserving the exact password", async () => {
  const fetch = mockRpc(metadata);
  await loginHousehold("  MY-HOUSEHOLD  ", " exact password ", secret);
  const options = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(JSON.parse(options.body as string)).toEqual({
    p_slug: "my-household",
    p_password: " exact password ",
  });
});
it("explains duplicate IDs, wrong credentials, lockouts, and missing setup", async () => {
  mockRpc({ error: "slug_taken" });
  await expect(createHousehold(input, secret)).rejects.toThrow("already taken");
  mockRpc({ error: "invalid_credentials" });
  await expect(
    loginHousehold(input.slug, input.password, secret),
  ).rejects.toThrow("ID or password is incorrect");
  mockRpc({ error: "rate_limited" });
  await expect(
    loginHousehold(input.slug, input.password, secret),
  ).rejects.toThrow("wait one minute");
  mockRpc({ code: "PGRST202", message: "Function not found" }, 404);
  await expect(createHousehold(input, secret)).rejects.toThrow(
    "sign-in is not set up yet",
  );
  await expect(openHousehold(secret)).rejects.toThrow(
    "sign-in is not set up yet",
  );
});
it("prefers a legacy link to saved sessions and rejects an invalid explicit link", () => {
  localStorage.setItem(householdStorageKey, secret);
  expect(initialHouseholdSecret()).toBe(secret);
  window.history.replaceState(null, "", `/#household=${"b".repeat(64)}`);
  expect(initialHouseholdSecret()).toBe("b".repeat(64));
  window.history.replaceState(null, "", "/#household=invalid");
  expect(() => initialHouseholdSecret()).toThrow();
  expect(localStorage.getItem(householdStorageKey)).toBe(secret);
  expect(() =>
    secretFromLink(`https://other.example/#household=${secret}`),
  ).toThrow();
});
it("remembers only the session token, clears invite URLs, and forgets on sign-out", () => {
  window.history.replaceState(null, "", `/#household=${secret}`);
  rememberHousehold({
    id: "one",
    name: input.name,
    slug: input.slug,
    needsPassword: false,
    secret,
  });
  expect(window.location.hash).toBe("");
  expect(localStorage.getItem(householdStorageKey)).toBe(secret);
  expect(localStorage.length).toBe(1);
  forgetHousehold();
  expect(localStorage.getItem(householdStorageKey)).toBeNull();
});
