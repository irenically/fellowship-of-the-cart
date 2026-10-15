import { createClient } from "@supabase/supabase-js";

export interface Household {
  id: string;
  name: string;
  slug: string | null;
  needsPassword: boolean;
  secret: string;
}
export interface HouseholdInput {
  name: string;
  slug: string;
  password: string;
}
export interface HouseholdInvite {
  slug: string;
  password: string;
}
export const householdStorageKey = "fellowship-household:v1";
const secretPattern = /^[a-f0-9]{64}$/;

export function newHouseholdSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function householdId(name: string): string {
  if (!name.trim()) return "";
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-$/, "");
  return slug.length >= 3 ? slug : slug ? `${slug}-home` : "household";
}
export function validateHouseholdPassword(password: string) {
  if (!password.length) throw new Error("Enter a household password.");
}
function validateId(slug: string) {
  if (
    slug.length < 3 ||
    slug.length > 64 ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
  )
    throw new Error(
      "Use 3–64 lowercase letters, numbers, and single hyphens for the household ID.",
    );
}

export function householdInviteLink(
  slug: string,
  password: string,
  base = window.location.href,
): string {
  validateId(slug);
  validateHouseholdPassword(password);
  const url = new URL(base);
  url.search = "";
  url.hash = new URLSearchParams({
    invite: "1",
    id: slug,
    password,
  }).toString();
  return url.href;
}

export function readHouseholdInvite(
  href = window.location.href,
): HouseholdInvite | null {
  const params = new URLSearchParams(new URL(href).hash.slice(1));
  if (!params.has("invite")) return null;
  const slug = params.get("id");
  const password = params.get("password");
  if (
    params.get("invite") !== "1" ||
    !slug ||
    !password ||
    ["invite", "id", "password"].some((key) => params.getAll(key).length !== 1)
  )
    throw new Error(
      "This household invite link is invalid. Ask for a new link or enter the ID and password.",
    );
  try {
    validateId(slug);
    validateHouseholdPassword(password);
  } catch {
    throw new Error(
      "This household invite link is invalid. Ask for a new link or enter the ID and password.",
    );
  }
  return { slug, password };
}

export async function createHouseholdInvite(
  household: Household,
): Promise<string> {
  if (!household.slug || household.needsPassword)
    throw new Error("Set up your household password first.");
  const { data, error } = await householdClient(household.secret).rpc(
    "create_household_invite",
  );
  if (error?.code === "PGRST202")
    throw new Error(
      "Household invites are not set up yet. Please contact the app owner to finish setup.",
    );
  if (error) throw rpcError(error.code);
  if (
    data?.slug !== household.slug ||
    typeof data?.credential !== "string" ||
    !secretPattern.test(data.credential)
  )
    throw new Error("Could not create the invite. Please try again.");
  return householdInviteLink(data.slug, data.credential);
}

// Legacy links are retained only to let existing households set a password.
export function secretFromLink(
  link: string,
  base = window.location.href,
): string {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new Error("This household link is invalid.");
  }
  const app = new URL(base);
  const secret = new URLSearchParams(url.hash.slice(1)).get("household");
  if (
    url.origin !== app.origin ||
    url.pathname !== app.pathname ||
    !secret ||
    !secretPattern.test(secret)
  )
    throw new Error("This household link is invalid.");
  return secret;
}
export function initialHouseholdSecret(): string | null {
  if (new URLSearchParams(window.location.hash.slice(1)).has("household"))
    return secretFromLink(window.location.href);
  const stored = localStorage.getItem(householdStorageKey);
  if (!stored) return null;
  if (!secretPattern.test(stored))
    throw new Error("Your saved session is invalid. Sign in again.");
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
    throw new Error("Your session is invalid. Sign in again.");
  return createClient(config.url, config.key, {
    global: { headers: { "x-household-key": secret } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
function setupError() {
  return new Error(
    "Household sign-in is not set up yet. Please contact the app owner to finish setup.",
  );
}
function rpcError(code?: string): Error {
  if (code === "PGRST202") return setupError();
  if (code === "28000")
    return new Error("Sign in with the household ID and password to continue.");
  return new Error("Could not connect to your household. Please try again.");
}
const errors: Record<string, string> = {
  invalid_credentials: "The household ID or password is incorrect.",
  rate_limited:
    "Too many sign-in attempts for this household. Please wait one minute and try again.",
  slug_taken:
    "That household ID is already taken. Choose another, such as adding -2.",
  invalid_slug:
    "Use 3–64 lowercase letters, numbers, and single hyphens for the household ID.",
  invalid_name: "Use a household name between 1 and 80 characters.",
  invalid_password: "Enter a household password.",
  invalid_session: "This sign-in is no longer valid. Sign in again.",
  already_setup:
    "This household already has a password. Sign in with its ID and password.",
};
function resultHousehold(data: unknown, secret: string): Household {
  if (!data || typeof data !== "object") throw rpcError();
  const result = data as Record<string, unknown>;
  if (typeof result.error === "string")
    throw new Error(
      errors[result.error] ?? "Could not open the household. Please try again.",
    );
  if (
    typeof result.id !== "string" ||
    typeof result.name !== "string" ||
    typeof result.needs_password !== "boolean" ||
    !(result.slug === null || typeof result.slug === "string")
  )
    throw setupError();
  return {
    id: result.id,
    name: result.name,
    slug: result.slug,
    needsPassword: result.needs_password,
    secret,
  };
}
export async function openHousehold(secret: string): Promise<Household> {
  const { data, error } = await householdClient(secret).rpc("get_household");
  if (error) throw rpcError(error.code);
  return resultHousehold(data, secret);
}
export async function createHousehold(
  input: HouseholdInput,
  secret: string,
): Promise<Household> {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new Error(errors.invalid_name);
  validateId(input.slug);
  validateHouseholdPassword(input.password);
  const { data, error } = await householdClient(secret).rpc(
    "create_household",
    {
      p_name: name,
      p_slug: input.slug,
      p_password: input.password,
    },
  );
  if (error) throw rpcError(error.code);
  return resultHousehold(data, secret);
}
export async function loginHousehold(
  slug: string,
  password: string,
  secret: string,
): Promise<Household> {
  if (!slug.trim() || !password)
    throw new Error("Enter the household ID and password.");
  const { data, error } = await householdClient(secret).rpc("login_household", {
    p_slug: slug.trim().toLowerCase(),
    p_password: password,
  });
  if (error) throw rpcError(error.code);
  return resultHousehold(data, secret);
}
export async function setHouseholdPassword(
  oldSecret: string,
  slug: string,
  password: string,
  newSecret: string,
): Promise<Household> {
  validateId(slug);
  validateHouseholdPassword(password);
  const { data, error } = await householdClient(oldSecret).rpc(
    "set_household_password",
    {
      p_slug: slug,
      p_password: password,
      p_session_key: newSecret,
    },
  );
  // Recover if the password was saved but the first response was lost.
  if (error || data?.error === "invalid_session") {
    try {
      return await openHousehold(newSecret);
    } catch {
      /* Show the original failure below. */
    }
  }
  if (error) throw rpcError(error.code);
  return resultHousehold(data, newSecret);
}
export async function logoutHousehold(secret: string) {
  const { error } = await householdClient(secret).rpc("logout_household");
  if (error) throw rpcError(error.code);
}
export function clearInviteFragment() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url.href);
}
export function rememberHousehold(household: Household) {
  clearInviteFragment();
  localStorage.setItem(householdStorageKey, household.secret);
}
export function forgetHousehold() {
  clearInviteFragment();
  localStorage.removeItem(householdStorageKey);
}
