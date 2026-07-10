# SENA Fusion Formula: Formal Mathematical Analysis

Date: 2026-06-08
Directed bridge contract revision: 2026-07-10

This note formalizes the SENA fusion formula discussed in the shared ChatGPT conversation and in the local SENA project documents. The central formula is

```math
A_{\mathrm{fusion}} =
\begin{bmatrix}
\alpha \widehat S & \gamma \widehat B^{PC} \\
\gamma \widehat B^{CP} & \beta \widehat W
\end{bmatrix},
```

where \(S\) is a person-person social interaction matrix, \(W\) is a code-code epistemic co-occurrence matrix, \(B^{PC}\) is a person-to-code contribution matrix, \(B^{CP}\) is a code-to-person bridge matrix, hats denote explicit normalization, and \(\alpha,\beta,\gamma \ge 0\) are layer weights. The runtime retains \(B\) as an alias for \(B^{PC}\). When no independent code-to-person evidence is declared, the required fallback is \(B^{CP}=(B^{PC})^\top\); otherwise the two bridge directions are estimated independently and the fused graph is directed.

## 1. Mathematical Identity

Let

```math
P=\{p_1,\ldots,p_n\}, \qquad C=\{c_1,\ldots,c_m\}.
```

The SENA node set is the typed union

```math
V = P \cup C, \qquad |V|=n+m.
```

The three empirical relations are:

```math
S \in \mathbb R_{\ge 0}^{n \times n}, \qquad
W \in \mathbb R_{\ge 0}^{m \times m}, \qquad
B^{PC} \in \mathbb R_{\ge 0}^{n \times m}, \qquad
B^{CP} \in \mathbb R_{\ge 0}^{m \times n}.
```

The fused matrix \(A_{\mathrm{fusion}}\) is therefore a block adjacency matrix on a weighted, typed, heterogeneous social-epistemic graph:

```math
G_{\mathrm{SENA}}=(V, E_{PP}\cup E_{CC}\cup E_{PC}\cup E_{CP}),
```

with edge weights

```math
w(p_i,p_j)=\alpha\widehat S_{ij}, \qquad
w(c_a,c_b)=\beta\widehat W_{ab}, \qquad
w(p_i,c_a)=\gamma\widehat B^{PC}_{ia}, \qquad
w(c_a,p_i)=\gamma\widehat B^{CP}_{ai}.
```

Thus the formula is dimensionally valid and has a standard network-science interpretation: it is a typed supra-adjacency / heterogeneous adjacency representation. It is symmetric only under the conditions stated in Proposition 2. It is not, by itself, an ENA projection, a causal model, or an inferential test.

## 2. Data-Generating View

A systematic construction can start from events, turns, stanzas, or coded segments.

Let \(T=\{t_1,\ldots,t_q\}\) be discourse windows. Define:

```math
X_{ta}=\text{activation strength of code }c_a\text{ in window }t,
```

```math
Y_{it}=\text{participation strength of person }p_i\text{ in window }t,
```

```math
R_{ij}=\text{observed social interaction strength from }p_i\text{ to }p_j.
```

Then common SENA-compatible estimators are:

```math
S_{ij}=R_{ij} \quad \text{or} \quad S_{ij}=R_{ij}+R_{ji}\text{ for an undirected social layer},
```

```math
W_{ab}=\sum_{t=1}^{q} X_{ta}X_{tb}, \quad a\ne b,
```

```math
B^{PC}_{ia}=\sum_{t=1}^{q} Y_{it}X_{ta}.
```

When coded segment \(r\) carries code weight \(x_{ra}\), author \(u(r)\), and an explicit target-person set \(T(r)\), the directed reverse bridge may be estimated as

```math
B^{CP}_{ai}=\sum_r x_{ra}\,\mathbf 1\{p_i\in T(r)\}.
```

This shows that \(W\) is an ENA-style code co-occurrence object before dimensional reduction, while \(B^{PC}\) and \(B^{CP}\) are typed bridge objects. The project implementation builds \(S\) from interaction records, \(W\) from stanza-level code co-occurrence, \(B^{PC}\) from person-authored coded segments, and \(B^{CP}\) from valid `targetPersonIds`; without target-person evidence it uses the declared transpose fallback.

## 3. Core Propositions

### Proposition 1: Dimensional Consistency

If \(S\in\mathbb R^{n\times n}\), \(W\in\mathbb R^{m\times m}\), \(B^{PC}\in\mathbb R^{n\times m}\), and \(B^{CP}\in\mathbb R^{m\times n}\), then

```math
A_{\mathrm{fusion}}\in\mathbb R^{(n+m)\times(n+m)}.
```

