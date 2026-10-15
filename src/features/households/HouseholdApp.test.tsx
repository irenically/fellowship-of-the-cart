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
  rememberHousehold: vi.fn(),
}));
vi.mock("../../lib/repository", async (original) => ({
  ...(await original<typeof import("../../lib/repository")>()),
  createRepository: vi.fn(),
}));

const homeA = { id: "one", name: "The Shire", secret: "a".repeat(64) };
const homeB = { id: "two", name: "Rivendell", secret: "b".repeat(64) };
function isolatedRepository() {
  const data = new Map<string, string>();
  return localRepository({
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } as unknown as Storage);
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  vi.mocked(households.sharedConfiguration).mockReturnValue({
    url: "https://example.supabase.co",
    key: "public-key",
  });
  vi.mocked(households.initialHouseholdSecret).mockReturnValue(null);
});
afterEach(cleanup);

it("creates, shares, and switches households without displaying the previous household's items", async () => {
  const repoA = isolatedRepository();
  const repoB = isolatedRepository();
  await repoB.add({ name: "Bananas", quantity: 2, unit: "piece" });
  vi.mocked(createRepository).mockImplementation((secret) =>
    secret === homeA.secret ? repoA : repoB,
  );
  vi.mocked(households.createHousehold).mockResolvedValue(homeA);
  vi.mocked(households.openHousehold).mockImplementation(async (secret) =>
    secret === homeA.secret ? homeA : homeB,
  );
  const user = userEvent.setup();
  render(
    <AppTheme>
      <HouseholdApp />
    </AppTheme>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Household name" }),
    homeA.name,
  );
  await user.click(screen.getByRole("button", { name: "Create household" }));
  await screen.findByText(homeA.name);
  const input = screen.getByPlaceholderText("What shall we acquire?");
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
  await user.type(input, "Milk{Enter}");
  await screen.findByRole("button", { name: "Edit Milk" });
  await user.click(screen.getByRole("button", { name: "Copy invite link" }));
  expect(
    (
      (await screen.findByRole("textbox", {
        name: "Private invite link",
      })) as HTMLInputElement
    ).value,
  ).toContain(`#household=${homeA.secret}`);
  await user.click(screen.getByRole("button", { name: "Switch household" }));
  await user.type(
    screen.getByRole("textbox", { name: "Household invite link" }),
    households.householdLink(homeB.secret),
  );
  await user.click(screen.getByRole("button", { name: "Join household" }));
  await screen.findByRole("button", { name: "Edit Bananas" });
  expect(screen.queryByRole("button", { name: "Edit Milk" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Switch household" }));
  await user.type(
    screen.getByRole("textbox", { name: "Household invite link" }),
    households.householdLink(homeA.secret),
  );
  await user.click(screen.getByRole("button", { name: "Join household" }));
  await screen.findByRole("button", { name: "Edit Milk" });
  expect(screen.queryByRole("button", { name: "Edit Bananas" })).toBeNull();
});

it("validates a remembered link before opening a list and rejects invalid links without falling back", async () => {
  vi.mocked(households.initialHouseholdSecret).mockReturnValue(homeA.secret);
  vi.mocked(households.openHousehold).mockRejectedValue(
    new Error("This household link no longer works."),
  );
  render(
    <AppTheme>
      <HouseholdApp />
    </AppTheme>,
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("no longer works");
  expect(createRepository).not.toHaveBeenCalled();
  expect(households.rememberHousehold).not.toHaveBeenCalled();
  expect(screen.queryByPlaceholderText("What shall we acquire?")).toBeNull();
});

it("reuses the same creation key after a network failure to avoid duplicate households", async () => {
  vi.mocked(households.createHousehold)
    .mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValueOnce(homeA);
  vi.mocked(createRepository).mockReturnValue(isolatedRepository());
  const user = userEvent.setup();
  render(
    <AppTheme>
      <HouseholdApp />
    </AppTheme>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Household name" }),
    homeA.name,
  );
  await user.click(screen.getByRole("button", { name: "Create household" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Create household" }));
  await screen.findByText(homeA.name);
  const calls = vi.mocked(households.createHousehold).mock.calls;
  expect(calls[0][1]).toBe(calls[1][1]);
  expect(calls[0][1]).toMatch(/^[a-f0-9]{64}$/);
});
