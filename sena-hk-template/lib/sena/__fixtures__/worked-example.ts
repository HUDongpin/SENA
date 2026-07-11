export const workedExampleLabels = ["P1", "P2", "P3", "c1", "c2", "c3"] as const;

export const workedExampleS = [
  [0, 4, 0],
  [4, 0, 1],
  [0, 1, 0]
];

export const workedExampleW = [
  [0, 3, 1],
  [3, 0, 2],
  [1, 2, 0]
];

export const workedExampleB = [
  [2, 1, 0],
  [0, 2, 1],
  [0, 0, 3]
];

export const workedExampleNormalizedS = [
  [0, 1, 0],
  [1, 0, 0.25],
  [0, 0.25, 0]
];

export const workedExampleNormalizedW = [
  [0, 1, 1 / 3],
  [1, 0, 2 / 3],
  [1 / 3, 2 / 3, 0]
];

export const workedExampleNormalizedB = [
  [2 / 3, 1 / 3, 0],
  [0, 2 / 3, 1 / 3],
  [0, 0, 1]
];

export const workedExampleFusion = [
  [0, 1, 0, 2 / 3, 1 / 3, 0],
  [1, 0, 0.25, 0, 2 / 3, 1 / 3],
  [0, 0.25, 0, 0, 0, 1],
  [2 / 3, 0, 0, 0, 1, 1 / 3],
  [1 / 3, 2 / 3, 0, 1, 0, 2 / 3],
  [0, 1 / 3, 1, 1 / 3, 2 / 3, 0]
];

export const workedExampleFusedDegrees = [2, 2.25, 1.25, 2, 8 / 3, 7 / 3];
