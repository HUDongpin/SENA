# SENA Web-based Tool 设计稿与开发规格 v0.1

> SENA = SNA + ENA + social–epistemic bridge。目标不是把 SNA 图和 ENA 图机械叠加，而是把人—人互动、概念—概念共现、人与概念贡献关系建模为一个三层异构网络，并在同一个 canvas 中进行可视化、交互、解释和导出。

---

## 1. 产品定位

### 1.1 核心问题

协作学习、在线讨论、团队知识建构和课堂互动数据中，研究者通常同时关心两件事：

1. 谁与谁互动？这是 SNA 的社会层问题。
2. 哪些概念、论证动作或认知活动彼此连接？这是 ENA 的认识论/概念层问题。
3. 谁在推动哪些概念连接？这是 SENA 的社会—认识论桥接问题。

SENA 工具的核心任务是把这三类问题放入同一套数据模型和同一张交互式图中。

### 1.2 工具定位

建议将产品命名为 **SENA Fusion Studio**，包含四个工作区：

1. **Data Workspace**：上传、清洗、预览和校验数据。
2. **Model Builder**：构造 S、W、B 三类矩阵，设置 stanza/window、归一化、权重。
3. **Fusion Canvas**：展示三层网络，并提供 SNA、ENA、SENA 三种视图切换。
4. **Evidence & Export**：回溯原始语料证据，导出图片、矩阵、报告和复现实验配置。

---

## 2. 数学模型

### 2.1 节点集合

\[
P = \{p_1, p_2, ..., p_n\}
\]

表示学习者、参与者、教师、小组、角色或组织单元。

\[
C = \{c_1, c_2, ..., c_m\}
\]

表示 ENA codes，例如 Question、Hypothesis、Evidence、Explanation、Reflection、Coordination 等。

### 2.2 SNA 社会层

\[
S \in \mathbb{R}^{n \times n}
\]

\[
S_{ij} = \text{person } i \text{ 与 person } j \text{ 的互动强度}
\]

互动强度可以来自：回复、提及、共同编辑、同组协作、相邻话轮、消息引用、共同完成任务、教师指定互动等。

可选属性：

- directed / undirected
- weighted / unweighted
- time-sliced / cumulative
- multiplex channels，例如 reply、mention、co-edit、same-table

### 2.3 ENA 概念层

\[
W \in \mathbb{R}^{m \times m}
\]

\[
W_{ab} = \text{code } a \text{ 与 code } b \text{ 在同一 stanza/window 中的共现强度}
\]

ENA 构造建议：

1. 将话语划分为 conversation units 或 analysis units。
2. 每个 unit 内按照 stanza、moving window 或 turn window 计算 code co-occurrence。
3. 每个 unit 生成一个 code-pair connection vector。
4. 所有 unit 可投影到 ENA space；同时也保留原始或归一化后的 W 用于概念网络图。

### 2.4 社会—认识论桥接层

\[
B \in \mathbb{R}^{n \times m}
\]

\[
B_{ia} = \text{person } i \text{ 对 code } a \text{ 的贡献、使用或激活强度}
\]

基础版本：person–code 贡献。

增强版本：person–code-pair 贡献。

\[
G_{i,ab} = \text{person } i \text{ 对 code pair } (a,b) \text{ 的贡献}
\]

如果研究重点是“谁推动了 Evidence–Explanation 的连接”，则 G 比 B 更有解释力。

### 2.5 融合矩阵

\[
A_{fusion} =
\begin{bmatrix}
\alpha S & \gamma B \\
\gamma B^T & \beta W
\end{bmatrix}
\]

其中：

- \(\alpha\)：社会层权重
- \(\beta\)：概念层权重
- \(\gamma\)：社会—认识论桥接层权重

注意：S、W、B 通常不在同一量纲上，必须先做层内归一化，再做跨层缩放。

---

## 3. 三种坐标/布局模式

### 3.1 Mode A：Explanatory Fusion Layout

用途：教学、仪表盘、概念展示、快速探索。

特点：

- person nodes 放在外围或社会层布局位置。
- concept nodes 放在中心或 ENA node positions。
- SNA、ENA、SENA 三类边用不同视觉语法区分。
- 不允许把 person–concept 距离解释为严格统计距离。

UI 必须显示提示：

> 当前为解释型布局。跨层距离主要用于可读性，不代表统一 latent space 中的统计距离。

### 3.2 Mode B：ENA Unit Space + SNA Edges

用途：当每个 learner / team 是 ENA 的 unit of analysis 时。

