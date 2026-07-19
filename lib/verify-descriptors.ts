import path from "node:path";
import {
  Node,
  type ParameterDeclaration,
  Project,
  type SourceFile,
  type Type,
} from "ts-morph";
import {
  type ComponentDescriptor,
  type DescriptorField,
  type FieldType,
  type LineLookup,
  type PropValue,
  emitsMarkdownLink,
  fieldProp,
} from "./component-descriptor";
import type { ComponentBuilderSpec } from "./component-descriptors";
import { readDescriptorSource } from "./descriptor-source";

// Signature verification (ADR 0013): does each YAML descriptor still match
// its component? We parse the component *source* (never import it, so a
// `"use client"` module is read but never run) with the TypeScript compiler
// via ts-morph — a devDependency, absent from the production bundle. It runs
// in dev (editor load) and at build (prebuild), throwing a clear message on
// any inconsistency; a build passing this pass guarantees prod coherence.

/** A prop's type reduced to what the descriptor needs to check against. */
export type PropType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  /** A union of string literals, e.g. `"none" | "right"`. */
  | { kind: "union"; values: string[] }
  /** `string[]` — a multiple form-field. */
  | { kind: "string-array" }
  /** `string | string[]` — a multiple form selector (docs/entries-view.md). */
  | { kind: "string-or-strings" }
  /** An array of objects, e.g. `{ field: string; title?: string }[]`. */
  | { kind: "object-array"; keys: string[] }
  /** `Record<string, string>` — a color/icon mapping. */
  | { kind: "record" }
  /** A plain object type, e.g. `{ lat: number; lng: number; zoom: number }`. */
  | { kind: "object"; keys: string[] }
  | { kind: "other"; text: string };

/** A component prop's destructuring default, traced to a literal when it can. */
export type DestructuringDefault =
  | { literal: PropValue }
  /** Computed at runtime (function call, runtime expression): unverifiable. */
  | { unverifiable: true };

export interface PropSignature {
  /** Declared optional (`prop?:`). */
  tsOptional: boolean;
  type: PropType;
  /** Absent when the prop has no `= …` default in the destructuring. */
  destructuringDefault?: DestructuringDefault;
  /** 1-based line of the prop in the component source (for error messages). */
  line?: number;
  /** 1-based line of the destructuring default expression, when there is one. */
  defaultLine?: number;
}

export interface ComponentSignature {
  /** Component source path, e.g. "components/wiki/button.tsx" (for messages). */
  file: string;
  props: Record<string, PropSignature>;
}

export interface SignatureCheck {
  errors: string[];
  warnings: string[];
}

// A field's type maps to one base prop type; `list`/`view-picker` are handled
// apart (they must face a string-literal union), the structured types against
// their own shapes, `divider` emits no prop.
const FIELD_BASE_TYPE: Partial<
  Record<FieldType, "string" | "number" | "boolean">
> = {
  text: "string",
  url: "string",
  icon: "string",
  "page-list": "string",
  "file-list": "string",
  number: "number",
  checkbox: "boolean",
};

// Everything a message needs to name both ends of a mismatch: the descriptor
// field the author edits (YAML file + line) and the component prop it should
// match (tsx file + line). `lineOf` is absent for a hand-built signature.
interface CheckContext {
  name: string;
  file: string;
  yamlFile: string;
  lineOf?: LineLookup;
}

// `<yaml>:<line>` for the first candidate path that resolves, falling back to
// the field, then the bare file — so a message points at the offending key.
function yamlRef(ctx: CheckContext, ...candidates: (string | number)[][]): string {
  for (const candidate of candidates) {
    const line = ctx.lineOf?.(candidate);
    if (line !== undefined) return `${ctx.yamlFile}:${line}`;
  }
  return ctx.yamlFile;
}

/** `<tsx>:<line>` for the component side of a mismatch (line when known). */
function tsxRef(ctx: CheckContext, line?: number): string {
  return line !== undefined ? `${ctx.file}:${line}` : ctx.file;
}

