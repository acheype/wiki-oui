"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { IconMatch } from "@/lib/icons";
import { useDebouncedJson } from "./use-debounced-json";

const SEARCH_DEBOUNCE_MS = 200;

// Icon picker of the `icon` field type (docs/component-builder.md): grid +
// search over the embedded Iconify sets, queried server-side (/api/icons).
export function IconPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const data = useDebouncedJson<{ icons: IconMatch[] }>(
    open ? `/api/icons?query=${encodeURIComponent(query)}` : null,
    SEARCH_DEBOUNCE_MS
  );
  const icons = data?.icons ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          className="justify-start font-normal"
        >
          {value ? (
            <span className="font-mono text-xs">{value}</span>
          ) : (
            <span className="text-muted-foreground">Choisir une icône…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-80 gap-2 p-3" align="start">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher…"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Les noms et la recherche sont en anglais (settings, house, star…).
        </p>
        <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
          {(icons ?? []).map((icon) => (
            <button
              key={icon.id}
              type="button"
              title={icon.id}
              className={`flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 ${
                icon.id === value ? "bg-accent ring-1 ring-ring" : ""
              }`}
              onClick={() => {
                onChange(icon.id);
                setOpen(false);
              }}
              dangerouslySetInnerHTML={{ __html: icon.svg }}
            />
          ))}
          {icons?.length === 0 && (
            <p className="col-span-8 py-4 text-center text-sm text-muted-foreground">
              Aucune icône trouvée.
            </p>
          )}
        </div>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          >
            Retirer l&apos;icône
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
