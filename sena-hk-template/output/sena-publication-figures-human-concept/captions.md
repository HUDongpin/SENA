## Figure 1. Overall Human–Human Network

`S` is directed observed interaction weight across the full lesson-study cycle. Arrowheads encode observed source-to-target direction, and line width encodes raw weight. The bundled source dataset is synthetic, and this descriptive network does not imply causal influence.

## Figure 2. Overall Concept–Concept Network

`W` is undirected code co-occurrence within `unitId × stanzaId` across the full lesson-study cycle, and line width encodes raw co-occurrence. The association has neither semantic nor causal direction.

## Figure 3. Plan–Teach–Reflect S and W Networks

Each column is stage-scoped to Plan, Teach, or Reflect. Human and concept nodes retain fixed node positions, edge widths use shared global raw-weight scales, and inactive nodes are muted. These comparisons are descriptive and non-causal.

These figures intentionally isolate the S (Human–Human) and W (Concept–Concept) layers for interpretability; B and G remain part of SENA but are not visualized here.

## Data and software note

Source contract: `public/sena-pilot/sample/lesson-study-sena-contract.json`
Dataset version: `lesson-study-public-synthetic-v1`
Source SHA-256: `c9eb2197c40b4f86308fce16fc1ff8344f1240da79085159292213e9f677982c`
Runtime configuration: `{"alpha":1,"beta":1,"gamma":1,"normalization":"max","bridgeWeightRule":"count","direction":"directed","deg_convention":"row-sum","delta":"shortest_path_reciprocal_weight","Phi":"classical_mds","d":2,"seed":0,"undirectedSocial":false,"temporal":{"mode":"stage","movingWindowSize":3,"movingWindowStep":1,"turnWindowRadius":1}}`
Overall runtime dataset hash: `0xc41285ae`
Overall runtime configuration hash: `0x01748f60`
Software: Node `v24.15.0`, Sharp `0.34.5`, libvips `8.17.3`. SVG uses the declared font fallback `Arial, Helvetica, sans-serif`.

These synthetic demonstration figures are layout-ready but are not cleared for empirical claims or population inference.
