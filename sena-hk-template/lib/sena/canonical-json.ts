import { compareSenaCanonicalText } from "./canonical-order.mjs";

export function canonicalSenaJson(value: unknown): string | undefined {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return `[${Array.from(
      { length: value.length },
      (_, index) => canonicalSenaJson(value[index]) ?? "null"
    ).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareSenaCanonicalText(left, right))
      .flatMap(([key, entry]) => {
        const serialized = canonicalSenaJson(entry);
        return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
      })
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function senaJsonValuesEqual(left: unknown, right: unknown) {
  return canonicalSenaJson(left) === canonicalSenaJson(right);
}
