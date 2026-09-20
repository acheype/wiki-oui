import {
  fieldProp,
  visibleFields,
  type ComponentDescriptor,
  type DescriptorField,
  type PropDefaults,
  type PropValue,
  type PropValues,
} from "../descriptor";

function acceptsValue(
  source: DescriptorField,
  target: DescriptorField,
  value: PropValue
): boolean {
  if (value === undefined) return false;
  if (target.options) {
    return typeof value === "string" && value in target.options;
  }
  return source.type === target.type;
}

/**
 * Applies one builder choice, including descriptor pre-fills and values shared
 * by conditional fields that emit the same prop.
 */
export function changeBuilderValue(
  descriptor: ComponentDescriptor,
  defaults: PropDefaults,
  current: PropValues,
  field: string,
  value: PropValue
): PropValues {
  const next = { ...current, [field]: value };
  const prefillsOf = (choice: PropValue) =>
    typeof choice === "string"
      ? (descriptor.properties[field]?.prefill?.[choice] ?? {})
      : {};
  const held = (target: string) =>
    target in current ? current[target] : defaults[target];
  const previous = field in current ? current[field] : defaults[field];

  for (const [target, seeded] of Object.entries(prefillsOf(previous))) {
    if (held(target) === seeded) next[target] = defaults[target];
  }
  for (const [target, seeded] of Object.entries(prefillsOf(value))) {
    if (held(target) === defaults[target]) next[target] = seeded;
  }

  const previouslyVisible = new Set(visibleFields(descriptor, defaults, current));
  const newlyVisible = new Set(visibleFields(descriptor, defaults, next));
  const carriers = new Map<string, string[]>();
  for (const [name, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    const prop = fieldProp(name, spec);
    carriers.set(prop, [...(carriers.get(prop) ?? []), name]);
  }

  for (const fields of carriers.values()) {
    if (fields.length < 2) continue;
    const source = fields.find((name) => previouslyVisible.has(name));
    const target = fields.find((name) => newlyVisible.has(name));
    if (!source || !target || source === target) continue;
    const carried = source in current ? current[source] : defaults[source];
    if (
      acceptsValue(
        descriptor.properties[source],
        descriptor.properties[target],
        carried
      )
    ) {
      next[target] = carried;
    }
  }

  return next;
}
