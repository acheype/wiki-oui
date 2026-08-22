"use client";

import { type RefObject, useEffect } from "react";

// La frappe directe (docs/forms.md): typing anywhere fills the filter without
// clicking it first. Shared by the three system pages that head a list with one —
// les formulaires, les comptes et les pages — since the rule for when the
// keyboard belongs to the filter and when it does not is one rule.
export function useDirectKeyboard(
  field: RefObject<HTMLInputElement | null>
): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // A space is how a focused control is activated — a checkbox of the list
      // it heads above all — so it never means « commence à filtrer ».
      if (event.key.length !== 1 || event.key === " ") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) {
        return;
      }
      field.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [field]);
}
