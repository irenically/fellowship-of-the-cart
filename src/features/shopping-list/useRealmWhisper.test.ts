import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import whispers from "../../data/whispers.json";
import { pickWhisper, useRealmWhisper } from "./useRealmWhisper";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("limits action commentary and rotates without repeating the current line", () => {
  const { result, unmount } = renderHook(useRealmWhisper);
  expect(result.current.quote).toBe(whispers.wisdom[0]);
  act(() => result.current.whisper("itemAdded"));
  expect(result.current.quote).toBe(whispers.itemAdded[0]);
  act(() => result.current.whisper("itemEdited"));
  expect(result.current.quote).toBe(whispers.itemAdded[0]);
  act(() => vi.advanceTimersByTime(90_000));
  expect(result.current.quote).toBe(whispers.wisdom[0]);
  act(() => vi.advanceTimersByTime(90_000));
  expect(result.current.quote).toBe(whispers.wisdom[1]);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps quiet in hidden tabs and leaves the quote still while typing", () => {
  const { result } = renderHook(useRealmWhisper);
  vi.mocked(
    Object.getOwnPropertyDescriptor(document, "hidden")!.get!,
  ).mockReturnValue(true);
  act(() => vi.advanceTimersByTime(90_000));
  act(() => result.current.whisper("itemAdded"));
  expect(result.current.quote).toBe(whispers.wisdom[0]);
  vi.mocked(
    Object.getOwnPropertyDescriptor(document, "hidden")!.get!,
  ).mockReturnValue(false);
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  act(() => vi.advanceTimersByTime(90_000));
  expect(result.current.quote).toBe(whispers.wisdom[0]);
  input.blur();
  act(() => vi.advanceTimersByTime(90_000));
  expect(result.current.quote).toBe(whispers.wisdom[1]);
});

it("uses both parts of completion whispers as one static quote", () => {
  const line = whispers.shoppingCompleted[0];
  expect(pickWhisper("shoppingCompleted")).toBe(
    `${line.title} ${line.subtitle}`,
  );
});
