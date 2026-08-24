/**
 * Canonical evidence ordering must not inherit ICU or host-locale collation.
 * JavaScript relational string comparison is defined over UTF-16 code units,
 * so the same strings receive the same order on every supported runtime.
 */
export function compareSenaCanonicalText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
