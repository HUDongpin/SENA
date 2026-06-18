import { degree, gden, geodist } from "../dist/index.js";

const graph = [
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 0],
];

console.log("density", gden(graph, { mode: "digraph" }));
console.log("outdegree", degree(graph, { mode: "digraph", cmode: "outdegree" }));
console.log("distances", geodist(graph, { mode: "digraph" }).distances);
