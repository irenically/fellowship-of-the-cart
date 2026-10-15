export const units = {
  piece: "piece",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
} as const;
export type Unit = keyof typeof units;
export interface ItemInput {
  name: string;
  quantity: number;
  unit: Unit;
}
export interface Item extends ItemInput {
  id: string;
  is_purchased: boolean;
  created_at: string;
  updated_at: string;
}
export function parseQuantity(raw: string): number {
  const value = raw.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(value))
    throw new Error("Use a positive quantity with up to 3 decimal places.");
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 999999)
    throw new Error("Quantity must be greater than 0 and at most 999999.");
  return number;
}
export function validateInput(input: ItemInput): ItemInput {
  const name = input.name.trim();
  if (!name) throw new Error("Enter at least one non-blank character.");
  if (!Object.hasOwn(units, input.unit))
    throw new Error("Choose a supported unit.");
  return {
    name,
    quantity: parseQuantity(String(input.quantity)),
    unit: input.unit,
  };
}
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(
    value,
  );
}
export function sortItems(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      Number(a.is_purchased) - Number(b.is_purchased) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}
