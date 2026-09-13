// Wrapper round-trip (ADR 0031): a wrapper whose child list the builder
// manages (<Tabs> with its <Tab> children) is generated as an open tag, one
// child tag per entry, and a close tag — and read back the same way, keeping
// each child's MDX content verbatim. Pure text logic, unit-tested; the leaf
// tag round-trip (self-closing, one line) stays in descriptor.ts.
//
// The engine is slug-agnostic: it carries the child list and the reserved
// `default` attribute (the open child) as-is, leaving slug derivation,
// collision and default-omission to the wrapper builder that knows the domain.

import {
  type ComponentDescriptor,
  type ParsedTag,
  type PropDefaults,
  type PropValues,
  childDescriptor,
  descriptorDefaults,
  parseOpenTag,
  tagAttributes,
  tagToBuilderState,
} from "../descriptor";

/** The reserved wrapper attribute naming the open child (its slug). */
export const OPEN_CHILD_ATTR = "default";

/** One managed child: its props (as builder values) and its verbatim MDX. */
export interface WrapperChildDraft {
  values: PropValues;
  /** Raw MDX between the child tags, preserved through the round-trip. */
  content: string;
  /** Attributes the child descriptor does not describe, carried verbatim. */
  unknownAttributes: string[];
}

// The child-list part of a wrapper draft, carried on its own from the parser
// (cursor-tools) through the editor state (component-builder) to page-editor —
// a named type so the pair never travels inline as a data clump.
export interface WrapperEdit {
  children: WrapperChildDraft[];
  /** The `default` attribute value (open child), verbatim; absent when omitted. */
  defaultChild?: string;
}

/** A wrapper's editable state: its own props, and its managed children. */
export interface WrapperDraft extends WrapperEdit {
  /** Wrapper props as builder values — the reserved `default` excluded. */
  values: PropValues;
  /** Wrapper attributes the descriptor does not describe, carried verbatim. */
  unknownAttributes: string[];
}

/** Everything the engine needs about a wrapper and its child component. */
export interface WrapperShape {
  name: string;
  descriptor: ComponentDescriptor;
  defaults: PropDefaults;
  childName: string;
  childDescriptor: ComponentDescriptor;
  childDefaults: PropDefaults;
}

// The engine's view of a wrapper spec: its own descriptor and its child's,
// derived from the `children:` section (ADR 0031). Structural param so the
// pure engine stays free of the server-side ComponentBuilderSpec.
export function wrapperShapeOf(spec: {
  name: string;
  descriptor: ComponentDescriptor;
  defaults: PropDefaults;
}): WrapperShape {
  const children = spec.descriptor.children;
  if (!children) {
    throw new Error(`<${spec.name}> has no children: section`);
  }
  const child = childDescriptor(children);
  return {
    name: spec.name,
    descriptor: spec.descriptor,
    defaults: spec.defaults,
    childName: children.component,
    childDescriptor: child,
    childDefaults: descriptorDefaults(child),
  };
}

