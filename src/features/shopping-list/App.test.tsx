import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { localRepository } from "../../lib/repository";
import { App } from "./App";
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("adds with Enter, refocuses, cancels edits, saves comma quantities and completes", async () => {
  const user = userEvent.setup();
  render(<App repository={localRepository()} />);
  const input = await screen.findByPlaceholderText("What shall we acquire?");
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
  await user.type(input, " Milk {Enter}");
  await screen.findByRole("button", { name: "Edit Milk" });
  expect((input as HTMLInputElement).value).toBe("");
  expect(document.activeElement).toBe(input);
  await user.click(screen.getByRole("button", { name: "Edit Milk" }));
  await user.clear(
    screen.getByLabelText("Item name", { selector: ".editor input" }),
  );
  await user.type(
    screen.getByLabelText("Item name", { selector: ".editor input" }),
    "Bread{Escape}",
  );
  expect(screen.getByRole("button", { name: "Edit Milk" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Edit Milk" }));
  await user.clear(screen.getByLabelText("Quantity"));
  await user.type(screen.getByLabelText("Quantity"), "1,5");
  await user.selectOptions(screen.getByLabelText("Unit"), "l");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("1.5 l");
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
  reject(new Error("Connection lost"));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("Connection lost");
  expect((input as HTMLInputElement).value).toBe("Milk");
  expect(screen.queryByRole("button", { name: "Edit Milk" })).toBeNull();
});
