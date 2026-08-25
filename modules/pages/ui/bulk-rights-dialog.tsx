"use client";

// The action by lot on the rights (docs/permissions.md § gerer-pages): two
// intentions in one modal, each keeping its description whether it is selected
// or not — what the other one would do is exactly what one needs to read
// before choosing. « Donner accès » is preselected: of the two, it is the one
// that destroys nothing.
//
// The count carries the explanation, and it is what makes the action
// understandable: on a page already open to everyone, the named group has
// access and there is nothing to add — said, rather than promised as a change.

import { UsersRound } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  describeGrantTarget,
  giveAccess,
  replaceRights,
} from "@/modules/pages/admin-actions";
import { AclInput, NO_FLOOR, PrincipalBox } from "@/modules/permissions/acl-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InfoNote } from "@/components/ui/info-note";
import { signInLockout } from "@/modules/pages/ui/labels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  type BulkIntent,
  type GrantTarget,
  type RightsReplacement,
  BULK_INTENTS,
  grantAddsNothing,
  grantNote,
  grantTally,
  lotSelected,
  lotSubject,
  nothingToReplace,
  replacementNote,
} from "@/modules/permissions/bulk";
import { type MemberRef, refGroupSlug, refUsername } from "@/modules/permissions/groups";
import type { ManagedPage } from "@/modules/pages/rights";
import {
  type AccessRule,
  type AclDirectory,
  type PermKind,
  type PrincipalList,
  PERM_KINDS,
} from "@/modules/permissions/rules";

const NOBODY: PrincipalList = { usernames: [], groupSlugs: [] };
const EMPTY_GRANT: Record<PermKind, PrincipalList> = {
  READ: NOBODY,
  WRITE: NOBODY,
};

/** The rule a sense falls back on the moment it stops being « Ne pas changer ». */
const FIRST_RULE: AccessRule = { scope: "restricted" };

// Under « Donner accès » the field says what it does — an access added to
// pages — rather than what the wiki would end up holding: the count below it
// then reads as the continuation of the same sentence.
const SENSE_LABELS: Record<PermKind, { grant: string; replace: string }> = {
  READ: {
    grant: "Ajouter l'accès en lecture",
    replace: "Qui peut voir ces pages ?",
  },
  WRITE: {
    grant: "Ajouter l'accès en écriture",
    replace: "Qui peut les modifier ?",
  },
};