特点：

- learner 的二维位置来自 ENA projection。
- learner–learner 的 SNA 边叠加在 ENA unit space 上。
- 节点距离表示 epistemic network 差异。
- 边粗表示社会互动强度。
- 适合解释“社会互动是否连接了认识论相近/不同的人”。

限制：

- 概念节点可作为 ENA loading/node positions 显示，但不能与 learner 的位置混淆。
- 互动强度不由空间距离表达，而由边的视觉属性表达。

### 3.3 Mode C：Joint Embedding

用途：当开发者想让人节点和概念节点共享同一个 latent space。

做法：

1. 构造 \(A_{fusion}\)。
2. 对 S、W、B 分别归一化。
3. 根据研究问题设置 \(\alpha, \beta, \gamma\)。
4. 使用 spectral embedding、joint matrix factorization、multilayer MDS、graph embedding 或 tensor model。
5. 输出 person 与 concept 的共同二维坐标。

特点：

- 只有此模式下，person–concept 距离可以被解释为同一个模型中的近远关系。
- 必须导出模型参数、随机种子、归一化方式和权重设置。

---

## 4. 数据输入规格

### 4.1 people.csv

| 字段 | 类型 | 必需 | 说明 |
|---|---:|---:|---|
| person_id | string | yes | 参与者唯一 ID |
| label | string | yes | 显示名称 |
| group_id | string | no | 小组或条件 |
| role | string | no | 角色，如 coordinator、builder |
| attributes | json | no | 年级、性别、能力水平等扩展字段 |

### 4.2 interactions.csv

| 字段 | 类型 | 必需 | 说明 |
|---|---:|---:|---|
| source | string | yes | 发起者 person_id |
| target | string | yes | 接收者 person_id |
| timestamp | datetime | no | 时间 |
| weight | number | no | 互动权重，默认 1 |
| channel | string | no | reply、mention、co-edit 等 |
| context_id | string | no | 讨论串、任务、小组活动 ID |

### 4.3 utterances.csv

| 字段 | 类型 | 必需 | 说明 |
|---|---:|---:|---|
| utterance_id | string | yes | 话语 ID |
| person_id | string | yes | 说话人 |
| text | string | yes | 原始话语 |
| timestamp | datetime | no | 时间 |
| turn_index | integer | no | 话轮顺序 |
| context_id | string | no | 讨论串/任务 ID |

### 4.4 coded_segments.csv

| 字段 | 类型 | 必需 | 说明 |
|---|---:|---:|---|
| segment_id | string | yes | 编码片段 ID |
| utterance_id | string | yes | 对应话语 ID |
| person_id | string | yes | 贡献者 |
| unit_id | string | yes | ENA analysis unit |
| stanza_id | string | yes | 共现窗口 ID |
| codes | array/string | yes | 该片段包含的 codes |
| coder_id | string | no | 编码者 |
| confidence | number | no | 自动编码置信度或人工一致性 |

### 4.5 codebook.csv

| 字段 | 类型 | 必需 | 说明 |
|---|---:|---:|---|
| code_id | string | yes | code 唯一 ID |
| label | string | yes | 显示标签 |
| family | string | no | code 家族，如 argumentation、metacognition |
| description | string | no | 操作性定义 |
| color | string | no | 可视化颜色 |

---

## 5. 后端计算流程

### 5.1 数据校验

必须检查：

1. 所有 source/target/person_id 是否存在于 people 表。
2. coded_segments 中的 codes 是否存在于 codebook。
3. timestamp 或 turn_index 是否能形成稳定顺序。
4. unit_id 和 stanza_id 是否足以支持 ENA 共现计算。
5. 是否存在孤立节点、极端权重、重复记录。

### 5.2 构造 S

伪代码：

```python
for interaction in interactions:
    i = person_index[interaction.source]
    j = person_index[interaction.target]
    S[i, j] += interaction.weight
    if undirected:
        S[j, i] += interaction.weight
```

可选归一化：

- row-normalization
- max-scaling
- log1p scaling
- z-score within layer
- time-window normalization

### 5.3 构造 W

伪代码：

```python
for stanza in stanzas:
    active_codes = unique_codes_in(stanza)
    for a, b in combinations(active_codes, 2):
        W[a, b] += stanza.weight
        W[b, a] += stanza.weight
```

可选：按 unit 生成 \(W_u\)，再聚合为 group-level 或 whole-class-level \(W\)。

### 5.4 构造 B

基础 person–code：

