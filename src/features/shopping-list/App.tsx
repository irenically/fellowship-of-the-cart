import { AppLayout } from "../../components/AppLayout";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRepository, type Repository } from "../../lib/repository";
import { sortItems, validateInput, type Item } from "./model";
import { ItemRow } from "./ItemRow";
import { Icon } from "../../components/Icon";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Something went wrong. Please try again.";
}
export function App({
  repository: supplied,
  householdControls,
}: {
  repository?: Repository;
  householdControls?: ReactNode;
}) {
  const [configuration] = useState(() => {
    try {
      return { repository: supplied ?? createRepository(), error: "" };
    } catch (cause) {
      return { repository: undefined, error: message(cause) };
    }
  });
  const repository = configuration.repository;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(configuration.error);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!repository) return;
    const generation = ++request.current;
    try {
      const next = await repository.list();
      if (generation === request.current) {
        setItems(sortItems(next));
        setLoadError("");
      }
    } catch (cause) {
      if (generation === request.current) setLoadError(message(cause));
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    if (!repository) return;
    const reload = () => {
      void refresh();
    };
    const unsubscribe = repository.subscribe(reload);
    reload();
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    const invalidate = () => {
      request.current++;
    };
    return () => {
      invalidate();
      unsubscribe();
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
    };
  }, [repository, refresh]);
  async function act(
    key: string,
    operation: () => Promise<void>,
  ): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(key);
    setError("");
    try {
      await operation();
      await refresh();
      return true;
    } catch (cause) {
      setError(message(cause));
      return false;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!repository || lock.current) return;
    if (!name.trim()) {
      setNameError("Enter at least one non-blank character.");
      input.current?.focus();
      return;
    }
    setNameError("");
    try {
      const value = validateInput({ name, quantity: 1, unit: "piece" });
      if (await act("add", () => repository.add(value))) {
        setName("");
        input.current?.focus();
      }
    } catch (cause) {
      setError(message(cause));
    }
  }
  const gathered = items.filter((item) => item.is_purchased).length;
  const remaining = items.length - gathered;
  return (
    <AppLayout>
      <Paper
        component="section"
        variant="outlined"
        elevation={0}
        className="quest"
        aria-labelledby="quest-heading"
        aria-busy={loading || !!busy}
      >
        {householdControls}
        <div className="quest-header">
          <div>
            <h2 id="quest-heading">The Quest Log</h2>
          </div>
          <div className="shopping-progress">
            <p
              className="progress-copy"
              aria-live="polite"
              id="shopping-progress-label"
            >
              {gathered} of {items.length} provisions gathered
            </p>
            <LinearProgress
              variant="determinate"
              value={items.length ? (gathered / items.length) * 100 : 0}
              aria-labelledby="shopping-progress-label"
            />
          </div>
        </div>
        <form className="add-form" onSubmit={add}>
          <label className="sr-only" htmlFor="new-item">
            Item name
          </label>
          <div className="add-field">
            <TextField
              id="new-item"
              inputRef={input}
              value={name}
              error={!!nameError}
              helperText={nameError || undefined}
              slotProps={{
                htmlInput: { readOnly: busy === "add", enterKeyHint: "done" },
                formHelperText: { role: nameError ? "alert" : undefined },
              }}
              onChange={(event) => {
                setName(event.target.value);
                if (event.target.value.trim()) setNameError("");
              }}
              placeholder="What shall we acquire?"
              autoComplete="off"
              disabled={!repository || loading}
            />
          </div>
          <IconButton
            className="add-button"
            type="submit"
            aria-label={busy === "add" ? "Adding item" : "Add item"}
            title="Add item (Enter)"
            disabled={!!busy || !repository || loading}
          >
            <Icon name="plus" />
          </IconButton>
        </form>
        <span className="sr-only" role="status">
          {busy ? "Saving changes…" : ""}
        </span>
        {(error || loadError) && (
          <Alert
            severity="error"
            icon={false}
            action={
              repository ? (
                <Button
                  onClick={() => {
                    setError("");
                    void refresh();
                  }}
                >
                  Refresh list
                </Button>
              ) : undefined
            }
          >
            {error || loadError}
          </Alert>
        )}
        {loading && repository ? (
          <p className="empty" role="status">
            Opening the quest log…
          </p>
        ) : items.length === 0 && loadError ? (
          <p className="empty">
            The list could not be loaded. Refresh to try again.
          </p>
        ) : items.length === 0 ? (
          <div className="empty empty-list">
            <img
              className="empty-emblem"
              src={`${import.meta.env.BASE_URL}assets/Golden Cart Botanical Emblem.png`}
              alt=""
              aria-hidden="true"
              width="1536"
              height="1024"
            />
            <h3>
              <span>The quest log is empty.</span>
              <span>The pantry may not be.</span>
            </h3>
            <p>Add your first provision to begin the journey.</p>
            <div className="botanical-divider" aria-hidden="true" />
          </div>
        ) : (
          <>
            {([false, true] as const).map((purchased) => {
              const group = items.filter(
                (item) => item.is_purchased === purchased,
              );
              return (
                group.length > 0 && (
                  <section
                    className="item-group"
                    key={String(purchased)}
                    aria-label={
                      purchased ? "Gathered provisions" : "Provisions to gather"
                    }
                  >
                    {purchased && remaining > 0 && (
                      <div className="botanical-divider" aria-hidden="true" />
                    )}
                    <div className="group-toolbar">
                      <h3 className="group-heading">
                        <img
                          className="botanical-sprig"
                          src={`${import.meta.env.BASE_URL}assets/Watercolor Three-Leaf Botanical Sprig.png`}
                          alt=""
                          aria-hidden="true"
                          width="34"
                          height="40"
                        />
                        {purchased ? "Gathered Provisions" : "To Gather"}
                      </h3>
                      {purchased && (
                        <Button
                          className="clear-gathered"
                          variant="outlined"
                          startIcon={<Icon name="trash" />}
                          disabled={!!busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Clear all ${gathered} purchased items?`,
                              )
                            )
                              void act("clear", () => repository!.clear());
                          }}
                        >
                          Clear gathered
                        </Button>
                      )}
                    </div>
                    <ul>
                      {group.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          busy={!!busy}
                          save={(value) =>
                            act(item.id, () =>
                              repository!.update(item.id, value),
                            )
                          }
                          toggle={() =>
                            void act(item.id, () =>
                              repository!.toggle(item.id, !item.is_purchased),
                            )
                          }
                          remove={() =>
                            void act(item.id, () => repository!.remove(item.id))
                          }
                        />
                      ))}
                    </ul>
                  </section>
                )
              );
            })}
            {gathered === items.length && (
              <p className="all-done">
                The fellowship has gathered its provisions.
              </p>
            )}
            {gathered > 0 && (
              <div className="list-footer">
                <span>A little lighter, a little more prepared.</span>
              </div>
            )}
          </>
        )}
      </Paper>
      <p className="household-note">
        For the household. For the second breakfast.
      </p>
    </AppLayout>
  );
}
