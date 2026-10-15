import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import { AppLayout } from "../../components/AppLayout";
import { createRepository, type Repository } from "../../lib/repository";
import {
  createHousehold,
  forgetHousehold,
  householdId,
  initialHouseholdSecret,
  loginHousehold,
  logoutHousehold,
  newHouseholdSecret,
  openHousehold,
  rememberHousehold,
  secretFromLink,
  setHouseholdPassword,
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
      "This browser could not remember your session. You can sign in again with the household ID and password.";
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
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [name, setName] = useState("");
  const [manualId, setManualId] = useState<string | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const lock = useRef(false);
  const creationKey = useRef<{ identity: string; key: string } | null>(null);
  const upgradeKey = useRef<string | null>(null);
  const upgrading = !!session?.household.needsPassword && !choosing;
  const creating = mode === "create" || upgrading;
  const slug = creating ? (manualId ?? householdId(name)) : loginId;

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
        setChoosing(false);
        setPassword("");
        setConfirmation("");
        if (household.needsPassword) {
          setName(household.name);
          setManualId(null);
        }
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || pending) return;
    if (creating && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    lock.current = true;
    const generation = ++request.current;
    setPending(true);
    setError("");
    try {
      let household: Household;
      if (upgrading && session) {
        upgradeKey.current ??= newHouseholdSecret();
        household = await setHouseholdPassword(
          session.household.secret,
          slug,
          password,
          upgradeKey.current,
        );
      } else if (creating) {
        const identity = `${name.trim()}\n${slug}`;
        if (creationKey.current?.identity !== identity)
          creationKey.current = { identity, key: newHouseholdSecret() };
        household = await createHousehold(
          { name, slug, password },
          creationKey.current.key,
        );
      } else {
        household = await loginHousehold(slug, password, newHouseholdSecret());
      }
      if (generation !== request.current) return;
      const next = sessionFor(household);
      setSession(next.session);
      setNotice(next.notice);
      setChoosing(false);
      setPassword("");
      setConfirmation("");
      setName("");
      setManualId(null);
      creationKey.current = null;
      upgradeKey.current = null;
    } catch (cause) {
      if (generation === request.current) setError(errorMessage(cause));
    } finally {
      lock.current = false;
      if (generation === request.current) setPending(false);
    }
  }
  async function signOut() {
    if (!session || lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      await logoutHousehold(session.household.secret);
      try {
        forgetHousehold();
      } catch {
        // The server has already revoked this token, even if browser storage is blocked.
      }
      setSession(null);
      setChoosing(true);
      setNotice("");
      setPassword("");
      setConfirmation("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function chooseHousehold() {
    upgradeKey.current = null;
    setChoosing(true);
    setMode("signin");
    setPassword("");
    setConfirmation("");
    setError("");
    setNotice("");
  }
  async function copyId() {
    if (!session?.household.slug) return;
    try {
      await navigator.clipboard.writeText(session.household.slug);
      setNotice(
        "Household ID copied. Share it and your household password with members.",
      );
    } catch {
      setNotice(
        `Household ID: ${session.household.slug}. Share it and your household password with members.`,
      );
    }
  }

  if (!initial.shared) return <App />;
  if (session && !choosing && !upgrading)
    return (
      <App
        key={session.household.id}
        repository={session.repository}
        householdControls={
          <div className="household-controls">
            <div className="household-toolbar">
              <div className="household-identity">
                <span className="household-name">{session.household.name}</span>
                <span className="household-id">{session.household.slug}</span>
              </div>
              <Button variant="outlined" onClick={() => void copyId()}>
                Copy household ID
              </Button>
              <Button onClick={chooseHousehold}>Switch household</Button>
              <Button disabled={pending} onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
            {notice && (
              <p className="household-hint" role="status">
                {notice}
              </p>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </div>
        }
      />
    );

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
        <h2 id="household-heading">
          {upgrading ? "Set up household sign-in" : "Your household’s quest"}
        </h2>
        <p className="household-intro">
          {upgrading
            ? `Give ${session?.household.name} an ID and password. Your existing groceries will stay in this household.`
            : mode === "create"
              ? "Create a shared list with a household ID and password."
              : "One list for your household. Sign in with its ID and shared password."}
        </p>
        {!upgrading && (
          <Tabs
            value={mode}
            onChange={(_, value: "signin" | "create") => {
              setMode(value);
              setError("");
              setPassword("");
              setConfirmation("");
            }}
            aria-label="Household access"
            variant="fullWidth"
          >
            <Tab
              value="signin"
              label="Sign in"
              id="household-signin-tab"
              aria-controls="household-auth-panel"
              disabled={pending}
            />
            <Tab
              value="create"
              label="Create household"
              id="household-create-tab"
              aria-controls="household-auth-panel"
              disabled={pending}
            />
          </Tabs>
        )}
        {error && (
          <Alert className="household-auth-error" severity="error" role="alert">
            {error}
          </Alert>
        )}
        {pending ? (
          <div className="household-opening">
            <p role="status">Opening your household…</p>
            <LinearProgress />
          </div>
        ) : (
          <form
            className="household-auth-form"
            id="household-auth-panel"
            role={upgrading ? undefined : "tabpanel"}
            aria-labelledby={
              upgrading ? "household-heading" : `household-${mode}-tab`
            }
            onSubmit={(event) => void submit(event)}
          >
            {creating && !upgrading && (
              <TextField
                label="Household name"
                placeholder="My Household"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                required
              />
            )}
            <TextField
              label="Household ID"
              placeholder="my-household"
              value={slug}
              onChange={(event) =>
                creating
                  ? setManualId(event.target.value.toLowerCase())
                  : setLoginId(event.target.value)
              }
              helperText={
                creating
                  ? "Suggested from the name. You can change it if the ID is taken."
                  : undefined
              }
              autoComplete="username"
              required
              slotProps={{
                htmlInput: { autoCapitalize: "none", spellCheck: false },
              }}
            />
            <TextField
              label={creating ? "Household password" : "Password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={creating ? "new-password" : "current-password"}
              required
              helperText={
                creating
                  ? "At least 8 characters. Share this password only with your household."
                  : undefined
              }
            />
            {creating && (
              <TextField
                label="Confirm password"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
              />
            )}
            <Button type="submit" variant="contained">
              {upgrading
                ? "Save household sign-in"
                : creating
                  ? "Create household"
                  : "Sign in"}
            </Button>
          </form>
        )}
        <p className="household-hint">
          No email or personal accounts needed. Everyone in the household uses
          the same ID and password.
        </p>
        {session && !pending && (
          <div className="household-toolbar">
            {!upgrading && (
              <Button
                onClick={() => {
                  const next = sessionFor(session.household);
                  setNotice(next.notice);
                  setChoosing(false);
                  setError("");
                  if (session.household.needsPassword) {
                    setName(session.household.name);
                    setManualId(null);
                  }
                }}
              >
                Return to {session.household.name}
              </Button>
            )}
            {upgrading ? (
              <Button onClick={chooseHousehold}>Use another household</Button>
            ) : (
              <Button onClick={() => void signOut()}>Sign out</Button>
            )}
          </div>
        )}
      </Paper>
    </AppLayout>
  );
}
