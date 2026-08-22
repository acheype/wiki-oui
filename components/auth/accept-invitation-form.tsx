"use client";

// The far end of an invitation (docs/permissions.md § Naissance d'un compte).
// Whoever holds the link names themselves and chooses a password — the
// address is the invitation's, not theirs to change, and no administrator
// ever saw the password. The screen is the same whether the link arrived by
// mail or was pasted into a chat by hand.

import { UserRoundPlus } from "lucide-react";
import { acceptInvitationLink } from "@/app/auth-actions";
import {
  IdentityFields,
  useIdentityFields,
} from "@/components/auth/identity-fields";
import {
  AuthFormError,
  NewPasswordField,
  useAuthForm,
} from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/installation";

export function AcceptInvitationForm({
  token,
  email,
  groupName,
}: {
  token: string;
  email: string;
  /** The group the invitation adds to, announced rather than discovered. */
  groupName?: string;
}) {
  const identity = useIdentityFields();
  const { submit, error, isPending } = useAuthForm((fields) =>
    acceptInvitationLink({
      token,
      name: identity.name,
      username: identity.username,
      password: String(fields.get("password") ?? ""),
    })
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <UserRoundPlus className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Créer votre compte
        </h1>
        <p className="text-sm text-muted-foreground">
          Invitation pour {email}
          {groupName && <> — vous rejoindrez @{groupName}.</>}
        </p>
      </div>

      <IdentityFields fields={identity} disabled={isPending} />
      <NewPasswordField
        minLength={MIN_PASSWORD_LENGTH}
        disabled={isPending}
      />

      <AuthFormError error={error} />

      <Button
        type="submit"
        disabled={isPending || identity.name.trim() === ""}
      >
        {isPending ? "Création…" : "Créer mon compte"}
      </Button>
    </form>
  );
}
