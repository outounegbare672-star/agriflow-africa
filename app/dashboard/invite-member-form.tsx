"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createInvitation } from "./invitation-actions";

export function InviteMemberForm({ cooperativeId }: { cooperativeId: string }) {
  const [inviteURL, setInviteURL] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [copyStatus, setCopyStatus] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInviteURL("");
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createInvitation(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) {
        setInviteURL(result.url);
        setCopyStatus("");
      }
    });
  }

  return (
    <div>
      <form className="dashboard-form compact-form" onSubmit={submit}>
        <input name="cooperativeId" type="hidden" value={cooperativeId} />
        <label>E-mail du membre<input autoComplete="email" name="email" type="email" required /></label>
        <label>Rôle dans la coopérative
          <select name="role" defaultValue="PRODUCER">
            <option value="MANAGER">Gestionnaire</option>
            <option value="AGENT">Agent</option>
            <option value="PRODUCER">Producteur</option>
          </select>
        </label>
        <button className="button button-primary" disabled={isPending} type="submit">
          {isPending ? "Création du lien…" : "Créer un lien d’invitation"}
        </button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {inviteURL && (
        <div className="invite-link-result" role="status">
          <p>Copiez et transmettez ce lien à la personne invitée. Il expire dans 7 jours.</p>
          <a href={inviteURL}>{inviteURL}</a>
          <button
            className="record-action"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteURL);
                setCopyStatus("Lien copié.");
              } catch {
                setCopyStatus("Copie impossible dans ce navigateur. Sélectionnez le lien ci-dessus.");
              }
            }}
            type="button"
          >
            Copier le lien
          </button>
          {copyStatus && <small>{copyStatus}</small>}
        </div>
      )}
    </div>
  );
}
