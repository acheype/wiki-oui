"use client";

// The two fields that make an identity, wherever an account is born
// (docs/permissions.md § Identité): a free display name, and the identifier
// derived from it — personalisable here, frozen afterwards, since it is what
// the rights, the ownership and the history point at (ADR 0024).
//
// Shared by the invitation screen and the free sign-up one, so that the two
// ways in produce accounts nothing tells apart afterwards.

import { useId, useState } from "react";
import { SlugInlineEdit } from "@/components/slug/slug-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveUsername } from "@/lib/username";

export function useIdentityFields() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [customUsername, setCustomUsername] = useState(false);

  function changeName(value: string) {
    setName(value);
    if (!customUsername) setUsername(deriveUsername(value));
  }

  function changeUsername(value: string) {
    setCustomUsername(true);
    setUsername(value);
  }

  /** An identifier emptied by hand goes back to following the name. */
  function restoreDerived() {
    if (username !== "") return;
    setCustomUsername(false);
    setUsername(deriveUsername(name));
  }

  return {
    name,
    username,
    changeName,
    changeUsername,
    restoreDerived,
  };
}

export function IdentityFields({
  fields,
  disabled,
}: {
  fields: ReturnType<typeof useIdentityFields>;
  disabled?: boolean;
}) {
  const nameId = useId();
  const usernameId = useId();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId} className="gap-1">
          Nom affiché
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <Input
          id={nameId}
          value={fields.name}
          autoComplete="name"
          placeholder="Marie Durand"
          required
          autoFocus
          disabled={disabled}
          onChange={(event) => fields.changeName(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Ce que le wiki affichera à côté de vos contributions. Un pseudonyme
          fait l&apos;affaire.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={usernameId}>Identifiant</Label>
        <SlugInlineEdit
          id={usernameId}
          value={fields.username}
          className="h-8 w-64"
          editLabel="Personnaliser l'identifiant"
          onValueChange={fields.changeUsername}
          onBlur={fields.restoreDerived}
        />
        <p className="text-xs text-muted-foreground">
          Généré à partir du nom ou personnalisable, puis figé : il vous permet
          aussi de vous connecter.
        </p>
      </div>
    </>
  );
}