Proof: the upper-left block has \(n\) rows and \(n\) columns; the upper-right block has \(n\) rows and \(m\) columns; the lower-left block has \(m\) rows and \(n\) columns; the lower-right block has \(m\) rows and \(m\) columns. Therefore the full block matrix has \(n+m\) rows and \(n+m\) columns.

### Proposition 2: Valid Weighted Undirected Graph

If \(S=S^\top\), \(W=W^\top\), \(B^{CP}=(B^{PC})^\top\), all blocks are nonnegative, and \(\alpha,\beta,\gamma\ge 0\), then \(A_{\mathrm{fusion}}\) is a symmetric nonnegative adjacency matrix.

Proof:

```math
A_{\mathrm{fusion}}^\top =
\begin{bmatrix}
(\alpha\widehat S)^\top & (\gamma\widehat B^{CP})^\top \\
(\gamma\widehat B^{PC})^\top & (\beta\widehat W)^\top
\end{bmatrix}
=
\begin{bmatrix}
\alpha\widehat S & \gamma\widehat B^{PC} \\
\gamma\widehat B^{CP} & \beta\widehat W
\end{bmatrix}.
```

Nonnegativity follows from nonnegative blocks and nonnegative layer weights. Therefore the matrix defines a weighted undirected heterogeneous network.

### Proposition 3: Laplacian Validity

For symmetric nonnegative \(A_{\mathrm{fusion}}\), define

```math
D_{uu}=\sum_v A_{\mathrm{fusion},uv}, \qquad L=D-A_{\mathrm{fusion}}.
```

Then \(L\) is positive semidefinite:

```math
x^\top Lx=\frac12\sum_{u,v} A_{\mathrm{fusion},uv}(x_u-x_v)^2\ge 0.
```

Therefore spectral clustering, graph diffusion, Laplacian eigenmaps, and related graph-embedding methods are mathematically admissible. This does not imply that the adjacency matrix itself is positive semidefinite.

### Proposition 4: Boundary-Case Coherence

The formula has coherent limiting cases:

- \(\gamma=0\): social and epistemic networks are disconnected, recovering separate SNA and ENA-style code networks.
- \(\alpha=0,\beta=0\): the model becomes a pure person-code bipartite affiliation network.
- \(B^{PC}=B^{CP}=0\): no empirical social-epistemic bridge exists; a fused display would be only a visual juxtaposition.
- \(\alpha=0\): analysis foregrounds epistemic and person-code contribution structures.
- \(\beta=0\): analysis foregrounds social and person-code contribution structures.

These limits are important because a good fusion formula should degrade into recognizable submodels rather than producing uninterpretable artifacts.

## 4. Normalization Is Not Optional

The raw magnitudes of \(S\), \(W\), \(B^{PC}\), and \(B^{CP}\) are generally not commensurable. For example, social ties may count replies, \(W\) may count stanza co-occurrences, and the bridge blocks may count coded segments or confidence-weighted activations. Without normalization, the largest-count layer can dominate all graph metrics and embeddings.

A valid SENA analysis must therefore define a normalization map

```math
N_L: M_L \mapsto \widehat M_L
```

for each layer \(L\in\{S,W,B^{PC},B^{CP}\}\). Reasonable choices include:

```math
\widehat M = \frac{M}{\max_{uv}|M_{uv}|},
```

```math
\widehat M = \frac{\log(1+M)}{\max_{uv}\log(1+M_{uv})},
```

```math
\widehat M = \frac{M}{\|M\|_F},
```

or a row-stochastic normalization when transition probabilities are the intended interpretation.

The current SENA implementation supports `max`, `frobenius`, and `log1p-max`, retains `log-max` as a compatibility alias, and treats `none` as exploratory rather than admissible normalization. For publication-grade inferential analysis, the report should explicitly state the chosen normalization and include sensitivity checks over \(\alpha,\beta,\gamma\).

## 5. Directed and Temporal Extensions

If the social layer is directed, \(S\ne S^\top\). If independently estimated bridge evidence is active, \(B^{CP}\ne(B^{PC})^\top\). Either condition makes \(A_{\mathrm{fusion}}\) a directed heterogeneous adjacency matrix, so undirected Laplacian claims no longer apply without declared symmetrization or a directed graph Laplacian.

The executable directed bridge contract is:

```math
A_{\mathrm{fusion}}=
\begin{bmatrix}
\alpha \widehat S & \gamma\widehat B^{PC}\\
\gamma\widehat B^{CP} & \beta \widehat W
\end{bmatrix},
```

where \(B^{PC}\) means person-to-code activation and \(B^{CP}\) means code-to-person target, uptake, feedback, or recommendation evidence. Runtime provenance must report either `pc-cp-independent` or `pc-transpose-fallback`.