// Cross-checks a descriptor against its component's signature (the exact
// table in docs/component-builder.md). Pure: the ts-morph extraction is
// separate, so this is unit-tested with hand-built signatures. `lineOf` (from
// the parsed YAML) makes messages point at the offending line on each side.
export function checkSignature(
  name: string,
  descriptor: ComponentDescriptor,
  signature: ComponentSignature,
  lineOf?: LineLookup
): SignatureCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ctx: CheckContext = {
    name,
    file: signature.file,
    yamlFile: signature.file.replace(/\.tsx$/, ".yaml"),
    lineOf,
  };

  // Aliased props (several fields, disjoint showif — docs/entries-view.md)
  // exist precisely because the default depends on a sibling value, so the
  // component cannot destructure one default: it resolves it at runtime and
  // the drift check does not apply.
  const carrierCounts = new Map<string, number>();
  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    const prop = fieldProp(field, spec);
    carrierCounts.set(prop, (carrierCounts.get(prop) ?? 0) + 1);
  }

  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    const propName = fieldProp(field, spec);
    const prop = signature.props[propName];
    if (!prop) {
      errors.push(
        `${yamlRef(ctx, ["properties", field])}: field "${field}" is not a prop of <${name}> (${tsxRef(ctx)})`
      );
      continue;
    }

    // Required at runtime = required in TS *and* no destructuring default.
    // Neither `value` nor `default` satisfies it: only `required: true` does.
    const runtimeRequired = !prop.tsOptional && prop.destructuringDefault === undefined;
    if (runtimeRequired && !spec.required) {
      errors.push(
        `${yamlRef(ctx, ["properties", field])}: field "${field}" must set "required: true" — prop "${propName}" is required at runtime in <${name}> (${tsxRef(ctx, prop.line)})`
      );
    }

    checkType(ctx, field, spec, prop, errors);
    if ((carrierCounts.get(propName) ?? 0) < 2) {
      checkDrift(ctx, field, spec.default, prop, errors, warnings);
    }

    // `value` is a pre-fill, always written; verified in type only, never for
    // drift — it may legitimately differ from the component default.
    if (spec.value !== undefined && !valueFitsType(spec.value, prop.type)) {
      errors.push(
        `${yamlRef(ctx, ["properties", field, "value"], ["properties", field])}: field "${field}" value ${show(spec.value)} does not fit prop "${propName}": ${describeType(prop.type)} in <${name}> (${tsxRef(ctx, prop.line)})`
      );
    }
  }

  return { errors, warnings };
}

