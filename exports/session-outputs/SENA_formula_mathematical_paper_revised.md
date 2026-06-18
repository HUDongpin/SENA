# A Formal Analysis of the SENA Fusion Matrix:
# A Heterogeneous Typed Block-Adjacency Model for Social-Epistemic Network Analysis

Draft mathematical note for the SENA project

June 8, 2026

## Abstract

Social Network Analysis (SNA) represents relations among persons, while Epistemic Network Analysis (ENA) represents relations among coded epistemic elements. The proposed SENA fusion formula combines a person-person social matrix, a code-code epistemic co-occurrence matrix, and a person-code bridge matrix into one heterogeneous typed block-adjacency representation. This paper gives a formal mathematical analysis of that formula. We show that, under explicit dimensional, nonnegativity, symmetry, admissible-normalization, and typed-node assumptions, the SENA fusion matrix is a valid weighted typed adjacency matrix on a heterogeneous social-epistemic graph. We prove dimensional consistency, symmetry conditions, Laplacian positive semidefiniteness under a stated self-loop convention, coherent boundary cases, and the distinction between a joint adjacency model and an ENA projection. We also identify failure modes, attribution limits, centrality and layout interpretation rules, and statistical validation requirements. The main conclusion is that SENA should be interpreted not as a simple visual overlay of SNA and ENA, nor as a strict same-node multiplex network, but as a typed block-adjacency representation of a social-epistemic nexus. Its novelty is domain-specific formalization and validation, not the invention of block adjacency matrices themselves.

**Keywords:** social network analysis; epistemic network analysis; heterogeneous networks; typed graphs; block adjacency matrix; collaborative learning analytics; SENA.

**Mathematics Subject Classification:** 05C50, 05C82, 62H25, 91D30.

## Introduction

Collaborative learning is simultaneously social and epistemic. Learners interact with particular people while producing, connecting, challenging, and refining particular ideas. SNA gives mature tools for person-person relations, such as degree, density, centrality, communities, and brokerage (Wasserman & Faust, 1994). ENA gives a formal way to model co-occurrence relations among coded epistemic elements and to project units of analysis into a low-dimensional epistemic space (Shaffer et al., 2016; Bowman et al., 2021).

The methodological gap is not that SNA and ENA cannot both be applied to the same data. Prior work such as SENS and iSENS already argues for combining social and epistemic perspectives (Gasevic et al., 2019; Swiecki & Shaffer, 2020). The sharper mathematical question is whether one can construct a single object that contains person-person, code-code, and person-code relations while preserving their type distinctions and while remaining compatible with standard network analysis.

The proposed SENA fusion formula is

$$
A_{\mathrm{fusion}} =
\begin{bmatrix}
\alpha\widehat{S} & \gamma\widehat{B} \\
\gamma\widehat{B}^{\top} & \beta\widehat{W}
\end{bmatrix},
$$

where $\widehat{S}$ is a normalized social matrix, $\widehat{W}$ is a normalized epistemic co-occurrence matrix, $\widehat{B}$ is a normalized person-code bridge matrix, and $\alpha,\beta,\gamma\ge 0$ are layer weights.

This paper analyzes the fusion matrix as a mathematical object. The central claim is:

> The SENA formula is mathematically valid as a normalized weighted heterogeneous typed adjacency matrix on the typed node set $P\cup C$, provided that the matrix construction, normalization, and interpretation conventions are explicitly declared. It is not, by itself, an ENA projection, a causal model, a positive semidefinite kernel, or an inferential test.

## Related Mathematical and Methodological Context

The formula sits at the intersection of four established literatures. First, SNA supplies the person-person graph layer (Wasserman & Faust, 1994). Second, ENA supplies the code-code co-occurrence logic and, separately, projection methods for units of analysis (Shaffer et al., 2016; Bowman et al., 2021). Third, multilayer network theory supplies block and supra-adjacency representations for systems with multiple layers or relation types (Mucha et al., 2010; Kivela et al., 2014). Fourth, heterogeneous information network theory supplies typed nodes and typed edges (Sun & Han, 2012).

