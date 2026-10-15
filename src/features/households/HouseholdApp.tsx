import { useEffect, useRef, useState, type FocusEvent } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import { AppLayout } from "../../components/AppLayout";
import { createRepository, type Repository } from "../../lib/repository";
import {
  createHousehold,
  householdLink,
  initialHouseholdSecret,
  newHouseholdSecret,
  openHousehold,
  rememberHousehold,
  secretFromLink,
  sharedConfiguration,
  type Household,
} from "../../lib/household";
import { App } from "../shopping-list/App";

interface Session {
  household: Household;
  repository: Repository;
}
function errorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Could not open the household. Please try again.";
}
function sessionFor(household: Household) {
  let notice = "";
  try {
    rememberHousehold(household);
  } catch {
    notice =
      "This browser could not remember your household. Keep a copy of its invite link.";
  }
  return {
    session: { household, repository: createRepository(household.secret) },
    notice,
  };
}

export function HouseholdApp() {
  const [initial] = useState(() => {
    try {
      const shared = !!sharedConfiguration();
      return {
        shared,
        secret: shared ? initialHouseholdSecret() : null,
        error: "",
      };
    } catch (cause) {
      return { shared: true, secret: null, error: errorMessage(cause) };
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState(!!initial.secret);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const [showLink, setShowLink] = useState(false);
  const request = useRef(0);
  const pendingCreate = useRef<{ name: string; secret: string } | null>(null);

  useEffect(() => {
    if (!initial.shared) return;
    let disposed = false;
    async function connect(secret: string) {
      const generation = ++request.current;
      setPending(true);
      setChoosing(true);
      setError("");
      try {
        const household = await openHousehold(secret);
        if (disposed || generation !== request.current) return;
        const next = sessionFor(household);
        setSession(next.session);
        setNotice(next.notice);
        setShowLink(false);
        setChoosing(false);
      } catch (cause) {
        if (!disposed && generation === request.current)
          setError(errorMessage(cause));
      } finally {
        if (!disposed && generation === request.current) setPending(false);
      }
    }
    if (initial.secret) void connect(initial.secret);
    const onHashChange = () => {
      if (!new URLSearchParams(window.location.hash.slice(1)).has("household"))
        return;
      try {
        void connect(secretFromLink(window.location.href));
      } catch (cause) {
        request.current++;
        setPending(false);
        setChoosing(true);
        setError(errorMessage(cause));
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      disposed = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [initial]);

  async function submit(event: React.FormEvent, action: "create" | "join") {
    event.preventDefault();
    if (pending) return;
    const generation = ++request.current;
    setPending(true);
    setError("");
    try {
      let household: Household;
      if (action === "create") {
        const clean = name.trim();
        if (!clean || clean.length > 80)
          throw new Error("Use a household name between 1 and 80 characters.");
        if (pendingCreate.current?.name !== clean)
          pendingCreate.current = { name: clean, secret: newHouseholdSecret() };
        household = await createHousehold(clean, pendingCreate.current.secret);
      } else {
        household = await openHousehold(secretFromLink(invite));
      }
      if (generation !== request.current) return;
      const next = sessionFor(household);
      setSession(next.session);
      setNotice(next.notice);
      setShowLink(false);
      setChoosing(false);
      setName("");
      setInvite("");
      pendingCreate.current = null;
    } catch (cause) {
      if (generation === request.current) setError(errorMessage(cause));
    } finally {
      if (generation === request.current) setPending(false);
    }
  }

  async function copyLink() {
    if (!session) return;
    setShowLink(true);
    try {
      await navigator.clipboard.writeText(
        householdLink(session.household.secret),
      );
      setNotice(
        "Invite link copied. Anyone with it can view and edit this household’s list.",
      );
    } catch {
      setNotice(
        "Copy the invite link below. Anyone with it can view and edit this household’s list.",
      );
    }
  }

  if (!initial.shared) return <App />;
  if (session && !choosing) {
    return (
      <App
        key={session.household.id}
        repository={session.repository}
        householdControls={
          <div className="household-controls">
            <div className="household-toolbar">
              <span className="household-name" title={session.household.name}>
                {session.household.name}
              </span>
              <Button variant="outlined" onClick={() => void copyLink()}>
                Copy invite link
              </Button>
              <Button
                onClick={() => {
                  setChoosing(true);
                  setError("");
                  setNotice("");
                }}
              >
                Switch household
              </Button>
            </div>
            {notice && (
              <p className="household-hint" role="status">
                {notice}
              </p>
            )}
            {showLink && (
              <TextField
                label="Private invite link"
                value={householdLink(session.household.secret)}
                slotProps={{
                  htmlInput: {
                    readOnly: true,
                    onFocus: (event: FocusEvent<HTMLInputElement>) =>
                      event.currentTarget.select(),
                  },
                }}
              />
            )}
          </div>
        }
      />
    );
  }
  return (
    <AppLayout>
      <Paper
        component="section"
        variant="outlined"
        elevation={0}
        className="quest household-setup"
        aria-labelledby="household-heading"
        aria-busy={pending}
      >
        <h2 id="household-heading">Your household’s quest</h2>
        <p className="household-intro">
          A shared list, just for your household. Create one or join with an
          invite link.
        </p>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        {pending ? (
          <div className="household-opening">
            <p role="status">Opening your household…</p>
            <LinearProgress />
          </div>
        ) : (
          <>
            <form
              className="household-form"
              onSubmit={(event) => void submit(event, "create")}
            >
              <TextField
                label="Household name"
                placeholder="The Shire"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
              <Button type="submit" variant="contained">
                Create household
              </Button>
            </form>
            <div className="household-join">
              <h3>Have an invite?</h3>
              <form
                className="household-form"
                onSubmit={(event) => void submit(event, "join")}
              >
                <TextField
                  label="Household invite link"
                  value={invite}
                  onChange={(event) => setInvite(event.target.value)}
                  autoComplete="off"
                  type="url"
                />
                <Button type="submit" variant="outlined">
                  Join household
                </Button>
              </form>
            </div>
            <p className="household-hint">
              No account needed. Keep your invite link private—anyone with it
              can edit the list.
            </p>
            {session && (
              <Button
                onClick={() => {
                  const next = sessionFor(session.household);
                  setNotice(next.notice);
                  setChoosing(false);
                  setError("");
                }}
              >
                Return to {session.household.name}
              </Button>
            )}
          </>
        )}
      </Paper>
    </AppLayout>
  );
}