function checkType(
  ctx: CheckContext,
  field: string,
  spec: DescriptorField,
  prop: PropSignature,
  errors: string[]
): void {
  const fieldType = spec.type;
  const at = yamlRef(ctx, ["properties", field, "type"], ["properties", field]);
  const propName = fieldProp(field, spec);
  const mismatch = (expectation: string) =>
    errors.push(
      `${at}: field "${field}" (type ${fieldType}) expects ${expectation} but prop "${propName}" is ${describeType(prop.type)} in <${ctx.name}> (${tsxRef(ctx, prop.line)})`
    );

  switch (fieldType) {
    case "divider":
      return;
    case "list":
    case "view-picker":
      checkList(ctx, field, spec.options, spec.default, prop, errors);
      return;
    // A multiple form selector writes one name or an array of names; its
    // single form still faces a plain string prop.
    case "form-list":
    case "form-field":
      if (spec.multiple) {
        if (
          prop.type.kind !== "string-or-strings" &&
          prop.type.kind !== "string-array"
        ) {
          mismatch("string | string[] (multiple: true)");
        }
      } else if (prop.type.kind !== "string") {
        mismatch("a string prop");
      }
      return;
    case "field-rows":
      if (prop.type.kind !== "object-array" || !prop.type.keys.includes("field")) {
        mismatch('an array of objects carrying a "field" key');
      }
      return;
    case "color-mapping":
    case "icon-mapping":
      if (prop.type.kind !== "record") {
        mismatch("a Record<string, string> prop");
      }
      return;
    case "map-view":
      if (
        prop.type.kind !== "object" ||
        !["lat", "lng", "zoom"].every((key) =>
          (prop.type as { keys: string[] }).keys.includes(key)
        )
      ) {
        mismatch("an object prop with lat, lng and zoom");
      }
      return;
  }

  const expected = FIELD_BASE_TYPE[fieldType];
  // A union prop is an enum: a scalar field would let an author write a value
  // outside the prop's union undetected, so it must be a `list` instead.
  if (expected === "string" && prop.type.kind === "union") {
    errors.push(
      `${at}: field "${field}" (type ${fieldType}) faces the enum prop ${describeType(prop.type)} of <${ctx.name}>; use type: list (${tsxRef(ctx, prop.line)})`
    );
    return;
  }
  if (baseKind(prop.type) !== expected) {
    errors.push(
      `${at}: field "${field}" (type ${fieldType}) does not match prop "${propName}": ${describeType(prop.type)} in <${ctx.name}> (${tsxRef(ctx, prop.line)})`
    );
  }
}

function checkList(
  ctx: CheckContext,
  field: string,
  options: Record<string, string> | undefined,
  fieldDefault: PropValue,
  prop: PropSignature,
  errors: string[]
): void {
  if (prop.type.kind !== "union") {
    errors.push(
      `${yamlRef(ctx, ["properties", field, "type"], ["properties", field])}: list field "${field}" expects a string-union prop but <${ctx.name}>'s "${field}" is ${describeType(prop.type)} (${tsxRef(ctx, prop.line)})`
    );
    return;
  }
  const union = prop.type.values;
  for (const option of Object.keys(options ?? {})) {
    if (!union.includes(option)) {
      errors.push(
        `${yamlRef(ctx, ["properties", field, "options", option], ["properties", field, "options"], ["properties", field])}: list field "${field}" option "${option}" is outside <${ctx.name}>'s prop union (${union.join(", ")}) (${tsxRef(ctx, prop.line)})`
      );
    }
  }
  if (typeof fieldDefault === "string" && !union.includes(fieldDefault)) {
    errors.push(
      `${yamlRef(ctx, ["properties", field, "default"], ["properties", field])}: list field "${field}" default "${fieldDefault}" is outside <${ctx.name}>'s prop union (${union.join(", ")}) (${tsxRef(ctx, prop.line)})`
    );
  }
}

function checkDrift(
  ctx: CheckContext,
  field: string,
  fieldDefault: PropValue,
  prop: PropSignature,
  errors: string[],
  warnings: string[]
): void {
  const destructuringDefault = prop.destructuringDefault;
  const at = yamlRef(ctx, ["properties", field, "default"], ["properties", field]);
  const componentAt = tsxRef(ctx, prop.defaultLine ?? prop.line);
  if (destructuringDefault && "unverifiable" in destructuringDefault) {
    if (fieldDefault !== undefined) {
      warnings.push(
        `${at}: field "${field}" default is computed at runtime in <${ctx.name}> and cannot be verified (${componentAt})`
      );
    }
    return;
  }
  const componentDefault = destructuringDefault ? destructuringDefault.literal : undefined;
  if (fieldDefault !== componentDefault) {
    errors.push(
      `${at}: field "${field}" default ${show(fieldDefault)} differs from <${ctx.name}>'s default ${show(componentDefault)} (${componentAt})`
    );
  }
}

function baseKind(type: PropType): "string" | "number" | "boolean" | "other" {
  if (type.kind === "union") return "string";
  if (type.kind === "string" || type.kind === "number" || type.kind === "boolean") {
    return type.kind;
  }
  return "other";
}

