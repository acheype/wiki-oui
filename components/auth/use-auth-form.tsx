"use client";

import { useState, useTransition } from "react";

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

/** What an action refused, in the one place both screens show it. */
export function AuthFormError({ error }: { error: string | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
