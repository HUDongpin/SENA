export type ContainedFocusCycleOptions = {
  currentIndex: number;
  itemCount: number;
  backward: boolean;
};

export function cycleContainedFocusIndex({
  currentIndex,
  itemCount,
  backward
}: ContainedFocusCycleOptions) {
  if (itemCount <= 0) return -1;
  if (currentIndex < 0) return backward ? itemCount - 1 : 0;
  return backward
    ? (currentIndex - 1 + itemCount) % itemCount
    : (currentIndex + 1) % itemCount;
}