// A child's content is stored without the newline that follows the open tag
// nor the newline-and-indent that precedes the close tag — the exact wrapping
// generateWrapper adds — so parse(generate(x)) returns x unchanged.
function stripWrap(inner: string): string {
  return inner.replace(/^[ \t]*\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
}

// Generates `<Name …>` + one indented child block per entry + `</Name>`. The
// child content sits between blank-free wrapping newlines so the round-trip is
// idempotent; only structure and props are (re)written, never the content.
export function generateWrapper(shape: WrapperShape, draft: WrapperDraft): string {
  const attributes = tagAttributes(shape.descriptor, shape.defaults, draft.values);
  if (draft.defaultChild !== undefined) {
    attributes.push(`${OPEN_CHILD_ATTR}="${draft.defaultChild}"`);
  }
  attributes.push(...draft.unknownAttributes);
  const body = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  const open = `<${shape.name}${body}>`;

  const blocks = draft.children.map((child) => {
    const childAttrs = tagAttributes(
      shape.childDescriptor,
      shape.childDefaults,
      child.values,
      child.unknownAttributes
    );
    const childBody = childAttrs.length > 0 ? ` ${childAttrs.join(" ")}` : "";
    return `  <${shape.childName}${childBody}>\n${child.content}\n  </${shape.childName}>`;
  });

  return [open, ...blocks, `</${shape.name}>`].join("\n");
}

/** A wrapper occurrence located in a document, ready to re-edit. */
export interface WrapperMatch {
  from: number;
  to: number;
  draft: WrapperDraft;
}

// Finds the innermost `<Name>…</Name>` of one of the given shapes enclosing
// `offset`, and reads it back into a WrapperDraft. Null when the cursor is in
// no such wrapper, or the tag is malformed (same no-pencil rule as the leaf
// parser: a span is only returned when every character was understood).
export function findWrapperAtCursor(
  shapes: WrapperShape[],
  text: string,
  offset: number
): (WrapperMatch & { shape: WrapperShape }) | null {
  let best: (WrapperMatch & { shape: WrapperShape; from: number }) | null = null;
  for (const shape of shapes) {
    const found = findEnclosing(shape.name, text, offset);
    if (!found) continue;
    if (!best || found.from > best.from) {
      best = { shape, ...found, draft: readWrapper(shape, text, found) };
    }
  }
  return best;
}

interface EnclosingTag {
  from: number;
  to: number;
  open: ParsedTag;
  contentStart: number;
  closeStart: number;
}

// Nearest `<name …>` starting at or before `offset` whose matching close ends
// at or after it — the innermost enclosing one, scanning from the cursor back.
function findEnclosing(
  name: string,
  text: string,
  offset: number
): EnclosingTag | null {
  const needle = `<${name}`;
  for (
    let idx = text.lastIndexOf(needle, offset);
    idx !== -1;
    idx = text.lastIndexOf(needle, idx - 1)
  ) {
    if (isNamePart(text[idx + needle.length])) continue;
    const open = parseOpenTag(text.slice(idx));
    if (!open || open.selfClosing) continue;
    const contentStart = idx + open.length;
    const close = findMatchingClose(name, text, contentStart);
    if (close && offset <= close.closeEnd) {
      return {
        from: idx,
        to: close.closeEnd,
        open: open.tag,
        contentStart,
        closeStart: close.closeStart,
      };
    }
  }
  return null;
}

function readWrapper(
  shape: WrapperShape,
  text: string,
  tag: EnclosingTag
): WrapperDraft {
  const openAttr = tag.open.attributes.find((a) => a.name === OPEN_CHILD_ATTR);
  const rest: ParsedTag = {
    name: tag.open.name,
    attributes: tag.open.attributes.filter((a) => a.name !== OPEN_CHILD_ATTR),
  };
  const { values, unknownAttributes } = tagToBuilderState(
    shape.descriptor,
    shape.defaults,
    rest
  );
  const defaultChild =
    openAttr && typeof openAttr.value === "string" ? openAttr.value : undefined;
  return {
    values,
    unknownAttributes,
    defaultChild,
    children: readChildren(shape, text, tag.contentStart, tag.closeStart),
  };
}

function readChildren(
  shape: WrapperShape,
  text: string,
  contentStart: number,
  contentEnd: number
): WrapperChildDraft[] {
  const children: WrapperChildDraft[] = [];
  const needle = `<${shape.childName}`;
  let i = contentStart;
  while (i < contentEnd) {
    const idx = text.indexOf(needle, i);
    if (idx === -1 || idx >= contentEnd) break;
    if (isNamePart(text[idx + needle.length])) {
      i = idx + needle.length;
      continue;
    }
    const open = parseOpenTag(text.slice(idx));
    if (!open) {
      i = idx + needle.length;
      continue;
    }
    const childTag: ParsedTag = open.tag;
    const { values, unknownAttributes } = tagToBuilderState(
      shape.childDescriptor,
      shape.childDefaults,
      childTag
    );
    if (open.selfClosing) {
      children.push({ values, content: "", unknownAttributes });
      i = idx + open.length;
      continue;
    }
    const innerStart = idx + open.length;
    const close = findMatchingClose(shape.childName, text, innerStart);
    if (!close || close.closeStart > contentEnd) break;
    children.push({
      values,
      content: stripWrap(text.slice(innerStart, close.closeStart)),
      unknownAttributes,
    });
    i = close.closeEnd;
  }
  return children;
}

// The `</name>` that closes an element opened at `searchStart`, honouring
// nested same-name elements and skipping self-closing ones. Null when the
// close is missing.
function findMatchingClose(
  name: string,
  text: string,
  searchStart: number
): { closeStart: number; closeEnd: number } | null {
  const openNeedle = `<${name}`;
  const closeNeedle = `</${name}>`;
  let depth = 1;
  let i = searchStart;
  while (i < text.length) {
    const nextClose = text.indexOf(closeNeedle, i);
    if (nextClose === -1) return null;
    let nextOpen = text.indexOf(openNeedle, i);
    while (nextOpen !== -1 && isNamePart(text[nextOpen + openNeedle.length])) {
      nextOpen = text.indexOf(openNeedle, nextOpen + openNeedle.length);
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const open = parseOpenTag(text.slice(nextOpen));
      if (open && !open.selfClosing) depth++;
      i = nextOpen + (open ? open.length : openNeedle.length);
      continue;
    }
    depth--;
    if (depth === 0) {
      return { closeStart: nextClose, closeEnd: nextClose + closeNeedle.length };
    }
    i = nextClose + closeNeedle.length;
  }
  return null;
}

// True when a character continues a tag name, so `<Tab` does not match inside
// `<Tabs` (and the reverse) — the word boundary the raw indexOf lacks.
function isNamePart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9]/.test(char);
}
