/**
 * Assert that a condition is truthy. Throws with the provided message if not.
 * Narrows the type of `condition` to a truthy value via `asserts condition`.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}