function valueFitsType(value: PropValue, type: PropType): boolean {
  switch (baseKind(type)) {
    case "string":
      if (typeof value !== "string") return false;
      return type.kind === "union" ? type.values.includes(value) : true;
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function describeType(type: PropType): string {
  switch (type.kind) {
    case "union":
      return type.values.map((v) => `"${v}"`).join(" | ");
    case "other":
      return type.text;
    case "string-array":
      return "string[]";
    case "string-or-strings":
      return "string | string[]";
    case "object-array":
      return `{ ${type.keys.join(", ")} }[]`;
    case "record":
      return "Record<string, string>";
    case "object":
      return `{ ${type.keys.join(", ")} }`;
    default:
      return type.kind;
  }
}

function show(value: PropValue): string {
  if (value === undefined) return "undefined";
  return typeof value === "string" ? `"${value}"` : String(value);
}

// --- ts-morph source extraction ---------------------------------------------

interface TracedDefault {
  value: DestructuringDefault;
  line: number;
}

// Reads a component's prop signature from its source: prop names, optionality,
// types (literal unions unfolded), destructuring defaults traced to a literal,
// and the source line of each (for error messages). Never evaluates the module
// — indifferent to `"use client"`. `file` labels the source in messages.
export function extractSignature(
  sourceFile: SourceFile,
  componentName: string,
  file: string
): ComponentSignature {
  const fn = sourceFile.getFunction(componentName);
  if (!fn) {
    throw new Error(
      `${componentName}: no exported function "${componentName}" in ${sourceFile.getBaseName()}`
    );
  }
  const param = fn.getParameters()[0];
  if (!param) {
    throw new Error(`${componentName}: component "${componentName}" takes no props parameter`);
  }

  const destructuringDefaults = extractDestructuringDefaults(param);
  const props: Record<string, PropSignature> = {};
  for (const symbol of param.getType().getProperties()) {
    const name = symbol.getName();
    const declaration = symbol.getDeclarations()[0];
    const tsOptional = Node.isPropertySignature(declaration)
      ? declaration.hasQuestionToken()
      : false;
    const typeNode = Node.isPropertySignature(declaration)
      ? declaration.getTypeNode()
      : undefined;
    const type = typeNode
      ? describeCompilerType(typeNode.getType())
      : describeCompilerType(symbol.getTypeAtLocation(param).getNonNullableType());
    const traced = destructuringDefaults[name];
    props[name] = {
      tsOptional,
      type,
      destructuringDefault: traced?.value,
      line: declaration?.getStartLineNumber(),
      defaultLine: traced?.line,
    };
  }
  return { file, props };
}

function describeCompilerType(type: Type): PropType {
  const t = type.getNonNullableType();
  if (t.isBoolean() || t.isBooleanLiteral()) return { kind: "boolean" };
  if (t.isString()) return { kind: "string" };
  if (t.isNumber() || t.isNumberLiteral()) return { kind: "number" };
  if (t.isStringLiteral()) return { kind: "union", values: [String(t.getLiteralValue())] };
  if (t.isUnion()) {
    const parts = t.getUnionTypes().filter((p) => !p.isUndefined() && !p.isNull());
    if (parts.length > 0 && parts.every((p) => p.isStringLiteral())) {
      return { kind: "union", values: parts.map((p) => String(p.getLiteralValue())) };
    }
    if (parts.length > 0 && parts.every((p) => p.isBooleanLiteral())) {
      return { kind: "boolean" };
    }
    // `string | string[]`: the shape of a multiple form selector.
    if (
      parts.length === 2 &&
      parts.some((p) => p.isString()) &&
      parts.some((p) => p.isArray() && p.getArrayElementType()?.isString())
    ) {
      return { kind: "string-or-strings" };
    }
  }
  if (t.isArray()) {
    const element = t.getArrayElementType();
    if (element?.isString()) return { kind: "string-array" };
    if (element?.isObject()) {
      return {
        kind: "object-array",
        keys: element.getProperties().map((p) => p.getName()),
      };
    }
  }
  if (t.isObject() && !t.getCallSignatures().length) {
    // An index signature makes it a record; named properties make it a plain
    // object shape (the map-view area).
    if (t.getStringIndexType()?.isString()) return { kind: "record" };
    const keys = t.getProperties().map((p) => p.getName());
    if (keys.length > 0) return { kind: "object", keys };
  }
  return { kind: "other", text: t.getText() };
}

function extractDestructuringDefaults(
  param: ParameterDeclaration
): Record<string, TracedDefault> {
  const defaults: Record<string, TracedDefault> = {};
  const binding = param.getNameNode();
  if (!Node.isObjectBindingPattern(binding)) return defaults;
  for (const element of binding.getElements()) {
    const initializer = element.getInitializer();
    if (initializer) {
      defaults[element.getName()] = {
        value: resolveLiteral(initializer),
        line: initializer.getStartLineNumber(),
      };
    }
  }
  return defaults;
}

// Traces a destructuring default to a literal (ADR 0013): direct literal,
// a constant, or a constant object's property — imports included, since the
// project's checker resolves the symbol across files. Anything else (a call,
// a runtime expression) stays unverifiable.
function resolveLiteral(node: Node): DestructuringDefault {
  if (Node.isStringLiteral(node)) return { literal: node.getLiteralValue() };
  if (Node.isNumericLiteral(node)) return { literal: node.getLiteralValue() };
  if (Node.isTrueLiteral(node)) return { literal: true };
  if (Node.isFalseLiteral(node)) return { literal: false };
  if (Node.isIdentifier(node)) {
    const declaration = node.getDefinitionNodes().find(Node.isVariableDeclaration);
    const initializer = declaration?.getInitializer();
    return initializer ? resolveLiteral(initializer) : { unverifiable: true };
  }
  if (Node.isPropertyAccessExpression(node)) {
    const object = node.getExpression();
    if (Node.isIdentifier(object)) {
      const declaration = object.getDefinitionNodes().find(Node.isVariableDeclaration);
      const initializer = declaration?.getInitializer();
      if (initializer && Node.isObjectLiteralExpression(initializer)) {
        const property = initializer.getProperty(node.getName());
        if (property && Node.isPropertyAssignment(property)) {
          const value = property.getInitializer();
          if (value) return resolveLiteral(value);
        }
      }
    }
  }
  return { unverifiable: true };
}

// --- orchestration ----------------------------------------------------------

// Verifies every tag emitter (markdown-link emitters have structural checks
// only — ADR 0013). Throws with all inconsistencies collected; warns (non
// blocking) on unverifiable defaults. Loads the full TS project so imported
// types, unions and traced defaults resolve; re-reads each YAML with positions
// so messages can point at the offending line on both sides.
export async function verifyDescriptorSignatures(
  specs: ComponentBuilderSpec[]
): Promise<void> {
  const tagEmitters = specs.filter((spec) => !emitsMarkdownLink(spec.descriptor));
  if (tagEmitters.length === 0) return;

  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  for (const spec of tagEmitters) {
    const relativeFile = `components/wiki/${spec.base}.tsx`;
    const sourceFile = project.addSourceFileAtPath(
      path.join(process.cwd(), relativeFile)
    );
    const signature = extractSignature(sourceFile, spec.name, relativeFile);
    const { lineOf } = await readDescriptorSource(spec.base);
    const result = checkSignature(spec.name, spec.descriptor, signature, lineOf);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  for (const warning of warnings) {
    console.warn(`[verify-descriptors] ${warning}`);
  }
  if (errors.length > 0) {
    throw new Error(
      `ComponentBuilder descriptor(s) inconsistent with their component:\n` +
        errors.map((error) => `  - ${error}`).join("\n")
    );
  }
}