```python
for segment in coded_segments:
    i = person_index[segment.person_id]
    for code in segment.codes:
        a = code_index[code]
        B[i, a] += segment.weight or 1
```

增强 person–code-pair：

```python
for stanza in stanzas:
    for person in persons_in(stanza):
        codes_by_person = codes_contributed_by(person, stanza)
        codes_in_stanza = all_codes(stanza)
        for a in codes_by_person:
            for b in codes_in_stanza:
                if a != b:
                    G[person, pair(a,b)] += contribution_rule(person, a, b, stanza)
```

贡献分配规则可以有三种：

1. **Speaker-owned**：谁说出了 code，贡献归谁。
2. **Window-shared**：同一 stanza 内所有参与者按份额共享 code-pair 贡献。
3. **Turn-causal**：后续 code 与前序 code 的连接按时间顺序归因给触发者。

---

## 6. 前端 Fusion Canvas 设计

### 6.1 视觉语法

| 数据对象 | 图形 | 默认视觉编码 |
|---|---|---|
| Person / learner | 圆形节点 | 蓝色边框，头像或 initials |
| Concept / code | 六边形节点 | 紫/橙/粉渐变，图标或 code label |
| SNA edge S_ij | 蓝色实线 | 粗细 = 互动强度；方向 = 箭头 |
| ENA edge W_ab | 紫色虚线 | 粗细 = code-pair 共现强度 |
| SENA bridge B_ia | 渐变 ribbon | 粗细 = person 对 code 的贡献 |
| Group / condition | hull 或背景区域 | 半透明轮廓 |
| Time | scrubber / animation | 时间切片与轨迹 |

### 6.2 Canvas 区域布局

建议桌面端采用三栏布局：

```text
┌───────────────────────────────────────────────────────────────┐
│ Header: dataset name · view mode SNA/ENA/SENA · export        │
├───────────────┬───────────────────────────────┬───────────────┤
│ Left Panel    │ Main Fusion Canvas             │ Right Panel   │
│ Data/Model    │ network visualization           │ Inspector     │
│ controls      │ legends + interaction layers    │ metrics       │
├───────────────┴───────────────────────────────┴───────────────┤
│ Bottom Panel: timeline · group comparison · evidence drawer   │
└───────────────────────────────────────────────────────────────┘
```

### 6.3 左侧控制面板

组件：

1. Dataset selector
2. Unit selector：learner / team / class / condition
3. Time window selector
4. Stanza definition：whole conversation / moving window / adjacent turns / custom segment
5. Layer toggles：SNA、ENA、SENA
6. Weight sliders：α、β、γ
7. Normalization selector
8. Layout mode selector：Explanatory / ENA Space / Joint Embedding
9. Threshold sliders：edge weight cutoff、top-k edges

### 6.4 主画布

基本交互：

- hover node：高亮一跳邻居、显示快速指标。
- click node：右侧 inspector 显示详情。
- click edge：显示该边的原始证据、时间分布、贡献者。
- brush select：选择一组节点进行子图分析。
- pin node：固定关键节点位置。
- compare mode：显示两组差异边，例如 Treatment - Control。
- time animation：展示从早期到晚期的 S/W/B 演化。

### 6.5 右侧 Inspector

当选择 person：

- SNA degree / strength / betweenness / closeness
- top interacted persons
- top contributed codes
- top contributed code-pairs
- alignment with group ENA centroid
- raw evidence snippets

当选择 concept：

- ENA weighted degree
- top co-occurring concepts
- top contributing persons
- contribution over time
- group difference

当选择 social edge：

- source、target、weight、channel
- interaction timeline
- transcript evidence

当选择 concept edge：

- code pair、co-occurrence weight
- contributing stanzas
- contributing persons
- representative excerpts

当选择 bridge edge：

- person、code、contribution weight
- utterances supporting the contribution
- whether contribution is speaker-owned、shared 或 causal

---

## 7. SENA 指标建议

### 7.1 Bridge Score

衡量某人是否在社会互动与概念推进之间起桥接作用。

一个可实现版本：

\[
Bridge_i = z(strength_i^S) \cdot z(contribution_i^B)
\]

其中：

- \(strength_i^S = \sum_j S_{ij}\)
- \(contribution_i^B = \sum_a B_{ia}\)

增强版本可加入 betweenness：

\[
Bridge_i = \lambda_1 z(strength_i^S) + \lambda_2 z(betweenness_i^S) + \lambda_3 z(\sum_a B_{ia})
\]

### 7.2 Epistemic Diversity

衡量某人贡献 codes 的分布是否多样。