For temporal SENA, define

```math
A_{\mathrm{fusion}}(t)=
\begin{bmatrix}
\alpha \widehat S(t) & \gamma \widehat B^{PC}(t)\\
\gamma \widehat B^{CP}(t) & \beta \widehat W(t)
\end{bmatrix}.
```

Then changes can be analyzed through

```math
\Delta A(t_1,t_2)=A_{\mathrm{fusion}}(t_2)-A_{\mathrm{fusion}}(t_1),
```

or through distances such as \(\|A(t_2)-A(t_1)\|_F\), spectral distances, graph edit distances, or permutation-tested group differences.

## 6. Relation to ENA

ENA typically constructs code-code connection vectors and then projects units into a low-dimensional space. The important distinction is:

- \(W\) is a code-code co-occurrence network before or alongside projection.
- ENA space is a low-dimensional representation derived from connection vectors.
- \(A_{\mathrm{fusion}}\) is a heterogeneous graph object that can be embedded after construction.

Therefore, the criticism that "SNA is not dimensionally reduced but ENA is dimensionally reduced, so they cannot be placed in one figure" is only partly correct.

It is correct if one tries to directly overlay raw SNA nodes onto an ENA projection and interpret all distances as a common latent metric.

It is not correct if SENA first builds a joint heterogeneous adjacency matrix and then applies a specified joint embedding method. In that case, the shared space is produced from \(A_{\mathrm{fusion}}\), not borrowed uncritically from the ENA projection.

## 7. Person-Code-Pair Extension

The matrix \(B^{PC}_{ia}\) answers: which person contributed to which code? The matrix \(B^{CP}_{ai}\) separately records which target person was linked to that coded evidence when such direction is explicitly observed.

But ENA edges are code pairs. Therefore, for the stronger question "who contributed to the Evidence-Explanation link?", define

```math
G_{i,ab} = \text{contribution of person }p_i\text{ to code pair }(c_a,c_b).
```

A common estimator is:

```math
G_{i,ab}=\sum_{t=1}^{q} Y_{it}X_{ta}X_{tb}.
```

This does not replace the bridge blocks. Instead:

- \(B^{PC}\) supports person-to-code bridge visualization and retains the `B` compatibility alias.
- \(B^{CP}\) supports code-to-person direction when target-person evidence is present, otherwise it is the declared transpose fallback.
- \(G\) supports person-code-pair attribution.
- \(W\) supports code-code epistemic connection strength.

The current project already includes a \(G\) block for reporting person-code-pair contribution, which is mathematically stronger than relying on \(B\) alone when explaining who supports a specific ENA edge.

## 8. Literature Positioning and Gap

SENS defines a combination of SNA and ENA for collaborative learning and reports that the two approaches provide complementary information about social ties, discourse content, roles, and performance. iSENS goes further by proposing a simultaneous investigation of cognitive and social connections and by explicitly noting that few attempts had combined ENA and SNA.

However, the SENA block formula is not simply SENS renamed. Its mathematical identity is closer to a heterogeneous / multilayer supra-adjacency representation:

```math
\text{people layer} \oplus \text{code layer} \oplus \text{person-code bridge}.
```

The gap is therefore specific:

- Prior SENS/iSENS work establishes the learning-analytics need for combining SNA and ENA.
- Multilayer network theory establishes that block/supra-adjacency matrices are legitimate mathematical objects.
- Heterogeneous information network theory establishes that typed nodes and typed relations are standard and useful.
- ENA provides the code-code co-occurrence and projection machinery.
- What appears less clearly established in the literature is a SENA-specific, publication-ready formalization of a single typed \(P\cup C\) adjacency matrix that keeps people and epistemic codes as different node types while retaining SNA, ENA, and bridge edges in one model object.

So the novelty claim should be calibrated as follows:

> SENA does not invent block adjacency matrices or multilayer networks. Its contribution is the domain-specific formalization of a social-epistemic heterogeneous graph that unifies person-person social ties, code-code ENA co-occurrences, and person-code contribution bridges for collaborative learning analytics, with explicit normalization, embedding, evidence traceability, and inferential guardrails.

## 9. Failure Modes

The formula is mathematically reasonable only under explicit assumptions. It can fail or be overinterpreted in the following cases:

1. Layer-scale failure: if \(S,W,B^{PC},B^{CP}\) are not normalized, one layer dominates centrality, layout, and clustering.
2. Semantic mixing failure: if social ties count one kind of event and codes count another incompatible unit, bridge interpretation becomes weak.
3. Projection confusion: if an explanatory display is presented as a statistically valid joint latent space.
4. Directionality confusion: if directed interactions are symmetrized without theoretical justification.
5. Bridge-provenance confusion: if transpose fallback is presented as independently observed \(B^{CP}\) evidence.
6. Coding unreliability: if code assignments are unstable, \(W\), the bridge blocks, and \(G\) inherit that instability.
7. Degree-volume confounding: highly talkative learners can dominate \(B^{PC}\) and \(G\) unless contribution volume is controlled.
8. Causal overclaiming: \(A_{\mathrm{fusion}}\) represents observed relational structure, not causality.
9. Null-model absence: group or temporal differences are descriptive until tested against appropriate null models.

## 10. Recommended Statistical Validation

For a publishable SENA method, report at least:

1. Data contract: persons, windows/stanzas, interactions, coded segments, and codebook.
2. Matrix definitions: exact formulas for \(S\), \(W\), \(B^{PC}\), \(B^{CP}\), and \(G\), including whether the CP block is independent or transpose fallback.
3. Normalization: max, log-max, Frobenius, row-stochastic, or other stated choice.
4. Weight sensitivity: results across meaningful \((\alpha,\beta,\gamma)\) settings.
5. Embedding method: force layout, spectral embedding, MDS, matrix factorization, or ENA-space overlay, with interpretation limits.
6. Reliability: human coding agreement or human-reviewed AI coding workflow.
7. Null models: permutation or bootstrap tests for group/time differences.
8. Evidence traceability: every edge should link back to source interactions or coded segments.

Potential null models include:

- Shuffle code labels within learners while preserving each learner's code volume.
- Shuffle social ties while preserving degree or weighted degree distribution.
- Shuffle stanza membership while preserving turn order bands.
- Permute group labels for group-difference testing.
- Bootstrap windows/stanzas for confidence intervals around \(S,W,B^{PC},B^{CP},G\) summaries.

## 11. Verdict

The SENA fusion formula is mathematically reasonable as a normalized weighted heterogeneous graph:

```math
A_{\mathrm{fusion}} =
\begin{bmatrix}
\alpha \widehat S & \gamma \widehat B^{PC} \\
\gamma \widehat B^{CP} & \beta \widehat W
\end{bmatrix}.
```

The transpose-only model is recovered when \(B^{CP}=(B^{PC})^\top\); independent target-person evidence activates the directed extension. Its strongest formal interpretation is not "SNA and ENA drawn on one picture" but:

> a typed supra-adjacency matrix for a social-epistemic nexus graph.

Under symmetry and nonnegativity assumptions, it supports standard undirected graph analysis through adjacency and Laplacian machinery. Under directed assumptions, it remains a valid directed heterogeneous graph but requires directed-network methods. It becomes a rigorous research method only when the construction of \(S,W,B^{PC},B^{CP},G\), normalization, embedding, statistical testing, and evidence traceability are all specified.

## 12. Sources Checked

- Local shared ChatGPT conversation, accessed through the user's logged-in Chrome session: `https://chatgpt.com/share/6a25af20-6520-83a8-9747-01f72a10eca4`
- Local project specification: `SENA_web_tool_development_spec.md`
- Local implementation: `sena-hk-template/lib/sena/model.ts`
- Local conceptual manuscript drafts in `SENA Papers/`
- Gašević, Joksimović, Eagan, & Shaffer (2019), [SENS: network analytics to combine social and cognitive perspectives of collaborative learning](https://research.monash.edu/en/publications/sens-network-analytics-to-combine-social-and-cognitive-perspectiv)
- Swiecki & Shaffer, [iSENS: An integrated approach to combining epistemic and social network analyses](https://vbn.aau.dk/en/publications/isens-an-integrated-approach-to-combining-epistemic-and-social-ne)
- Shaffer, Collier, & Ruis (2016), [A tutorial on Epistemic Network Analysis](https://colab.ws/articles/10.18608%2Fjla.2016.33.3)
- Bowman et al. (2021), [The mathematical foundations of Epistemic Network Analysis](https://research.monash.edu/en/publications/the-mathematical-foundations-of-iepistemic-network-analysisi/)
- Siebert-Evenstone et al. (2017), [Moving stanza windows for ENA](https://learning-analytics.info/index.php/JLA/article/view/5416)
- Kivelä et al. (2014), [Multilayer Networks](https://arxiv.org/abs/1309.7233)
- Mucha et al. (2010), [Community Structure in Time-Dependent, Multiscale, and Multiplex Networks](https://arxiv.org/abs/0911.1824)
- Sun & Han (2012), [Mining Heterogeneous Information Networks](https://link.springer.com/book/10.1007/978-3-031-01902-9)
