export type WorkspaceMobileFigure = "fusion" | "dual";

export function nextWorkspaceMobileFigure(
  current: WorkspaceMobileFigure,
  key: string
): WorkspaceMobileFigure {
  if (key === "Home") return "fusion";
  if (key === "End") return "dual";
  if (key === "ArrowRight") return current === "dual" ? "fusion" : "dual";
  if (key === "ArrowLeft") return current === "fusion" ? "dual" : "fusion";
  return current;
}