SENS and iSENS are the nearest learning-analytics precedents. They establish that SNA and ENA can provide complementary information about collaborative learning roles, discourse, group differences, and performance (Gasevic et al., 2019; Swiecki & Shaffer, 2020). However, their main contribution is an integrated analytic strategy rather than the specific typed block object represented by the SENA fusion matrix. Conversely, multilayer and heterogeneous-network theory make this block construction mathematically unsurprising, but they do not supply the learning-analytics semantics of $S$, $W$, $B$, and the person-code-pair attribution tensor $G$.

Consequently, a calibrated novelty claim is required. SENA does not invent block matrices, supra-adjacency notation, or multilayer graphs. Its contribution is the domain-specific formalization of a social-epistemic graph that keeps persons and epistemic codes as different node types while retaining social ties, epistemic co-occurrences, and person-code associations in one traceable model object. In this paper, "supra-adjacency" is used only in the broad block-representation sense, not as a claim that SENA is a strict multiplex network with the same entities replicated across layers.

## Network Schema and Notation

Let

$$
P=\{p_1,\ldots,p_n\},\qquad C=\{c_1,\ldots,c_m\}
$$

denote the person set and the code set. The typed node set is

$$
V=P\cup C,\qquad |V|=n+m,\qquad P\cap C=\varnothing.
$$

Formally, SENA defines a weighted typed graph

$$
G=(V,E,\tau,\rho,w),
$$

where $\tau(v)\in\{\mathrm{person},\mathrm{code}\}$ is a node-type map, $\rho(e)\in\{\mathrm{PP},\mathrm{CC},\mathrm{PC}\}$ is an edge-type map, and $w:E\rightarrow\mathbb{R}_{\ge 0}$ is a nonnegative weight function. Person-person edges, code-code edges, and person-code edges have different empirical meanings and must not be interpreted as if all nodes and edges were semantically identical.

## Empirical Matrices and Admissible Normalization

**Definition 1 (Social layer).** The social layer is a matrix

$$
S\in\mathbb{R}_{\ge 0}^{n\times n},
$$

where $S_{ij}$ denotes the observed interaction strength from $p_i$ to $p_j$. In an undirected baseline model, $S_{ij}=S_{ji}$. Unless stated otherwise, diagonals are set to zero before graph analysis; if self-ties or frequencies are substantively meaningful, they should be reported as node attributes or under a declared self-loop convention.

**Definition 2 (Epistemic co-occurrence layer).** The epistemic layer is a matrix

$$
W\in\mathbb{R}_{\ge 0}^{m\times m},
$$

where $W_{ab}$ denotes the co-occurrence strength between codes $c_a$ and $c_b$ within a specified unit, stanza, or moving window. In the usual ENA-style co-occurrence construction, $W_{ab}=W_{ba}$. Unless a study explicitly analyzes self-frequency as a loop, $W_{aa}=0$ and code frequencies are reported separately as node attributes.

**Definition 3 (Bridge layer).** The bridge layer is a matrix

$$
B\in\mathbb{R}_{\ge 0}^{n\times m},
$$

where $B_{ia}$ denotes the association, exposure, use, or activation strength linking person $p_i$ to code $c_a$. It should be interpreted as person-level contribution only when the data include person-specific coding evidence or an explicitly justified attribution rule.

**Definition 4 (Admissible layer normalization).** For each layer $L\in\{S,W,B\}$, an admissible normalization is a map

$$
N_L:\mathbb{R}_{\ge 0}^{d_1\times d_2}\rightarrow
\mathbb{R}_{\ge 0}^{d_1\times d_2},\qquad N_L(M)=\widehat{M},
$$

with the following properties:

