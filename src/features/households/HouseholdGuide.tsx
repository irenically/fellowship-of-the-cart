import { ChevronDown, CircleHelp, HousePlus, Link, Users } from "lucide-react";

export function HouseholdGuide() {
  return (
    <details className="household-guide">
      <summary>
        <CircleHelp size={18} strokeWidth={1.6} aria-hidden="true" />
        <span>How to create and share a household</span>
        <ChevronDown
          className="household-guide-chevron"
          size={18}
          aria-hidden="true"
        />
      </summary>
      <ol className="household-guide-steps">
        <li>
          <HousePlus size={22} strokeWidth={1.6} aria-hidden="true" />
          <div>
            <h3>Create your household</h3>
            <p>
              Choose <strong>Create household</strong>, enter a name, and keep
              or edit the suggested ID. For example, “My Household” becomes{" "}
              <strong>my-household</strong>. Pick a shared password, confirm it,
              and press <strong>Create household</strong>.
            </p>
          </div>
        </li>
        <li>
          <Link size={22} strokeWidth={1.6} aria-hidden="true" />
          <div>
            <h3>Send an invite</h3>
            <p>
              Inside your household, press <strong>Invite members</strong>. The
              app creates and copies a link. Paste it into a message to your
              household. Use <strong>Copy invite link</strong> if you need to
              copy it again.
            </p>
          </div>
        </li>
        <li>
          <Users size={22} strokeWidth={1.6} aria-hidden="true" />
          <div>
            <h3>They join the same list</h3>
            <p>
              Your invite opens the <strong>Sign in</strong> form with the
              household ID and password field already filled in. They press{" "}
              <strong>Sign in</strong> and see your household’s name and
              existing groceries. They don’t create another household or need a
              personal account.
            </p>
            <p>
              Everyone can add, edit, gather, and delete items. Changes appear
              on other members’ devices within a few seconds while the app is
              open.
            </p>
          </div>
        </li>
      </ol>
      <p className="household-guide-note">
        Already have the ID and shared password? Enter them on the Sign in tab
        instead. Invite links don’t expire; share yours only with people you
        want to edit the list.
      </p>
    </details>
  );
}
