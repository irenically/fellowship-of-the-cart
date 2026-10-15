import { createClient } from "@supabase/supabase-js";

export interface Household {
  id: string;
  name: string;
  secret: string;
}
export const householdStorageKey = "fellowship-household:v1";
const secretPattern = /^[a-f0-9]{64}$/;

export function newHouseholdSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function householdLink(
  secret: string,
  base = window.location.href,
): string {
  if (!secretPattern.test(secret))
    throw new Error("This household link is invalid.");
  const url = new URL(base);
  url.search = "";
  url.hash = `household=${secret}`;
  return url.href;
}

export function secretFromLink(
  link: string,
  base = window.location.href,
): string {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new Error("Paste the full household invite link.");
  }
  const app = new URL(base);
  const secret = new URLSearchParams(url.hash.slice(1)).get("household");
  if (
    url.origin !== app.origin ||
    url.pathname !== app.pathname ||
    !secret ||
    !secretPattern.test(secret)
  )
    throw new Error("This is not a valid household link for this app.");
  return secret;
}

export function initialHouseholdSecret(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.has("household")) return secretFromLink(window.location.href);
  const stored = localStorage.getItem(householdStorageKey);
  if (!stored) return null;
  if (!secretPattern.test(stored))
    throw new Error(
      "The saved household link is invalid. Open your invite link again.",
    );
  return stored;
}

export function sharedConfiguration() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    string | undefined;
  if (!url && !key) return null;
  if (!url || !key)
    throw new Error(
      "Set both Supabase environment variables, or leave both empty for local mode.",
    );
  return { url, key };
}

export function householdClient(secret: string) {
  const config = sharedConfiguration();
  if (!config) throw new Error("Shared storage is not configured.");
  if (!secretPattern.test(secret))
    throw new Error("This household link is invalid.");
  return createClient(config.url, config.key, {
    global: { headers: { "x-household-key": secret } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function householdError(code?: string): Error {
  return new Error(
    code === "28000"
      ? "This household link no longer works. Check the link with someone in your household."
      : "Could not open the household. Check your connection and try again.",
  );
}

export async function openHousehold(secret: string): Promise<Household> {
  const { data, error } = await householdClient(secret).rpc("get_household");
  if (error) throw householdError(error.code);
  if (!data || typeof data.id !== "string" || typeof data.name !== "string")
    throw householdError();
  return { id: data.id, name: data.name, secret };
}

export async function createHousehold(
  name: string,
  secret: string,
): Promise<Household> {
  const clean = name.trim();
  if (!clean || clean.length > 80)
    throw new Error("Use a household name between 1 and 80 characters.");
  const { data, error } = await householdClient(secret).rpc(
    "create_household",
    { p_name: clean },
  );
  if (error)
    throw new Error(
      "Could not create the household. Check your connection and try again.",
    );
  if (!data || typeof data.id !== "string" || typeof data.name !== "string")
    throw householdError();
  return { id: data.id, name: data.name, secret };
}

export function rememberHousehold(household: Household) {
  // The fragment stays in the browser; it isn't sent to GitHub Pages or as a referrer.
  window.history.replaceState(null, "", householdLink(household.secret));
  localStorage.setItem(householdStorageKey, household.secret);
}