1. it preserves dimensions;
2. it preserves nonnegativity;
3. for square symmetric layers $S$ and $W$, it preserves symmetry;
4. it maps the zero matrix to the zero matrix, $N_L(0)=0$;
5. for nonzero matrices, any divisor used in normalization is strictly positive.

Examples for nonzero $M$ include

$$
\widehat{M}=\frac{M}{\max_{uv}|M_{uv}|},\qquad
\widehat{M}=\frac{\log(1+M)}{\max_{uv}\log(1+M_{uv})},\qquad
\widehat{M}=\frac{M}{\|M\|_F}.
$$

The normalization rule is part of the model specification. It affects layer comparability, centrality, layout, and sensitivity to $\alpha,\beta,\gamma$.

## A Generative Construction

Let $T=\{t_1,\ldots,t_q\}$ be a set of discourse windows. Let

$$
X_{ta}=\text{activation strength of code }c_a\text{ in window }t,
$$

$$
Y_{it}=\text{participation strength of person }p_i\text{ in window }t,
$$

and let $R_{ij}$ be the observed social interaction strength from $p_i$ to $p_j$. A common SENA-compatible construction is

$$
S_{ij}=R_{ij}\quad\text{or}\quad S_{ij}=R_{ij}+R_{ji}.
$$

For $a\ne b$,

$$
W_{ab}=\sum_{t=1}^{q}X_{ta}X_{tb},\qquad W_{aa}=0
$$

unless code frequencies are explicitly modeled as self-loops or node attributes. The bridge layer can be constructed as

$$
B_{ia}=\sum_{t=1}^{q}Y_{it}X_{ta}.
$$

The $W$ equation is an ENA-style co-occurrence ingredient before unit-level normalization, rotation, or dimensional projection. It is not the full ENA modeling pipeline. The $B$ equation is a participation-weighted person-code association object. It becomes an observed contribution object only when $X$ is person-specific, for example $X_{ita}$, or when a separate attribution rule is justified.

## Assumptions

**Assumption 1 (Dimensional compatibility).** $S\in\mathbb{R}^{n\times n}$, $W\in\mathbb{R}^{m\times m}$, and $B\in\mathbb{R}^{n\times m}$.

**Assumption 2 (Nonnegativity).** $S$, $W$, $B$ have nonnegative entries and $\alpha,\beta,\gamma\ge 0$.

**Assumption 3 (Undirected baseline).** For the undirected SENA baseline, $S=S^\top$ and $W=W^\top$.

**Assumption 4 (Admissible normalization).** The matrices entering the fusion matrix are obtained through admissible normalizations. In particular, $\widehat{S}$ and $\widehat{W}$ remain symmetric and nonnegative, and $\widehat{B}$ remains nonnegative with dimension $n\times m$.

**Assumption 5 (Typed-node semantics).** The labels $p_i$ and $c_a$ belong to different node types. Distances, paths, centralities, and layouts computed from $A_{\mathrm{fusion}}$ must be interpreted with respect to this typed graph, not as if all nodes and edges were semantically identical.

## Main Results

**Proposition 1 (Dimensional consistency).** Under Assumption 1, the matrix $A_{\mathrm{fusion}}$ is an $(n+m)\times(n+m)$ matrix.

*Proof.* The upper-left block has $n$ rows and $n$ columns. The upper-right block has $n$ rows and $m$ columns. The lower-left block has $m$ rows and $n$ columns. The lower-right block has $m$ rows and $m$ columns. Therefore the block matrix has $n+m$ rows and $n+m$ columns. $\square$

**Theorem 1 (Weighted undirected heterogeneous typed graph).** Under Assumptions 1-4, $A_{\mathrm{fusion}}$ is a symmetric nonnegative adjacency matrix on the typed node set $V=P\cup C$.

*Proof.* Nonnegativity follows from nonnegative entries, nonnegative layer weights, and admissible normalizations that preserve nonnegativity. For symmetry,

