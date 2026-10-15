import { useCallback, useEffect, useRef, useState } from "react";
import { createRepository, type Repository } from "../../lib/repository";
import { sortItems, validateInput, type Item } from "./model";
import { ItemRow } from "./ItemRow";
import { Icon } from "../../components/Icon";
function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Something went wrong. Please try again.";
}
export function App({ repository: supplied }: { repository?: Repository }) {
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
    const timer = window.setInterval(reload, 15000);
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    const invalidate = () => {
      request.current++;
    };
    return () => {
      invalidate();
      unsubscribe();
      window.clearInterval(timer);
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
    <>
    <main>
      <header className="brand">
        <div className="crest" aria-hidden="true">
          <img
            src={`${import.meta.env.BASE_URL}assets/Golden Cart and Olive Branch Ornament.png`}
            alt=""
            width="2172"
            height="724"
          />
        </div>
        <h1>
          <span>
          The Fellowship
          <br className="mobile-break" /> of the Cart
          </span>
        </h1>
        <p className="tagline">One list to rule them all.</p>
      </header>
      <section className="quest" aria-labelledby="quest-heading">
        <div className="quest-header">
          <div>
            <p className="eyebrow">YOUR EVERYDAY ADVENTURE</p>
            <h2 id="quest-heading">The Quest Log</h2>
          </div>
          <div className="shopping-progress">
            <p className="progress-copy" aria-live="polite" id="shopping-progress-label">
              {gathered} of {items.length} provisions gathered
            </p>
            <progress value={gathered} max={Math.max(items.length, 1)} aria-labelledby="shopping-progress-label" />
          </div>
        </div>
        <form className="add-form" onSubmit={add}>
          <label className="sr-only" htmlFor="new-item">
            Item name
          </label>
          <div className="add-field">
          <input
            id="new-item"
            ref={input}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) setNameError("");
            }}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "new-item-error" : undefined}
            placeholder="What shall we acquire?"
            autoComplete="off"
            disabled={!repository || loading}
          />
          {nameError && <p className="field-error" id="new-item-error" role="alert">{nameError}</p>}
          </div>
          <button
            type="submit"
            aria-label={busy === "add" ? "Adding item" : "Add item"}
            title="Add item (Enter)"
            disabled={!!busy || !repository || loading}
          >
            <Icon name="plus" />
          </button>
        </form>
        <span className="sr-only" role="status">{busy ? "Saving changes…" : ""}</span>
        {(error || loadError) && (
          <div className="error" role="alert">
            {error || loadError}{" "}
            {repository && (
              <button
                className="quiet"
                onClick={() => {
                  setError("");
                  void refresh();
                }}
              >
                Refresh list
              </button>
            )}
          </div>
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
                    <h3
                      className={`group-heading ${purchased ? "gathered-heading" : ""}`}
                    >
                      {purchased && (
                        <img
                          className="botanical-sprig"
                          src={`${import.meta.env.BASE_URL}assets/Watercolor Three-Leaf Botanical Sprig.png`}
                          alt=""
                          aria-hidden="true"
                          width="34"
                          height="40"
                        />
                      )}
                      {purchased ? "Gathered Provisions" : "TO GATHER"}{" "}
                      <span>{group.length}</span>
                    </h3>
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
                <button
                  className="quiet"
                  disabled={!!busy}
                  onClick={() => {
                    if (
                      window.confirm(`Clear all ${gathered} purchased items?`)
                    )
                      void act("clear", () => repository!.clear());
                  }}
                >
                  Clear gathered
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <p className="household-note">For the household. For the second breakfast.</p>
    </main>
    <footer className="page-footer">
      <div className="footer-content">
        <p className="footer-copyright">© {new Date().getFullYear()} The Fellowship of the Cart</p>
        <nav aria-label="Footer links">
          <a href="https://irenically.github.io/dungeons-and-drumsticks/">Dungeons &amp; Drumsticks</a>
          <a className="github-link" href="https://github.com/irenically/fellowship-of-the-cart" aria-label="View source on GitHub" title="View source on GitHub">
            <span className="github-icon" aria-hidden="true" />
          </a>
        </nav>
        <p className="footer-note">Forged with love, fueled by snacks.</p>
      </div>
    </footer>
    </>
  );
}
