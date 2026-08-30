import type { SignInLockout } from "@/modules/pages/ui/labels";
import { AlertDialogDescription } from "@/components/ui/alert-dialog";

// What the two confirmations say when a change would close a page people enter
// the wiki through (issue #20). One component, because both places pose the
// same right and must word it the same way.
//
// The consequence is the sentence in bold: everything else is context, and a
// reader who reads one line has to read that one.

export function SignInLockoutDescription({
  lockout,
}: {
  lockout: SignInLockout;
}) {
  return (
    <AlertDialogDescription asChild>
      <div className="grid gap-3">
        <p>
          {lockout.purpose}{" "}
          {/* « administrateurs compris » only where it is true: closing a
              recovery page leaves an administrator exactly as able to sign in
              as anyone else who still knows their password. Inside the bold,
              because it is the half that surprises. */}
          <strong className="font-medium text-foreground">
            {lockout.consequence}
            {lockout.locksEveryoneOut ? ", administrateurs compris." : "."}
          </strong>
        </p>
        {lockout.locksEveryoneOut && (
          <p>
            Si toutes les sessions existantes expirent,{" "}
            <strong className="font-medium text-foreground">
              seule la base de données permettra alors de se reconnecter au wiki.
            </strong>
          </p>
        )}
      </div>
    </AlertDialogDescription>
  );
}
