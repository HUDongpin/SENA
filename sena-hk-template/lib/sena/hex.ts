/**
 * The hexagon is SENA's person glyph. Its point math was copy-pasted into every
 * surface that drew one (fusion-canvas, temporal-fusion-arc, EnaPlot), so a
 * rounding or phase change in one renderer silently produced a different person
 * shape in the next. One export, one shape.
 *
 * Phase is flat-top-rotated (first vertex at 30 degrees) and points are emitted
 * unrounded, exactly as every previous private copy emitted them: migrating a
 * caller must not move a single pixel of rendered markup.
 */
export function hexPoints(x: number, y: number, radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 6 + (index * Math.PI * 2) / 6;
    return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`;
  }).join(" ");
}