$$
A_{\mathrm{fusion}}^\top =
\begin{bmatrix}
(\alpha\widehat{S})^\top & (\gamma\widehat{B}^{\top})^\top \\
(\gamma\widehat{B})^\top & (\beta\widehat{W})^\top
\end{bmatrix}
=
\begin{bmatrix}
\alpha\widehat{S} & \gamma\widehat{B} \\
\gamma\widehat{B}^{\top} & \beta\widehat{W}
\end{bmatrix}
=A_{\mathrm{fusion}},
$$

because admissible normalization preserves $\widehat{S}=\widehat{S}^{\top}$ and $\widehat{W}=\widehat{W}^{\top}$. The block locations define three edge types: person-person, code-code, and person-code. Hence $A_{\mathrm{fusion}}$ is the adjacency matrix of a weighted undirected heterogeneous typed graph. $\square$

**Corollary 1 (Laplacian positive semidefiniteness).** Let $D=\mathrm{diag}(d_u)$, where

$$
d_u=\sum_v A_{uv},
$$

and define $L=D-A_{\mathrm{fusion}}$. Under the assumptions of Theorem 1, $L$ is positive semidefinite.

*Proof.* For any $x\in\mathbb{R}^{n+m}$,

$$
x^\top Lx=\frac{1}{2}\sum_{u,v}A_{uv}(x_u-x_v)^2\ge 0,
$$

because $A_{uv}\ge 0$. Thus $L\succeq 0$. Under this Laplacian convention, diagonal self-loops do not affect the quadratic form because their contribution has $(x_u-x_u)^2=0$. $\square$

**Remark 1 (Adjacency is not a kernel).** The preceding result concerns the graph Laplacian, not the adjacency matrix itself. In general, $A_{\mathrm{fusion}}$ is not a positive semidefinite kernel or covariance matrix. A nonnegative symmetric adjacency matrix can be indefinite; for example,

$$
\begin{bmatrix}
0 & 1\\
1 & 0
\end{bmatrix}
$$

has eigenvalues $1$ and $-1$.

**Proposition 2 (Coherent boundary cases).** With admissible normalizations satisfying $N_L(0)=0$, the SENA formula has the following mathematically coherent limits:

1. If $\gamma=0$, the social and epistemic layers are disconnected.
2. If $\alpha=\beta=0$, the graph is a pure person-code bipartite graph.
3. If $B=0$, the formula reduces to a disconnected social block and epistemic block.
4. If $\alpha=0$, person-person social edges are suppressed.
5. If $\beta=0$, code-code epistemic edges are suppressed.

*Proof.* Each statement follows by substituting the specified zero value into the fusion matrix and using $N_L(0)=0$ where a zero empirical layer is normalized. $\square$

**Theorem 2 (No direct contradiction with ENA projection).** The claim that SNA and ENA cannot be shown in one model because SNA is not dimensionally reduced while ENA is dimensionally reduced is false when SENA is constructed as the SENA fusion matrix and then embedded by a declared graph embedding operator.

*Proof.* Let $\Phi$ be an explicitly chosen embedding operator, for example spectral embedding, Laplacian eigenmaps, or multidimensional scaling on graph distances. The displayed coordinates are then

$$
Z=\Phi(A_{\mathrm{fusion}})\in\mathbb{R}^{(n+m)\times d}.
$$

The coordinates are derived from the joint object $A_{\mathrm{fusion}}$, not by placing raw SNA nodes into a pre-existing ENA projection. Hence the dimensionality of a prior ENA display does not prevent a joint SENA embedding. What is invalid is a different operation: visually overlaying a raw social graph onto an ENA space and then interpreting all cross-type distances as if they came from one common model. $\square$

Analytical embedding and visual layout are distinct. A force-directed layout can be useful for exploratory display, but its distances, angles, and clusters should not be given the same metric or inferential interpretation as a declared analytical embedding unless that interpretation is separately justified.

