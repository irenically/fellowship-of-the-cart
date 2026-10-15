import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render as renderUI,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { AppTheme } from "../../styles/theme";
import userEvent from "@testing-library/user-event";
import { localRepository } from "../../lib/repository";
import { App } from "./App";
function render(element: ReactElement) {
  return renderUI(<AppTheme>{element}</AppTheme>);
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("shows empty-name validation under the input and clears it while typing", async () => {
  const repo = localRepository();
  const user = userEvent.setup();
  render(<App repository={repo} />);
  const input = screen.getByPlaceholderText(
    "What shall we acquire?",
  ) as HTMLInputElement;
  await waitFor(() => expect(input.disabled).toBe(false));
  await user.click(screen.getByRole("button", { name: "Add item" }));
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe(
    screen.getByRole("alert").id,
  );
  expect(screen.queryByRole("button", { name: "Refresh list" })).toBeNull();
  await user.type(input, " ");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  await user.type(input, "M");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(await repo.list()).toEqual([]);
  expect(input.getAttribute("maxlength")).toBeNull();
  await user.clear(input);
  await user.paste("a".repeat(160));
  await user.keyboard("{Enter}");
  await waitFor(async () =>
    expect((await repo.list())[0].name).toHaveLength(160),
  );
});
it("moves an item home and returns it to shopping without deleting it", async () => {
  const repo = localRepository();
  await repo.add({ name: "Tea", quantity: 2, unit: "piece" });
  const user = userEvent.setup();
  render(<App repository={repo} />);
  await user.click(
    await screen.findByRole("button", { name: "Already have Tea at home" }),
  );
  await screen.findByText("1 of 1 provisions gathered");
  expect((await repo.list())[0].is_purchased).toBe(true);
  await user.click(
    screen.getByRole("button", { name: "Return Tea to shopping" }),
  );
  await screen.findByText("0 of 1 provisions gathered");
  expect(await repo.list()).toHaveLength(1);
  expect((await repo.list())[0].is_purchased).toBe(false);
});
it("adds with Enter, refocuses, cancels edits, saves comma quantities and completes", async () => {
  const user = userEvent.setup();
  render(<App repository={localRepository()} />);
  const input = await screen.findByPlaceholderText("What shall we acquire?");
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
  await user.type(input, " Milk {Enter}");
  await screen.findByRole("button", { name: "Edit Milk" });
  expect((input as HTMLInputElement).value).toBe("");
  expect(document.activeElement).toBe(input);
  await user.click(screen.getByText("Milk", { exact: true }));
  await user.click(screen.getByText("1 pcs", { exact: true }));
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Edit Milk" }));
  await user.clear(
    screen.getByLabelText("Item name", { selector: ".editor input" }),
  );
  await user.type(
    screen.getByLabelText("Item name", { selector: ".editor input" }),
    "Bread{Escape}",
  );
  expect(screen.getByRole("button", { name: "Edit Milk" })).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Edit Milk" }),
  );
  await user.click(screen.getByRole("button", { name: "Edit Milk" }));
  await user.clear(screen.getByLabelText("Quantity"));
  await user.type(screen.getByLabelText("Quantity"), "1,5");
  await user.selectOptions(screen.getByLabelText("Unit"), "l");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("1.5 l");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Edit Milk" }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Mark Milk as purchased" }),
  );
  await screen.findByText("1 of 1 provisions gathered");
  vi.spyOn(window, "confirm").mockReturnValueOnce(false);
  await user.click(screen.getByRole("button", { name: "Clear gathered" }));
  expect(screen.getByRole("button", { name: "Edit Milk" })).toBeTruthy();
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  await user.click(screen.getByRole("button", { name: "Clear gathered" }));
  await screen.findByText("The quest log is empty.");
  vi.restoreAllMocks();
});
it("keeps failed additions visible in the input and prevents duplicate submissions", async () => {
  const repo = localRepository();
  let reject: (error: Error) => void = () => {};
  repo.add = vi.fn(
    () =>
      new Promise<void>((_resolve, failure) => {
        reject = failure;
      }),
  );
  const user = userEvent.setup();
  render(<App repository={repo} />);
  const input = screen.getByPlaceholderText("What shall we acquire?");
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
  await user.type(input, "Milk{Enter}{Enter}");
  expect(repo.add).toHaveBeenCalledTimes(1);
  expect((input as HTMLInputElement).readOnly).toBe(true);
  await user.type(input, "Bread");
  expect((input as HTMLInputElement).value).toBe("Milk");
  reject(new Error("Connection lost"));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("Connection lost");
  expect((input as HTMLInputElement).value).toBe("Milk");
  expect((input as HTMLInputElement).readOnly).toBe(false);
  expect(screen.queryByRole("button", { name: "Edit Milk" })).toBeNull();
});