\[
D_i = - \sum_a p_{ia}\log(p_{ia})
\]

其中：

\[
p_{ia} = \frac{B_{ia}}{\sum_a B_{ia}}
\]

### 7.3 Social–Epistemic Alignment

衡量一个人的社会邻居是否与其概念贡献相似。

\[
Align_i = cosine(B_i, \sum_j S_{ij}B_j)
\]

解释：如果一个人的互动对象贡献的概念结构与他自己相似，则 alignment 高。

### 7.4 Concept Brokerage

衡量某人是否推动跨概念连接，特别是弱连接或关键连接。

\[
CB_i = \sum_{a<b} G_{i,ab} \cdot rarity(W_{ab})
\]

其中 rarity 可定义为：

\[
rarity(W_{ab}) = \frac{1}{\epsilon + W_{ab}}
\]

注意：此指标适合发现“少数但关键的概念桥接者”。

### 7.5 Group SENA Difference

比较两组的融合矩阵差异：

\[
\Delta A = A_{fusion}^{group1} - A_{fusion}^{group2}
\]

图上可显示：

- group1 更强的边：蓝/紫加深
- group2 更强的边：橙/红加深
- 无显著差异：灰色或隐藏

---

## 8. API 设计草案

### 8.1 创建数据集

```http
POST /api/datasets
```

请求：multipart files 或 JSON manifest。

返回：

```json
{
  "dataset_id": "ds_001",
  "status": "validated",
  "warnings": ["3 isolated people", "2 unknown codes removed"]
}
```

### 8.2 构建 SENA 模型

```http
POST /api/models/sena/build
```

请求：

```json
{
  "dataset_id": "ds_001",
  "unit": "team",
  "stanza": {
    "type": "moving_window",
    "size": 4,
    "step": 1
  },
  "sna": {
    "directed": true,
    "aggregation": "reply",
    "normalization": "log1p_max"
  },
  "ena": {
    "cooccurrence": "within_stanza",
    "normalization": "sphere_norm",
    "projection": "svd"
  },
  "bridge": {
    "type": "person_code",
    "contribution_rule": "speaker_owned"
  },
  "fusion": {
    "alpha": 0.7,
    "beta": 0.7,
    "gamma": 1.0,
    "layout_mode": "explanatory"
  }
}
```

返回：

```json
{
  "model_id": "sena_001",
  "matrices": {
    "S": "/api/models/sena_001/matrices/S",
    "W": "/api/models/sena_001/matrices/W",
    "B": "/api/models/sena_001/matrices/B",
    "A_fusion": "/api/models/sena_001/matrices/A_fusion"
  },
  "visualization": "/api/models/sena_001/graph",
  "metrics": "/api/models/sena_001/metrics"
}
```

### 8.3 获取图数据

```http
GET /api/models/{model_id}/graph?time=t1&threshold=0.05&layers=sna,ena,sena
```

返回：

```json
{
  "nodes": [
    {"id":"p_A", "type":"person", "label":"A", "role":"Coordinator", "x":425, "y":84},
    {"id":"c_Evidence", "type":"concept", "label":"Evidence", "x":545, "y":305}
  ],
  "edges": [
    {"id":"s_A_E", "type":"sna", "source":"p_A", "target":"p_E", "weight":0.92},
    {"id":"w_Question_Evidence", "type":"ena", "source":"c_Question", "target":"c_Evidence", "weight":0.76},
    {"id":"b_A_Question", "type":"sena", "source":"p_A", "target":"c_Question", "weight":0.89}
  ],
  "layout": {
    "mode":"explanatory",
    "distance_interpretation":"cross-layer distances are not statistical"
  }
}
```

### 8.4 获取证据

```http
GET /api/models/{model_id}/evidence?edge_id=w_Question_Evidence
```

返回：

```json
{
  "edge_id": "w_Question_Evidence",
  "evidence": [
    {
      "utterance_id": "u_084",
      "person_id": "p_A",
      "text": "What evidence supports this hypothesis?",
      "codes": ["Question", "Evidence"],
      "timestamp": "2026-05-28T10:14:23Z"
    }
  ]
}
```

---

## 9. 前端组件拆分

建议组件结构：