## Person-Code-Pair Attribution

The bridge matrix $B$ records which persons are associated with which codes under the chosen participation and coding scheme. ENA edges, however, are code-code relations. To attribute an ENA edge to persons, define a person-code-pair attribution tensor

$$
G_{i,ab}=\text{participation-weighted association of }p_i\text{ with the code pair }(c_a,c_b).
$$

A compatible estimator is

$$
G_{i,ab}=\sum_{t=1}^{q}Y_{it}X_{ta}X_{tb}.
$$

This tensor is useful for reporting person-code-pair association, but it is not a block of $A_{\mathrm{fusion}}$. Moreover, without person-specific code-pair evidence, $G_{i,ab}$ does not prove that person $i$ supported the code-code connection. A cautious interpretation is: person $i$ was associated, through participation, with windows containing the code pair. Stronger claims require person-specific coded records, such as $X_{ita}$, or a transparent attribution model.

## Normalization and Identifiability

The layer weights $\alpha,\beta,\gamma$ are interpretable only relative to the normalization rule. In the raw, unnormalized formulation,

$$
A_{\mathrm{raw}} =
\begin{bmatrix}
\alpha S & \gamma B\\
\gamma B^\top & \beta W
\end{bmatrix},
$$

there is an exact scale invariance.

**Proposition 3 (Unnormalized scale invariance).** Let $c_S,c_W,c_B>0$. Replacing $S,W,B$ by $c_SS,c_WW,c_BB$ and replacing $\alpha,\beta,\gamma$ by $\alpha/c_S,\beta/c_W,\gamma/c_B$ leaves $A_{\mathrm{raw}}$ unchanged.

*Proof.* Substitute the rescaled matrices and rescaled weights into $A_{\mathrm{raw}}$. Each block is unchanged. $\square$

This proposition does not directly apply to the normalized matrix $A_{\mathrm{fusion}}$. For example, max normalization and Frobenius normalization often satisfy $N(cM)=N(M)$ for $c>0$, while logarithmic normalization generally does not reduce to simple linear rescaling. Thus, in the normalized SENA formulation, raw scale is handled by the declared normalization convention, and $\alpha,\beta,\gamma$ should be interpreted only after that convention is fixed.

**Corollary 2.** Any empirical SENA report must disclose the normalization rule before interpreting $\alpha,\beta,\gamma$.

## Typed Centrality and Layout Interpretation

Typed graph centrality requires caution. A person node and a code node can both have degree, betweenness, eigenvector centrality, or PageRank scores, but these scores mix different empirical meanings: social activity, code prevalence, and cross-type bridging. Directly ranking persons and codes on a single centrality list is therefore usually misleading.

A SENA report should distinguish at least four quantities:

1. within-type person-person measures on the $S$ block;
2. within-type code-code measures on the $W$ block;
3. cross-type bridge measures on the $B$ block;
4. whole-graph typed measures, interpreted as measures of position in the social-epistemic graph rather than as type-free importance.

Where appropriate, researchers should use block-normalized centrality, bipartite centrality, or meta-path measures. Layouts and embeddings should be reported with the operator, parameters, and random seed if stochastic.

## Directed and Temporal Extensions

If $S\ne S^\top$, the same block construction defines a directed heterogeneous graph rather than an undirected one. The undirected Laplacian result above does not apply without additional directed-graph choices, such as an out-degree Laplacian, a random-walk operator, a symmetrized Laplacian, or another explicitly stated construction.

For directed SENA, a more general bridge model is

$$
A_{\mathrm{directed}} =
\begin{bmatrix}
\alpha\widehat{S} & \gamma_{\mathrm{out}}\widehat{B}^{PC}\\
\gamma_{\mathrm{in}}\widehat{B}^{CP} & \beta\widehat{W}
\end{bmatrix},
$$

