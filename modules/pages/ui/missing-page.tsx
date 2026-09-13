import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// The two faces of an address with no page behind it, shared by the show page
// and the chrome-free <PageBody>: a wiki treats an absent page as an
// invitation to write it (PageNotYetCreated), so a link followed to nothing —
// including one opened in the modal — says why it shows nothing rather than
// failing dry.

export function PageNotYetCreated({ slug }: { slug: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <FilePlus2 className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">
          La page «&nbsp;{slug}&nbsp;» n&apos;existe pas encore
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vous pouvez la créer dès maintenant : elle sera enregistrée à sa
          première sauvegarde.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href={`/${slug}/edit`} />}>
        Créer cette page
      </Button>
    </div>
  );
}

// The same address, to someone the wiki does not let create pages: the offer
// to create it would be the one thing they cannot take up (docs/permissions.md
// § Ce que voit qui n'a pas le droit — an action nobody can take informs
// nobody), so what is left is the plain fact that there is nothing here.
export function PageNotFound({ slug }: { slug: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <FilePlus2 className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">
        La page «&nbsp;{slug}&nbsp;» n&apos;existe pas
      </h1>
    </div>
  );
}
