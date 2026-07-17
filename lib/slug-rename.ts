import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { ComponentBuilderSpec } from "./component-descriptors";
import {
  type EntryData,
  type FormDescriptor,
  isOptionsField,
} from "./form-descriptor";

// The reference map of a slug rename (ADR 0016): every place an author-written
// slug lives — markdown link targets, JSX props typed `page-list` by their
// descriptor, form-sourced option values in entry data. Rewrites splice the
// source at AST-located offsets, never re-serialize: a rename must not reformat
// one character beyond the references themselves (the retcon touches history).

export interface SlugRename {
  oldSlug: string;
  newSlug: string;
}

/**
 * The props whose descriptor promises a page slug (`page-list`), per
 * component. wiki-link's spec lands here too but never matches a tag: its
 * builder emits a markdown link, not a `<WikiLink>` element.
 */
export function pageReferenceProps(
  builders: ComponentBuilderSpec[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const spec of builders) {
    const props = Object.entries(spec.descriptor.properties)
      .filter(([, property]) => property.type === "page-list")
      .map(([name]) => name);
    if (props.length > 0) map.set(spec.name, new Set(props));
  }
  return map;
}

/**
 * The source with every reference to `oldSlug` rewritten, or null when it
 * holds none (or cannot be parsed — a broken page is left alone, its author
 * already got the compile warning from the save-time lint).
 */
export function rewriteSlugReferences(
  source: string,
  rename: SlugRename,
  referenceProps: ReadonlyMap<string, ReadonlySet<string>>
): string | null {
  let tree: unknown;
  try {
    tree = unified().use(remarkParse).use(remarkMdx).parse(source);
  } catch {
    return null;
  }

  const edits: Edit[] = [];

  visit(tree as Parameters<typeof visit>[0], (rawNode) => {
    const node = rawNode as unknown as SourceNode;

    if (node.type === "link" || node.type === "definition") {
      const rewritten = rewriteHref(node.url ?? "", rename);
      if (rewritten === null) return;
      const edit = urlEdit(source, node, rewritten);
      if (edit) edits.push(edit);
      return;
    }

    if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") {
      return;
    }
    const props = node.name ? referenceProps.get(node.name) : undefined;
    if (!props) return;
    for (const attribute of node.attributes ?? []) {
      if (attribute.type !== "mdxJsxAttribute") continue;
      if (!attribute.name || !props.has(attribute.name)) continue;
      if (typeof attribute.value !== "string") continue;
      const rewritten = rewriteHref(attribute.value, rename);
      if (rewritten === null) continue;
      const edit = attributeEdit(source, attribute, rewritten);
      if (edit) edits.push(edit);
    }
  });

  if (edits.length === 0) return null;
  return applyEdits(source, edits);
}

/**
 * Entry data with every form-sourced option value equal to `oldSlug`
 * rewritten, or null when nothing matches. Exact matches only: stored values
 * are bare target-entry slugs (docs/forms.md), never handler or anchor forms.
 */
export function rewriteEntryDataSlugs(
  descriptor: FormDescriptor,
  data: EntryData,
  { oldSlug, newSlug }: SlugRename
): EntryData | null {
  let changed = false;
  const rewritten: EntryData = { ...data };
  for (const field of descriptor.fields) {
    if (!isOptionsField(field) || !field.sourceFormId) continue;
    const value = data[field.name];
    if (value === oldSlug) {
      rewritten[field.name] = newSlug;
      changed = true;
    } else if (Array.isArray(value) && value.includes(oldSlug)) {
      rewritten[field.name] = value.map((item) =>
        item === oldSlug ? newSlug : item
      );
      changed = true;
    }
  }
  return changed ? rewritten : null;
}

// A wiki href aimed at the renamed page, with its slug segment swapped —
// handler and anchor preserved (`old/edit#a` → `new/edit#a`). Null when the
// href points elsewhere; external URLs never start with a bare slug, so the
// prefix test rules them out for free.
function rewriteHref(
  href: string,
  { oldSlug, newSlug }: SlugRename
): string | null {
  if (href === oldSlug) return newSlug;
  if (!href.startsWith(oldSlug)) return null;
  const boundary = href.charAt(oldSlug.length);
  if (boundary !== "/" && boundary !== "#") return null;
  return newSlug + href.slice(oldSlug.length);
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

// Minimal shape of the mdast / mdast-util-mdx-jsx nodes walked here.
interface SourceNode {
  type: string;
  url?: string;
  name?: string | null;
  position?: Position;
  attributes?: JsxAttribute[];
}

interface JsxAttribute {
  type: string;
  name?: string | null;
  value?: unknown;
  position?: Position;
}

interface Position {
  start: { offset?: number };
  end: { offset?: number };
}

function offsets(position: Position | undefined): [number, number] | null {
  const start = position?.start.offset;
  const end = position?.end.offset;
  return start === undefined || end === undefined ? null : [start, end];
}

// Locates the url inside the node's own source slice so only those characters
// move: `[old](old)` keeps its text, whitespace and title untouched. The url
// follows "](" in an inline link and "]:" in a definition; a link text may
// itself contain "](", a url cannot — hence lastIndexOf for links. Anything
// this cannot locate byte-for-byte is skipped rather than guessed at.
function urlEdit(
  source: string,
  node: SourceNode,
  replacement: string
): Edit | null {
  const span = offsets(node.position);
  if (!span || node.url === undefined) return null;
  const [start, end] = span;
  const slice = source.slice(start, end);
  const marker = node.type === "link" ? "](" : "]:";
  const open =
    node.type === "link" ? slice.lastIndexOf(marker) : slice.indexOf(marker);
  if (open === -1) return null;
  let cursor = open + marker.length;
  while (cursor < slice.length && /\s/.test(slice[cursor])) cursor++;
  if (slice[cursor] === "<") cursor++;
  if (!slice.startsWith(node.url, cursor)) return null;
  return {
    start: start + cursor,
    end: start + cursor + node.url.length,
    text: replacement,
  };
}

// Same byte-for-byte care for a JSX attribute: the value sits right after the
// opening quote of `link="old-slug"`.
function attributeEdit(
  source: string,
  attribute: JsxAttribute,
  replacement: string
): Edit | null {
  const span = offsets(attribute.position);
  if (!span || typeof attribute.value !== "string") return null;
  const [start, end] = span;
  const slice = source.slice(start, end);
  const opening = slice.search(/["']/);
  if (opening === -1) return null;
  const valueStart = opening + 1;
  if (!slice.startsWith(attribute.value, valueStart)) return null;
  return {
    start: start + valueStart,
    end: start + valueStart + attribute.value.length,
    text: replacement,
  };
}

function applyEdits(source: string, edits: Edit[]): string {
  let result = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
