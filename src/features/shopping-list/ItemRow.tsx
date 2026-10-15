import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import Alert from "@mui/material/Alert";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const editTrigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      editTrigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing]);
  function finishEditing() {
    restoreFocus.current = true;
    setEditing(false);
  }
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
      if (await save(input)) finishEditing();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Check the item details.",
      );
    }
  }
  return (
    <li className={`item ${item.is_purchased ? "purchased" : ""}`}>
      <Checkbox
        className="check-target"
        slotProps={{
          input: {
            "aria-label": `Mark ${item.name} as ${item.is_purchased ? "needed" : "purchased"}`,
          },
        }}
        icon={<span className="checkbox-mark" />}
        checkedIcon={<span className="checkbox-mark" />}
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
              finishEditing();
            }
          }}
        >
          <TextField
            className="edit-name"
            autoFocus
            value={name}
            error={!!nameError}
            helperText={nameError || undefined}
            slotProps={{
              htmlInput: { "aria-label": "Item name", enterKeyHint: "done" },
              formHelperText: { role: nameError ? "alert" : undefined },
            }}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) setNameError("");
            }}
            disabled={busy}
          />
          <TextField
            slotProps={{
              htmlInput: {
                inputMode: "decimal",
                "aria-label": "Quantity",
                enterKeyHint: "done",
              },
            }}
            placeholder="Qty"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={busy}
          />
          <Select
            native
            size="small"
            value={unit}
            inputProps={{ "aria-label": "Unit" }}
            onChange={(event) => setUnit(event.target.value as Unit)}
            disabled={busy}
          >
            {Object.entries(units).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <div className="edit-actions">
            <IconButton
              disabled={busy}
              className="icon-button quiet"
              type="button"
              aria-label="Cancel"
              title="Cancel (Escape)"
              onClick={finishEditing}
            >
              <Icon name="close" />
            </IconButton>
            <IconButton
              disabled={busy}
              type="submit"
              className="icon-button save-button"
              aria-label="Save"
              title="Save (Enter)"
            >
              <Icon name="save" />
            </IconButton>
          </div>
          {error && (
            <Alert className="error" severity="error" icon={false}>
              {error}
            </Alert>
          )}
        </form>
      ) : (
        <>
          <span className="item-title" title={item.name}>
            <span>{item.name}</span>
          </span>
          <div className="item-details">
            <span className="item-quantity">
              {formatQuantity(item.quantity)}{" "}
              {units[item.unit]}
            </span>
            <div className="row-actions">
              <IconButton
                className="icon-button quiet"
                ref={editTrigger}
                onClick={begin}
                disabled={busy}
                aria-label={`Edit ${item.name}`}
                title="Edit"
              >
                <Icon name="edit" />
              </IconButton>
              <IconButton
                className="icon-button delete quiet desktop-row-action"
                color="error"
                aria-label={`Delete ${item.name}`}
                onClick={remove}
                disabled={busy}
                title="Delete"
              >
                <Icon name="trash" />
              </IconButton>
              <IconButton
                className="icon-button quiet mobile-more"
                aria-label={`More actions for ${item.name}`}
                aria-haspopup="menu"
                aria-expanded={!!menuAnchor}
                aria-controls={menuAnchor ? `actions-${item.id}` : undefined}
                disabled={busy}
                onClick={(event) => setMenuAnchor(event.currentTarget)}
              >
                <Icon name="more" />
              </IconButton>
            </div>
            <Menu
              id={`actions-${item.id}`}
              anchorEl={menuAnchor}
              open={!!menuAnchor}
              onClose={() => setMenuAnchor(null)}
            >
              <MenuItem
                sx={{ minHeight: 44, gap: 1, color: "error.main" }}
                disabled={busy}
                onClick={() => {
                  setMenuAnchor(null);
                  remove();
                }}
              >
                <Icon name="trash" /> Delete
              </MenuItem>
            </Menu>
          </div>
        </>
      )}
    </li>
  );
}