where $\widehat{B}^{PC}\in\mathbb{R}_{\ge 0}^{n\times m}$ represents person-to-code activation and $\widehat{B}^{CP}\in\mathbb{R}_{\ge 0}^{m\times n}$ represents code-to-person uptake, attribution, feedback, or recommendation. These two blocks need not be transposes of each other in a genuinely directed model.

For temporal analysis, define

$$
A_{\mathrm{fusion}}(t)=
\begin{bmatrix}
\alpha\widehat{S}(t) & \gamma\widehat{B}(t)\\
\gamma\widehat{B}(t)^\top & \beta\widehat{W}(t)
\end{bmatrix}.
$$

Temporal change can be studied using

$$
\Delta A(t_1,t_2)=A_{\mathrm{fusion}}(t_2)-A_{\mathrm{fusion}}(t_1),
$$

or by distances such as Frobenius distance, spectral distance, graph edit distance, or permutation-tested group/time contrasts. Cross-time comparisons require a declared normalization policy. A global denominator preserves information about absolute intensity changes, while within-time normalization emphasizes relative structural changes and can hide changes in overall magnitude.

## Failure Modes and Counterexamples

**Example 1 (Projection error).** If a researcher places person nodes from an SNA graph onto a previously computed ENA unit space and interprets person-code distances as distances from a common model, the interpretation is invalid. The coordinates were not jointly estimated from $A_{\mathrm{fusion}}$.

**Example 2 (Layer dominance).** If $S$ contains counts in the hundreds while $W$ and $B$ contain binary values, then centrality or layout on the unnormalized matrix is dominated by the social layer. This is a scale artifact, not a substantive social-epistemic finding.

**Example 3 (Coding unreliability).** If code assignments are unstable, then $W$, $B$, and $G$ inherit that instability. A formally valid matrix can still be empirically unreliable.

**Example 4 (Attribution error).** If several learners participate in the same window, assigning every code or code pair in that window to every participant can overstate individual contribution. Such estimates should be labeled association or exposure unless person-specific coding evidence is available.

## Statistical Validation Framework

A publication-grade SENA study should report:

1. the data contract: persons, interactions, windows/stanzas, coded segments, and codebook;
2. exact formulas for $S$, $W$, $B$, and, if used, $G$;
3. the normalization rule;
4. sensitivity analyses over $(\alpha,\beta,\gamma)$;
5. the embedding operator $\Phi$, including random seed if stochastic;
6. coding reliability or human-reviewed AI coding procedures;
7. evidence traceability from each edge to source records;
8. null models or resampling tests for group and temporal claims.

The following claim-to-validation table makes the validation requirement explicit.

| Claim type | Required data | Matrix or statistic | Suitable validation |
|---|---|---|---|
| Person used a code | Person-specific coded records | $B_{ia}$ or $X_{ita}$ | audit trail to coded segments |
| Person supported a code-code connection | Person-specific code-pair evidence | $G_{i,ab}$ | attribution audit or permutation over speaker labels |
| Group has stronger epistemic structure | comparable coded windows by group | $W$ or projected ENA/SENA summaries | group-label permutation or bootstrap over windows |
| Bridge strength differs by group | person-code associations | $B$ summaries | bipartite null model or group permutation |
| Temporal change is meaningful | comparable time snapshots | $\Delta A$ or graph distances | temporal-band permutation or bootstrap |
| Centrality dominance is substantive | stable layer scaling and typed interpretation | typed centrality | sensitivity over normalization and layer weights |

Useful null models include code-label shuffling within learners, social-edge rewiring with degree preservation, stanza membership shuffling within temporal bands, group-label permutation, and bootstrap resampling of windows.

## Discussion

The formal analysis supports the mathematical reasonableness of the SENA formula, but it also narrows the permissible interpretation. The formula does not magically convert SNA and ENA into one latent space. Rather, it constructs a joint typed graph. A shared coordinate system becomes meaningful only after a specified embedding or matrix factorization is applied to that joint graph.

