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
  type FieldType,
  type LineLookup,
  type PropValue,
  emitsMarkdownLink,
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

// A field's type maps to one base prop type; `list` is handled apart (it
// must face a string-literal union), `divider` emits no prop.
const FIELD_BASE_TYPE: Record<
  Exclude<FieldType, "divider" | "list">,
  "string" | "number" | "boolean"
> = {
  text: "string",
  url: "string",
  icon: "string",
  "page-list": "string",
  "file-list": "string",
  "form-list": "string", // holds a form slug (ADR 0015)
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

  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    const prop = signature.props[field];
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
        `${yamlRef(ctx, ["properties", field])}: field "${field}" must set "required: true" — prop "${field}" is required at runtime in <${name}> (${tsxRef(ctx, prop.line)})`
      );
    }

    checkType(ctx, field, spec.type, spec.options, spec.default, prop, errors);
    checkDrift(ctx, field, spec.default, prop, errors, warnings);

    // `value` is a pre-fill, always written; verified in type only, never for
    // drift — it may legitimately differ from the component default.
    if (spec.value !== undefined && !valueFitsType(spec.value, prop.type)) {
      errors.push(
        `${yamlRef(ctx, ["properties", field, "value"], ["properties", field])}: field "${field}" value ${show(spec.value)} does not fit prop "${field}": ${describeType(prop.type)} in <${name}> (${tsxRef(ctx, prop.line)})`
      );
    }
  }

  return { errors, warnings };
}

function checkType(
  ctx: CheckContext,
  field: string,
  fieldType: FieldType,
  options: Record<string, string> | undefined,
  fieldDefault: PropValue,
  prop: PropSignature,
  errors: string[]
): void {
  const at = yamlRef(ctx, ["properties", field, "type"], ["properties", field]);
  if (fieldType === "divider" || fieldType === "list") {
    if (fieldType === "list") checkList(ctx, field, options, fieldDefault, prop, errors);
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
      `${at}: field "${field}" (type ${fieldType}) does not match prop "${field}": ${describeType(prop.type)} in <${ctx.name}> (${tsxRef(ctx, prop.line)})`
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
  return type.kind === "union" ? "string" : type.kind;
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
  if (type.kind === "union") return type.values.map((v) => `"${v}"`).join(" | ");
  if (type.kind === "other") return type.text;
  return type.kind;
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