export function BulkRightsDialog({
  pages,
  directory,
  onApplied,
}: {
  pages: ManagedPage[];
  directory: AclDirectory;
  /** Called once the lot has been written: the list is stale from here. */
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<BulkIntent>(BULK_INTENTS[0].value);
  const [grant, setGrant] = useState(EMPTY_GRANT);
  const [replacement, setReplacement] = useState<RightsReplacement>({});
  const [applying, startApplying] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const targets = useGrantTargets(grant);

  const subject = lotSubject(pages.length);
  // Out of reach until the action would write something: naming only people
  // the lot already lets in is a click that would report a success over pages
  // it never touched. The button reads what the notes above it announce.
  // « Remplacer les accès » is the only intent that can close a read:
  // « Donner accès » only ever adds. Read live, so the note appears as the
  // scope is chosen rather than after the lot is written.
  const lockout =
    intent === "replace"
      ? signInLockout(pages.map((page) => page.slug), replacement.READ)
      : null;
  // What the lot would still change if the account pages were left out of it.
  // Empty when the lot holds nothing else — and then sparing them is doing
  // nothing, so the dialog does not offer it.
  const sparedSlugs = lockout
    ? pages.map((page) => page.slug).filter((slug) => !lockout.slugs.includes(slug))
    : [];
  const nothingChosen =
    intent === "grant"
      ? grantAddsNothing(pages, namedTargets(grant, targets))
      : nothingToReplace(replacement);

  function reset(next: boolean) {
    setOpen(next);
    if (next) return;
    setIntent(BULK_INTENTS[0].value);
    setGrant(EMPTY_GRANT);
    setReplacement({});
  }

  function apply(slugs: string[]) {
    startApplying(async () => {
      setConfirming(false);
      // One call for the two senses: they are one action, and the guard
      // refuses the lot whole rather than leaving half of it written.
      const refused =
        intent === "grant"
          ? await giveAccess(slugs, {
              READ: refsOf(grant.READ),
              WRITE: refsOf(grant.WRITE),
            })
          : await replaceRights(slugs, replacement);
      if (refused) {
        toast.error(refused.error);
        return;
      }
      reset(false);
      toast.success(
        intent === "grant"
          ? `L'accès a été ajouté sur ${subject}.`
          : `Les droits de ${subject} ont été remplacés.`
      );
      onApplied();
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        {/* Named and dressed like the « Accès » of the action bar: it is the
            same action, taken on dozens of pages instead of one, and a
            reader who learnt it on a page must recognise it here. */}
        <Button type="button" variant="outline" size="sm">
          <UsersRound />
          Modifier les accès…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier les accès</DialogTitle>
          {/* The lot is in the description rather than in the title: what is
              about to be touched is the one thing to read twice, and it is
              worth a count in the sentence rather than a noun in a heading. */}
          <DialogDescription>
            Les modifications s&apos;appliqueront {lotSelected(pages.length)}.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={intent}
          onValueChange={(value) => setIntent(value as BulkIntent)}
          className="grid gap-3"
        >
          {BULK_INTENTS.map((choice) => (
            <div key={choice.value} className="flex items-start gap-2">
              <RadioGroupItem
                value={choice.value}
                id={`intent-${choice.value}`}
                className="mt-1"
              />
              <div className="grid gap-0.5">
                <Label htmlFor={`intent-${choice.value}`} className="font-medium">
                  {choice.label}
                </Label>
                {/* Kept visible unselected: choosing between the two is
                    choosing between what they do. */}
                <p className="text-xs text-muted-foreground">
                  {choice.description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>

        <div className="grid gap-5 border-t pt-4">
          {PERM_KINDS.map((kind) =>
            intent === "grant" ? (
              <div key={kind} className="grid gap-2">
                <Label>{SENSE_LABELS[kind].grant}</Label>
                <PrincipalBox
                  value={grant[kind]}
                  directory={directory}
                  onChange={(value) =>
                    setGrant((current) => ({ ...current, [kind]: value }))
                  }
                />
                {refsOf(grant[kind]).map((ref) => {
                  const target = targets[keyOf(ref)];
                  if (!target) return null;
                  const note = grantNote(
                    grantTally(pages, kind, target),
                    kind,
                    target
                  );
                  return (
                    <InfoNote key={keyOf(ref)}>
                      {note.headline}
                      <NoteLines lines={note.lines} />
                    </InfoNote>
                  );
                })}
              </div>
            ) : (
              <div key={kind} className="grid gap-2">
                <Label>{SENSE_LABELS[kind].replace}</Label>
                <AclInput
                  id={`bulk-${kind.toLowerCase()}`}
                  value={replacement[kind] ?? FIRST_RULE}
                  directory={directory}
                  // The lot poses one right for pages whose owners differ, so
                  // no owner can be shown locked; what the note says of the
                  // administrators holds for every page of it all the same.
                  floor={NO_FLOOR}
                  unposed={{
                    label: "Ne pas changer",
                    selected: replacement[kind] === undefined,
                    onSelect: () => setReplacement((current) => ({ ...current, [kind]: undefined })),
                  }}
                  onChange={(rule) =>
                    setReplacement((current) => ({ ...current, [kind]: rule }))
                  }
                />
              </div>
            )
          )}
        </div>

        {intent === "replace" && <ReplacementNote pages={pages.length} replacement={replacement} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)}>
            Annuler
          </Button>
          <Button
            onClick={() =>
              lockout ? setConfirming(true) : apply(pages.map((page) => page.slug))
            }
            disabled={nothingChosen || applying}
          >
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Three answers rather than two, because the middle one is what most
          people came to do: a lot of dozens of pages caught a sign-in page it
          was never about, and hunting it down in the list to deselect it is a
          worse click than this one. Offered only when the lot holds something
          else — sparing them out of a lot of nothing but them is doing
          nothing, which « Annuler » already says. */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lockout && lockout.slugs.length > 1
                ? "Ces pages servent à entrer dans le wiki"
                : "Cette page sert à entrer dans le wiki"}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {lockout?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            {sparedSlugs.length > 0 && (
              <AlertDialogAction
                onClick={() => apply(sparedSlugs)}
                disabled={applying}
              >
                Appliquer sans{" "}
                {lockout && lockout.slugs.length > 1
                  ? `ces ${lockout.slugs.length} pages`
                  : "cette page"}
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => apply(pages.map((page) => page.slug))}
              disabled={applying}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Appliquer à toutes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/**
 * What « Remplacer » is about to cost, sense by sense — including the sense it
 * leaves alone, which is the half nobody would otherwise be sure of.
 */
function ReplacementNote({
  pages,
  replacement,
}: {
  pages: number;
  replacement: RightsReplacement;
}) {
  const note = replacementNote(pages, replacement);
  return (
    <InfoNote>
      {note.headline}
      <NoteLines lines={note.lines} />
    </InfoNote>
  );
}

/**
 * The breakdown under a note's sentence. Spans rather than a list: InfoNote is
 * a paragraph, and a <ul> inside one is invalid HTML the browser undoes as it
 * parses — which is a hydration error, not a matter of taste.
 */
function NoteLines({ lines }: { lines: string[] }) {
  return (
    <span className="mt-1 grid gap-0.5">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}

/**
 * Who each sense names, as the counts read them. A principal still being
 * resolved is absent, so the button waits for it rather than promising an
 * addition nobody has worked out yet.
 */
function namedTargets(
  grant: Record<PermKind, PrincipalList>,
  targets: Record<string, GrantTarget>
): Record<PermKind, GrantTarget[]> {
  return {
    READ: refsOf(grant.READ).flatMap((ref) => targets[keyOf(ref)] ?? []),
    WRITE: refsOf(grant.WRITE).flatMap((ref) => targets[keyOf(ref)] ?? []),
  };
}

/** A named principal, as the picker hands it over and the count reads it. */
function refsOf(list: PrincipalList): MemberRef[] {
  return [
    ...list.usernames.map((username) => ({ username })),
    ...list.groupSlugs.map((groupSlug) => ({ groupSlug })),
  ];
}

/** One key per named principal, kept apart so a person and a group may share a name. */
function keyOf(ref: MemberRef): string {
  const username = refUsername(ref);
  return username === null ? `#${refGroupSlug(ref)}` : `@${username}`;
}

/**
 * The targets the notes count with, resolved as they are named: which groups
 * reach a person, and which hold a group, is what « y donne déjà accès »
 * rests on — and the browser knows nothing of the nesting. Once resolved a
 * target is kept, so ticking pages recounts without asking again.
 */
function useGrantTargets(
  grant: Record<PermKind, PrincipalList>
): Record<string, GrantTarget> {
  const [targets, setTargets] = useState<Record<string, GrantTarget>>({});

  useEffect(() => {
    const named = [...refsOf(grant.READ), ...refsOf(grant.WRITE)];
    for (const ref of named) {
      if (keyOf(ref) in targets) continue;
      describeGrantTarget(ref).then((target) => {
        if (!target) return;
        setTargets((current) => ({ ...current, [keyOf(ref)]: target }));
      });
    }
  }, [grant, targets]);

  return targets;
}
