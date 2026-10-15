import { useEffect, useRef, useState, type FocusEvent } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import { createHouseholdInvite, type Household } from "../../lib/household";

export function HouseholdInvite({
  household,
  close,
}: {
  household: Household;
  close: () => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<string> | null>(null);
  useEffect(() => {
    let active = true;
    request.current ??= createHouseholdInvite(household);
    request.current.then(
      async (invite) => {
        if (!active) return;
        setLink(invite);
        try {
          await navigator.clipboard.writeText(invite);
          if (active) setNotice("Invite link copied.");
        } catch {
          if (active) setNotice("Select and copy the invite link below.");
        } finally {
          if (active) setBusy(false);
        }
      },
      (cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not create the invite. Please try again.",
        );
        setBusy(false);
      },
    );
    return () => {
      active = false;
    };
  }, [household, attempt]);
  async function copy(value: string, copied: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(copied);
    } catch {
      setNotice(
        value === household.slug
          ? `Household ID: ${household.slug}`
          : "Select and copy the invite link below.",
      );
    }
  }
  return (
    <section
      id="household-invite-panel"
      className="household-invite"
      aria-labelledby="household-invite-heading"
      aria-busy={busy}
    >
      <h3 id="household-invite-heading">Invite your household</h3>
      <p className="household-hint">
        Open the link to fill in the sign-in form. Anyone with it can join.
      </p>
      {busy && <LinearProgress aria-label="Creating invite" />}
      {error && <Alert severity="error">{error}</Alert>}
      {link && (
        <TextField
          label="Private invite link"
          value={link}
          slotProps={{
            htmlInput: {
              readOnly: true,
              onFocus: (event: FocusEvent<HTMLInputElement>) =>
                event.currentTarget.select(),
            },
          }}
        />
      )}
      <div className="household-toolbar">
        {link && (
          <Button
            variant="outlined"
            onClick={() => void copy(link, "Invite link copied.")}
          >
            Copy invite link
          </Button>
        )}
        {error && (
          <Button
            variant="outlined"
            onClick={() => {
              request.current = null;
              setError("");
              setBusy(true);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        )}
        <Button
          onClick={() =>
            void copy(household.slug ?? "", "Household ID copied.")
          }
        >
          Copy household ID
        </Button>
        <Button onClick={close}>Close invite</Button>
      </div>
      {notice && (
        <p className="household-hint" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
