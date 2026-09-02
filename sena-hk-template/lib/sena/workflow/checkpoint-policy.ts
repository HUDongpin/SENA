const FORBIDDEN_CHECKPOINT_KEY = /(?:^|_)(?:access_?tokens?|api_?keys?|credentials?|passwords?|private_?keys?|provider_?secrets?|raw_?(?:logs?|research(?:_?rows?)?|rows?)|refresh_?tokens?|secrets?|tokens?)(?:$|_)/i;
const DIRECT_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function checkpointPath(parent: string, key: string | number) {
  return typeof key === "number" ? `${parent}[${key}]` : parent ? `${parent}.${key}` : key;
}

export function assertSenaWorkflowCheckpointSafe(value: unknown, path = "state"): void {
  if (value === null || value === undefined) return;
  if (["boolean", "number"].includes(typeof value)) return;
  if (typeof value === "string") {
    if (DIRECT_EMAIL.test(value)) {
      throw new Error(`SENA workflow checkpoint contains a direct identifier at ${path}.`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`SENA workflow checkpoint contains a non-JSON value at ${path}.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSenaWorkflowCheckpointSafe(entry, checkpointPath(path, index)));
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`SENA workflow checkpoint contains a non-plain object at ${path}.`);
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const entryPath = checkpointPath(path, key);
    if (FORBIDDEN_CHECKPOINT_KEY.test(key)) {
      throw new Error(`SENA workflow checkpoint contains a forbidden field at ${entryPath}.`);
    }
    assertSenaWorkflowCheckpointSafe(entry, entryPath);
  }
}

export function senaWorkflowCheckpointState<T>(value: T): T {
  assertSenaWorkflowCheckpointSafe(value);
  return value;
}