The most defensible theoretical language is therefore:

> SENA represents collaborative learning as a heterogeneous typed social-epistemic graph whose block-adjacency matrix combines person-person social ties, code-code epistemic co-occurrences, and person-code associations.

This wording connects SENA to established mathematics while preserving its substantive contribution for learning analytics.

## Conclusion

Under explicit dimensional, nonnegativity, symmetry, admissible-normalization, and typed-node conditions, the SENA fusion matrix

$$
A_{\mathrm{fusion}} =
\begin{bmatrix}
\alpha\widehat{S} & \gamma\widehat{B}\\
\gamma\widehat{B}^{\top} & \beta\widehat{W}
\end{bmatrix}
$$

is a valid weighted typed adjacency matrix. Its graph Laplacian is positive semidefinite in the undirected case under the declared convention, boundary cases reduce to recognizable SNA, ENA-style co-occurrence, and bipartite submodels, and joint embeddings are mathematically permissible when they are computed from $A_{\mathrm{fusion}}$ itself. The formula becomes a rigorous research method only when matrix construction, admissible normalization, typed interpretation, embedding, statistical testing, attribution limits, and evidence traceability are fully specified.

## References

Bowman, D. A., Swiecki, Z., Cai, Z., Eagan, B., Linder, R., Ruis, A. R., ... & Shaffer, D. W. (2021). The mathematical foundations of epistemic network analysis. In A. R. Ruis & S. B. Lee (Eds.), *Advances in Quantitative Ethnography* (pp. 91-105). Springer. https://doi.org/10.1007/978-3-030-67788-6_7

Gasevic, D., Joksimovic, S., Eagan, B. R., & Shaffer, D. W. (2019). SENS: Network analytics to combine social and cognitive perspectives of collaborative learning. *Computers in Human Behavior, 92*, 562-577. https://doi.org/10.1016/j.chb.2018.07.003

Kivela, M., Arenas, A., Barthelemy, M., Gleeson, J. P., Moreno, Y., & Porter, M. A. (2014). Multilayer networks. *Journal of Complex Networks, 2*(3), 203-271. https://doi.org/10.1093/comnet/cnu016

Mucha, P. J., Richardson, T., Macon, K., Porter, M. A., & Onnela, J.-P. (2010). Community structure in time-dependent, multiscale, and multiplex networks. *Science, 328*(5980), 876-878. https://doi.org/10.1126/science.1184819

Shaffer, D. W., Collier, W., & Ruis, A. R. (2016). A tutorial on epistemic network analysis: Analyzing the structure of connections in cognitive, social, and interaction data. *Journal of Learning Analytics, 3*(3), 9-45. https://doi.org/10.18608/jla.2016.33.3

Siebert-Evenstone, A., Arastoopour Irgens, G., Collier, W., Swiecki, Z., Ruis, A. R., & Williamson Shaffer, D. (2017). In search of conversational grain size: Modelling semantic structure using moving stanza windows. *Journal of Learning Analytics, 4*(3), 123-139. https://doi.org/10.18608/jla.2017.43.7

Sun, Y., & Han, J. (2012). *Mining Heterogeneous Information Networks: Principles and Methodologies*. Morgan & Claypool. https://doi.org/10.2200/S00433ED1V01Y201207DMK005

Swiecki, Z., & Shaffer, D. W. (2020). iSENS: An integrated approach to combining epistemic and social network analyses. In V. Kovanovic, M. Scheffel, N. Pinkwart, & K. Verbert (Eds.), *LAK20 Conference Proceedings: Celebrating 10 Years of LAK: Shaping the Future of the Field* (pp. 305-313). Association for Computing Machinery. https://doi.org/10.1145/3375462.3375505

Wasserman, S., & Faust, K. (1994). *Social Network Analysis: Methods and Applications*. Cambridge University Press.
