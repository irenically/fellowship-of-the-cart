import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppTheme } from "../../styles/theme";
import * as households from "../../lib/household";
import { createRepository, localRepository } from "../../lib/repository";
import { HouseholdApp } from "./HouseholdApp";
vi.mock("../../lib/household", async (original) => ({
  ...(await original<typeof import("../../lib/household")>()),
  sharedConfiguration: vi.fn(),
  initialHouseholdSecret: vi.fn(),
  openHousehold: vi.fn(),
  createHousehold: vi.fn(),
  loginHousehold: vi.fn(),
  logoutHousehold: vi.fn(),
  setHouseholdPassword: vi.fn(),
  rememberHousehold: vi.fn(),
  forgetHousehold: vi.fn(),
}));
vi.mock("../../lib/repository", async (original) => ({
  ...(await original<typeof import("../../lib/repository")>()),
  createRepository: vi.fn(),
}));
const homeA = {
  id: "one",
  name: "My Household",
  slug: "my-household",
  needsPassword: false,
  secret: "a".repeat(64),
};
const homeB = {
  id: "two",
  name: "Rivendell",
  slug: "rivendell",
  needsPassword: false,
  secret: "b".repeat(64),
};
function isolatedRepository() {
  const data = new Map<string, string>();
  return localRepository({
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  } as unknown as Storage);
}
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
  vi.mocked(households.sharedConfiguration).mockReturnValue({
    url: "https://example.supabase.co",
    key: "public-key",
  });
  vi.mocked(households.initialHouseholdSecret).mockReturnValue(null);
});
afterEach(cleanup);
function mount() {
  render(
    <AppTheme>
      <HouseholdApp />
    </AppTheme>,
  );
}
async function passwordFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Household password", { exact: false }),
    "fixture-password",
  );
  await user.type(
    screen.getByLabelText("Confirm password", { exact: false }),
    "fixture-password",
  );
}
it("suggests an editable ID, creates a household, and switches without stale items", async () => {
  const repoA = isolatedRepository(),
    repoB = isolatedRepository();
  await repoB.add({ name: "Bananas", quantity: 2, unit: "piece" });
  vi.mocked(createRepository).mockImplementation((secret) =>
    secret === homeA.secret ? repoA : repoB,
  );
  vi.mocked(households.createHousehold).mockResolvedValue(homeA);
  vi.mocked(households.loginHousehold).mockImplementation(async (slug) =>
    slug === homeA.slug ? homeA : homeB,
  );
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("tab", { name: "Create household" }));
  await user.type(
    screen.getByRole("textbox", { name: "Household name" }),
    homeA.name,
  );
  expect(
    (screen.getByRole("textbox", { name: /Household ID/ }) as HTMLInputElement)
      .value,
  ).toBe(homeA.slug);
  await passwordFields(user);
  await user.click(screen.getByRole("button", { name: "Create household" }));
  await screen.findByText(homeA.name);
  const input = screen.getByPlaceholderText("What shall we acquire?");
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
  await user.type(input, "Milk{Enter}");
  await screen.findByRole("button", { name: "Edit Milk" });
  await user.click(screen.getByRole("button", { name: "Copy household ID" }));
  expect(screen.getByText(/Household ID copied/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Switch household" }));
  await user.type(
    screen.getByRole("textbox", { name: /Household ID/ }),
    homeB.slug,
  );
  await user.type(
    screen.getByLabelText("Password", { exact: false }),
    "fixture-password",
  );
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Edit Bananas" });
  expect(screen.queryByRole("button", { name: "Edit Milk" })).toBeNull();
});
it("rejects invalid sessions before opening a list", async () => {
  vi.mocked(households.initialHouseholdSecret).mockReturnValue(homeA.secret);
  vi.mocked(households.openHousehold).mockRejectedValue(
    new Error("Your household session has expired."),
  );
  mount();
  await screen.findByRole("alert");
  expect(createRepository).not.toHaveBeenCalled();
  expect(households.rememberHousehold).not.toHaveBeenCalled();
  expect(screen.queryByPlaceholderText("What shall we acquire?")).toBeNull();
});
it("keeps the creation key after a lost response and retains form values on error", async () => {
  vi.mocked(households.createHousehold)
    .mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValueOnce(homeA);
  vi.mocked(createRepository).mockReturnValue(isolatedRepository());
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("tab", { name: "Create household" }));
  await user.type(
    screen.getByRole("textbox", { name: "Household name" }),
    homeA.name,
  );
  await passwordFields(user);
  await user.click(screen.getByRole("button", { name: "Create household" }));
  await screen.findByRole("alert");
  expect(
    (screen.getByRole("textbox", { name: /Household ID/ }) as HTMLInputElement)
      .value,
  ).toBe(homeA.slug);
  await user.click(screen.getByRole("button", { name: "Create household" }));
  await screen.findByText(homeA.name);
  const calls = vi.mocked(households.createHousehold).mock.calls;
  expect(calls[0][1]).toBe(calls[1][1]);
  expect(calls[0][1]).toMatch(/^[a-f0-9]{64}$/);
});
it("upgrades an existing household without replacing its groceries", async () => {
  const repo = isolatedRepository();
  await repo.add({ name: "Existing milk", quantity: 1, unit: "l" });
  vi.mocked(households.initialHouseholdSecret).mockReturnValue(homeA.secret);
  vi.mocked(households.openHousehold).mockResolvedValue({
    ...homeA,
    slug: null,
    needsPassword: true,
  });
  vi.mocked(households.setHouseholdPassword).mockImplementation(
    async (_, slug, _password, secret) => ({ ...homeA, slug, secret }),
  );
  vi.mocked(createRepository).mockReturnValue(repo);
  const user = userEvent.setup();
  mount();
  await screen.findByText("Set up household sign-in");
  await passwordFields(user);
  await user.click(
    screen.getByRole("button", { name: "Save household sign-in" }),
  );
  await screen.findByRole("button", { name: "Edit Existing milk" });
  const call = vi.mocked(households.setHouseholdPassword).mock.calls[0];
  expect(call[0]).toBe(homeA.secret);
  expect(call[3]).not.toBe(homeA.secret);
});
it("revokes the current session and forgets it when signing out", async () => {
  vi.mocked(households.initialHouseholdSecret).mockReturnValue(homeA.secret);
  vi.mocked(households.openHousehold).mockResolvedValue(homeA);
  vi.mocked(households.logoutHousehold).mockResolvedValue(undefined);
  vi.mocked(createRepository).mockReturnValue(isolatedRepository());
  const user = userEvent.setup();
  mount();
  await screen.findByText(homeA.name);
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("button", { name: "Sign in" });
  expect(households.logoutHousehold).toHaveBeenCalledWith(homeA.secret);
  expect(households.forgetHousehold).toHaveBeenCalled();
  expect(screen.queryByPlaceholderText("What shall we acquire?")).toBeNull();
});
