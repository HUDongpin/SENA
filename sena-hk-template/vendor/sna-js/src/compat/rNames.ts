import { betweenness } from "../algorithms/betweenness";
import { closeness } from "../algorithms/closeness";
import { labelPropagation } from "../algorithms/community";
import { components, isConnected } from "../algorithms/components";
import { degree } from "../algorithms/degree";
import { gden, nties } from "../algorithms/density";
import { geodist } from "../algorithms/geodist";
import { averagePathLength, reachability } from "../algorithms/reachability";
import { grecip } from "../algorithms/reciprocity";

export const snaR = {
  betweenness,
  closeness,
  labelPropagation,
  components,
  degree,
  gden,
  geodist,
  grecip,
  reachability,
  averagePathLength,
  nties,
  "is.connected": isConnected,
} as const;
