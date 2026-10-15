import { useState } from "react";
import {
  formatQuantity,
  parseQuantity,
  units,
  validateInput,
  type Item,
  type ItemInput,
  type Unit,
} from "./model";
interface Props {
  item: Item;
  busy: boolean;
  save: (input: ItemInput) => Promise<boolean>;
  toggle: () => void;
  remove: () => void;
}
export function ItemRow({ item, busy, save, toggle, remove }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [error, setError] = useState("");
  function begin() {
    setName(item.name);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setError("");
    setEditing(true);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    try {
      const input = validateInput({
        name,
        quantity: parseQuantity(quantity),
        unit,
      });
      if (await save(input)) setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Check the item details.",
      );
    }
  }
  return (
    <li className={`item ${item.is_purchased ? "purchased" : ""}`}>
      {editing ? (
        <form
          className="editor"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              event.preventDefault();
              setEditing(false);
            }
          }}
        >
          <label className="edit-name">
            Item name
            <input
              autoFocus
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Quantity
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Unit
            <select
              value={unit}
              onChange={(event) => setUnit(event.target.value as Unit)}
              disabled={busy}
            >
              {Object.entries(units).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="edit-actions">
            <button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              disabled={busy}
              className="quiet"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <input
            className="check"
            type="checkbox"
            aria-label={`Mark ${item.name} as ${item.is_purchased ? "needed" : "purchased"}`}
            checked={item.is_purchased}
            disabled={busy}
            onChange={toggle}
          />
          <button
            className="item-title"
            onClick={begin}
            disabled={busy}
            aria-label={`Edit ${item.name}`}
          >
            <span>{item.name}</span>
            <small>
              {formatQuantity(item.quantity)}{" "}
              {item.unit === "piece" && item.quantity !== 1
                ? "pieces"
                : units[item.unit]}
            </small>
          </button>
          <button
            className="delete quiet"
            aria-label={`Delete ${item.name}`}
            onClick={remove}
            disabled={busy}
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}
