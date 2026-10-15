import { useState } from "react";
import { Icon } from "../../components/Icon";
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
  const [nameError, setNameError] = useState("");
  function begin() {
    setName(item.name);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setError("");
    setNameError("");
    setEditing(true);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setNameError("Enter at least one non-blank character.");
      return;
    }
    setNameError("");
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
      <input
        className="check"
        type="checkbox"
        aria-label={`Mark ${item.name} as ${item.is_purchased ? "needed" : "purchased"}`}
        checked={item.is_purchased}
        disabled={busy || editing}
        onChange={toggle}
      />
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
            <span className="sr-only">Item name</span>
            <input
              autoFocus
              value={name}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? `name-error-${item.id}` : undefined}
              aria-label="Item name"
              onChange={(event) => {
                setName(event.target.value);
                if (event.target.value.trim()) setNameError("");
              }}
              disabled={busy}
            />
            {nameError && <span className="field-error" id={`name-error-${item.id}`} role="alert">{nameError}</span>}
          </label>
          <label>
            <span className="sr-only">Quantity</span>
            <input
              inputMode="decimal"
              aria-label="Quantity"
              placeholder="Qty"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            <span className="sr-only">Unit</span>
            <select
              value={unit}
              aria-label="Unit"
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
            <button
              disabled={busy}
              className="icon-button quiet"
              type="button"
              aria-label="Cancel"
              title="Cancel (Escape)"
              onClick={() => setEditing(false)}
            >
              <Icon name="close" />
            </button>
            <button
              disabled={busy}
              type="submit"
              className="icon-button save-button"
              aria-label="Save"
              title="Save (Enter)"
            >
              <Icon name="save" />
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
          <button
            className="item-title"
            onClick={begin}
            disabled={busy}
            aria-label={`Edit ${item.name}`}
          >
            <span>{item.name}</span>
          </button>
          <button className="item-quantity" onClick={begin} disabled={busy} aria-label={`Edit quantity for ${item.name}`} title="Edit quantity">
            {formatQuantity(item.quantity)}{" "}
            {item.unit === "piece" && item.quantity !== 1
              ? "pieces"
              : units[item.unit]}
          </button>
          <div className="row-actions">
            <button
              className="icon-button quiet"
              onClick={begin}
              disabled={busy}
              aria-label={`Edit details for ${item.name}`}
              title="Edit"
            >
              <Icon name="edit" />
            </button>
            <button
              className={`icon-button quiet home-button ${item.is_purchased ? "is-home" : ""}`}
              onClick={toggle}
              disabled={busy}
              aria-pressed={item.is_purchased}
              aria-label={
                item.is_purchased
                  ? `Return ${item.name} to shopping`
                  : `Already have ${item.name} at home`
              }
              title={
                item.is_purchased ? "Return to shopping" : "Already at home"
              }
            >
              <Icon name="home" />
            </button>
            <button
              className="icon-button delete quiet"
              aria-label={`Delete ${item.name}`}
              onClick={remove}
              disabled={busy}
              title="Delete"
            >
              <Icon name="trash" />
            </button>
          </div>
        </>
      )}
    </li>
  );
}
