"use client";

import { useId, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The plumbing the installation and sign-in screens share: read the fields,
 * hand them to a Server Action, and show what it refused. Both actions
 * redirect on success and never return, so the only thing that ever comes
 * back is an error.
 */
export function useAuthForm(
  action: (fields: FormData) => Promise<{ error: string } | void>
) {
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const result = await action(fields);
      if (result?.error) setError(result.error);
    });
  }

  return { submit, error, isPending };
}

/**
 * The password field of every screen where one is chosen — invitation, reset
 * and free sign-up. Uncontrolled, like the rest of what these forms read: the
 * value is the browser's until it is submitted, which is also what lets a
 * password manager fill it.
 */
export function NewPasswordField({
  minLength,
  disabled,
}: {
  minLength: number;
  disabled?: boolean;
}) {
  const passwordId = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={passwordId} className="gap-1">
        Mot de passe
        <span aria-hidden className="text-destructive">
          *
        </span>
      </Label>
      <Input
        id={passwordId}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={minLength}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        Au moins {minLength} caractères.
      </p>
    </div>
  );
}

/** What an action refused, in the one place both screens show it. */
export function AuthFormError({ error }: { error: string | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