```text
SenaApp
├── HeaderBar
├── DatasetPanel
├── ModelControlPanel
│   ├── StanzaSelector
│   ├── LayerToggle
│   ├── WeightSliders
│   ├── NormalizationSelector
│   └── LayoutModeSelector
├── FusionCanvas
│   ├── PeopleLayer
│   ├── ConceptLayer
│   ├── SocialEdgeLayer
│   ├── ConceptEdgeLayer
│   ├── BridgeRibbonLayer
│   ├── LabelsLayer
│   └── InteractionOverlay
├── InspectorPanel
│   ├── NodeInspector
│   ├── EdgeInspector
│   ├── MetricsPanel
│   └── EvidencePanel
├── TimelinePanel
├── MatrixView
└── ExportDialog
```

### 9.1 状态管理核心对象

```ts
type LayoutMode = 'explanatory' | 'ena_space' | 'joint_embedding';
type LayerType = 'sna' | 'ena' | 'sena';

type NodeType = 'person' | 'concept';

type SenaNode = {
  id: string;
  type: NodeType;
  label: string;
  group?: string;
  role?: string;
  x?: number;
  y?: number;
  metrics?: Record<string, number>;
};

type SenaEdge = {
  id: string;
  type: LayerType;
  source: string;
  target: string;
  weight: number;
  directed?: boolean;
  evidenceCount?: number;
  timeSeries?: Array<{t: string; weight: number}>;
};

type SenaGraph = {
  nodes: SenaNode[];
  edges: SenaEdge[];
  layout: {
    mode: LayoutMode;
    seed?: number;
    alpha: number;
    beta: number;
    gamma: number;
    normalization: string;
    distanceInterpretation: string;
  };
};
```

---

## 10. 研究严谨性保护机制

SENA 工具必须内置解释保护，避免用户误解。

### 10.1 坐标解释提示

每种布局模式都要显示不同提示：

- Explanatory：跨层距离不可作为统计距离解释。
- ENA Space：person 位置来自 ENA projection；SNA 边只表示互动强度。
- Joint Embedding：跨层距离可解释，但依赖融合矩阵、权重和归一化设定。

### 10.2 权重敏感性分析

提供 α、β、γ 的 sensitivity panel：

- 用户拖动权重时，显示核心指标变化。
- 提供 recommended presets：social-heavy、epistemic-heavy、balanced、bridge-heavy。
- 导出时必须保存权重。

### 10.3 阈值透明性

任何 edge filtering 必须可追踪：

- 显示隐藏了多少条边。
- 支持“show hidden edges”。
- 导出图时保存 threshold 与 top-k 设置。

### 10.4 证据回溯

任何边都必须能回到原始数据：

- SNA edge → interactions records
- ENA edge → stanzas / utterances containing both codes
- SENA bridge → person 的具体 coded segments

---

## 11. 最小可行产品 MVP

### Sprint 1：数据与矩阵

- 上传 people、interactions、coded_segments、codebook。
- 构造 S、W、B。
- 显示矩阵预览和基本统计。

### Sprint 2：基础 Canvas

- 实现 person nodes、concept nodes、三类边。
- 支持 layer toggle、edge threshold、hover/click。
- 实现右侧 inspector。

### Sprint 3：ENA 与证据

- 实现 stanza/window ENA co-occurrence。
- 实现 ENA connection vector 导出。
- 实现 edge evidence drawer。

### Sprint 4：融合与研究功能

- 实现三种布局模式。
- 实现 α、β、γ 权重调节。
- 实现 SENA 指标、group comparison、time slicing。
- 导出 SVG/PNG/JSON/报告。

---

## 12. 设计底线

1. SNA、ENA、SENA 三类边必须视觉上明确区分。
2. 不同层的权重必须先归一化，不能直接用原始计数比较粗细。
3. 布局模式必须显式标注，否则用户会误解距离。
4. 每条边都应能追溯到原始证据。
5. 导出图像时必须同步导出模型配置，保证研究可复现。
6. 如果要解释 person–concept 的空间距离，必须使用 Joint Embedding 或明确说明当前是解释型布局。

---

## 13. 推荐默认配置

```json
{
  "layout_mode": "explanatory",
  "alpha": 0.7,
  "beta": 0.7,
  "gamma": 1.0,
  "sna_normalization": "log1p_max",
  "ena_normalization": "sphere_norm",
  "bridge_normalization": "row_l1_then_max",
  "edge_threshold": 0.05,
  "show_labels": true,
  "show_evidence_on_click": true,
  "distance_warning": true
}
```

---

## 14. 一句话产品原则

SENA 工具不是把 SNA 图和 ENA 图叠加，而是让用户在同一张可追溯、可复现、可切换解释模式的 fusion canvas 中回答：

> 谁和谁互动，哪些想法彼此连接，以及谁在推动哪些想法连接？
