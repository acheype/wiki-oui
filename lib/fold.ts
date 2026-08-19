// The comparison key shared by everything that must match words the way a
// reader does: "ecole" finding « École », « Atelier » and « atelier »
// counting as one. On its own so that no caller depends on another feature's
// module just to compare two strings.

/** Case- and diacritics-insensitive comparison key. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
