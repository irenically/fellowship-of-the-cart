import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  parseQuantity,
  sortItems,
  validateInput,
  type Item,
} from "./model";
describe("quantities", () => {
  it.each([
    ["1,25", 1.25],
    ["2.500", 2.5],
    [".5", 0.5],
    [" 3 ", 3],
  ] as const)("parses %s", (raw, expected) => {
    expect(parseQuantity(raw)).toBe(expected);
  });
  it.each([
    "",
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "1,2.3",
    "1.1234",
    "1000000",
  ])("rejects %s", (raw) => {
    expect(() => parseQuantity(raw)).toThrow();
  });
  it("formats without trailing zeros or binary artifacts", () => {
    expect(formatQuantity(2.5)).toBe("2.5");
    expect(formatQuantity(0.1 + 0.2)).toBe("0.3");
  });
});
describe("validation and ordering", () => {
  it("trims names, rejects blank names and allows long names", () => {
    expect(
      validateInput({ name: " Milk ", quantity: 1, unit: "piece" }).name,
    ).toBe("Milk");
    for (const name of ["", " "])
      expect(() =>
        validateInput({ name, quantity: 1, unit: "piece" }),
      ).toThrow();
    expect(validateInput({ name: "a".repeat(500), quantity: 1, unit: "piece" }).name).toHaveLength(500);
  });
  it("groups purchased last without mutating source", () => {
    const a: Item = {
      id: "a",
      name: "Milk",
      quantity: 1,
      unit: "piece",
      is_purchased: true,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const b = { ...a, id: "b", is_purchased: false };
    const original = [a, b];
    expect(sortItems(original).map((item) => item.id)).toEqual(["b", "a"]);
    expect(original[0]).toBe(a);
  });
});
