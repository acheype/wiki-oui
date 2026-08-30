// Entry template rendering (docs/forms.md, ADR 0014): substitutes {champ}
// references with entry values *before* MDX compilation, escaping each value
// to plain text so someone filling an entry can neither inject components nor
// break the layout. Two exceptions, both decided by the form admin: a
// customContent field (handled elsewhere) and a textarea with allowMdx.

import {
  type EntryData,
  type FormDescriptor,
  fieldReferencePattern,
  valueToText,
} from "../form-descriptor";

// Escapes MDX-significant characters in author-supplied text. Component and
// expression openers become HTML entities (they render as literal `<`/`{`);
// markdown structural punctuation is backslash-escaped.
export function escapeMdxText(text: string): string {
  // Backslash-escape markdown punctuation first (emphasis, code, headings,
  // links), then turn the component/expression openers into entities — done
  // in this order so the entities' own `#` is not re-escaped.
  return text
    .replace(/[\\`*_#[\]]/g, (char) => `\\${char}`)
    .replace(/</g, "&lt;")
    .replace(/\{/g, "&#123;");
}

// Fills a template's {champ} references from an entry's values. Each value is
// escaped to plain text, except an allowMdx textarea whose admin opted into
// MDX. An absent value renders empty; an unknown reference (which the form
// save refuses) is left untouched.
export function renderTemplateSource(
  template: string,
  descriptor: FormDescriptor,
  data: EntryData
): string {
  const byName = new Map(descriptor.fields.map((field) => [field.name, field]));
  return template.replace(fieldReferencePattern(), (whole, name: string) => {
    const field = byName.get(name);
    if (!field) return whole;
    const value = data[name];
    const text = valueToText(value);
    const rawMdx = field.type === "textarea" && field.allowMdx === true;
    return rawMdx ? text : escapeMdxText(text);
  });
}
