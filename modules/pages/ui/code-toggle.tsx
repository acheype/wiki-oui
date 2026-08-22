"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// The rendered ↔ source switch of the Aperçu view (ADR 0009), carried in the
// URL so the whole revisions view stays server-rendered.
export function CodeToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showCode = searchParams.get("code") === "1";

  return (
    <Label className="flex w-fit items-center gap-2 text-sm font-normal text-muted-foreground">
      <Checkbox
        checked={showCode}
        onCheckedChange={(checked) => {
          const next = new URLSearchParams(searchParams);
          if (checked === true) {
            next.set("code", "1");
          } else {
            next.delete("code");
          }
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      />
      Afficher le code source
    </Label>
  );
}
