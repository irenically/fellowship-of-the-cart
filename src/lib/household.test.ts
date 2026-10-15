import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  householdLink,
  householdStorageKey,
  initialHouseholdSecret,
  newHouseholdSecret,
  rememberHousehold,
  secretFromLink,
} from "./household";

const secret = "a".repeat(64);
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.restoreAllMocks());

it("creates random 256-bit invite keys and keeps them in the URL fragment", () => {
  const first = newHouseholdSecret();
  const second = newHouseholdSecret();
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(first).not.toBe(second);
  const link = new URL(
    householdLink(first, "https://example.com/cart/?tracking=1#old"),
  );
  expect(link.pathname).toBe("/cart/");
  expect(link.search).toBe("");
  expect(link.hash).toBe(`#household=${first}`);
  expect(secretFromLink(link.href, "https://example.com/cart/")).toBe(first);
});

it("rejects malformed, foreign, and wrong-path links", () => {
  for (const link of [
    "",
    "not a link",
    `https://other.example/#household=${secret}`,
    `http://localhost/other/#household=${secret}`,
    "http://localhost/#household=short",
  ]) {
    expect(() => secretFromLink(link)).toThrow();
  }
});

it("prefers an explicit invite to the remembered household and never falls back from an invalid invite", () => {
  localStorage.setItem(householdStorageKey, secret);
  expect(initialHouseholdSecret()).toBe(secret);
  window.history.replaceState(null, "", `/#household=${"b".repeat(64)}`);
  expect(initialHouseholdSecret()).toBe("b".repeat(64));
  window.history.replaceState(null, "", "/#household=invalid");
  expect(() => initialHouseholdSecret()).toThrow();
  expect(localStorage.getItem(householdStorageKey)).toBe(secret);
});

it("remembers a verified household and preserves its URL even if browser storage fails", () => {
  rememberHousehold({ id: "one", name: "The Shire", secret });
  expect(localStorage.getItem(householdStorageKey)).toBe(secret);
  expect(window.location.hash).toBe(`#household=${secret}`);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  expect(() =>
    rememberHousehold({ id: "two", name: "Rivendell", secret: "b".repeat(64) }),
  ).toThrow("Blocked");
  expect(window.location.hash).toBe(`#household=${"b".repeat(64)}`);
});
