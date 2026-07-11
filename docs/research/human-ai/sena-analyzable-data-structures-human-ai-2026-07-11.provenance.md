# Provenance：SENA 可分析的数据结构与 Human–AI 扩展

对应简报：sena-analyzable-data-structures-human-ai-2026-07-11.md

检索与核验日期：2026-07-11（Asia/Hong_Kong）

## 1. 研究问题

1. 教育技术、Learning Analytics 与 Learning Sciences 文献支持哪些 SENA-compatible 数据单元、关系与时间结构？
2. 当前本地 SENA 实现实际读取哪些字段并构造 S、W、B_PC、B_CP、G 与 temporal windows？
3. 哪些教育数据可以直接、经转换后或不适合由 SENA 分析？
4. SENA 如何从 Human–Human 扩展到 Human–AI，而不把 AI 误建模为 person？
5. 支持研究级解释、比较与推断还需要哪些 reliability、provenance、governance 与 sampling 条件？

## 2. 方法

- 路线 A：读取当前 SENA contract、importer、model、temporal runtime、audit、reliability 与正式数学分析。
- 路线 B：检索 ENA/SENS/iSENS、CSCL、temporal learning analytics、MMLA、SRL/SSRL、Human–AI learning 的一手论文和公开规范。
- 路线 C：独立方法核验，审查 window、unit of analysis、nesting、missingness、coding reliability、directed bridge、Human–AI drift 与 causal overclaim。
- 路线 D：独立本地 reviewer 以字段和行号核对“当前支持、需扩展、理论不适合”。
- 综合时区分：
  - source fact：论文、标准或当前代码明确陈述；
  - local implementation fact：本地文件可直接核验；
  - design inference：为 SENA v2 提出的综合设计，不宣称是某一文献的现成标准。

这是一份 targeted deep research brief，不是按 PRISMA 注册的系统综述或 meta-analysis。

## 3. 核心外部来源与使用方式

| 来源 | 类型 | 支持的主张 |
|---|---|---|
| [Gašević et al., SENS](https://doi.org/10.1016/j.chb.2018.07.003) | 同行评审论文 | 社会关系与 discourse/ENA 的互补分析；MOOC/forum 类数据 |
| [Swiecki & Shaffer, iSENS](https://doi.org/10.1145/3375462.3375505) | 同行评审会议论文、开放 PDF | 同时建模 cognitive/social connections；team/turn/window 数据 |
| [Shaffer et al., ENA tutorial](https://doi.org/10.18608/jla.2016.33.3) | 同行评审教程 | coded data、connections、units、dynamic network interpretation |
| [Bowman et al., Mathematical Foundations](https://doi.org/10.1007/978-3-030-67788-6_7) | 同行评审章节 | coded discourse 到 adjacency、unit networks 与 projection |
| [Siebert-Evenstone et al.](https://doi.org/10.18608/jla.2017.43.7) | 同行评审论文 | moving stanza、conversational grain size、window sensitivity |
| [rENA documentation](https://rdrr.io/cran/rENA/man/ena.html) | 当前软件文档 | data、codes、units、conversation、window 的明确输入契约 |
| [Molenaar & Wise](https://doi.org/10.18608/hla22.007) | SoLAR Handbook | passage/order、时间粒度与 segmentation |
| [Reimann](https://doi.org/10.1007/s11412-009-9070-z) | 同行评审论文 | CSCL process/event-centered analysis 的必要性 |
| [Chi & Wylie, ICAP](https://doi.org/10.1080/00461520.2014.965823) | 同行评审论文 | 理论驱动的外显学习活动 coding |
| [Di Mitri et al.](https://doi.org/10.1111/jcal.12288) | 同行评审论文 | multimodal signal 到 learning construct 的映射 |
| [Ochoa & Worsley](https://doi.org/10.18608/jla.2016.32.10) | 同行评审论文 | MMLA 数据与时间对齐 |
| [Molenaar](https://doi.org/10.1111/ejed.12527) | 同行评审论文 | hybrid human–AI、detect-diagnose-act、automation/control |
| [Järvelä et al.](https://doi.org/10.1111/bjet.13325) | 同行评审论文、开放机构副本 | Human–AI shared regulation 与 hybrid system |
| [DRIVE](https://doi.org/10.1016/j.caeai.2025.100497) | 同行评审论文 | 从学生 steering 与 visible expertise 分析 GenAI 对话 |
| [Edwards et al.](https://doi.org/10.1111/bjet.13534) | 同行评审论文 | AI agents 支持 socially shared regulation |
| [Student–AI ordered network analysis](https://doi.org/10.1080/10494820.2026.2664072) | 同行评审论文 | prompt-response 的序列网络与 human–AI 学习伙伴关系 |
| [xAPI Data Specification](https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-Data.md) | 官方规范 | actor–verb–object、context、statement evidence |
| [Caliper Analytics 1.2](https://www.imsglobal.org/spec/caliper/v1p2/) | 官方规范 | actor–action–object–eventTime–context event model |
| [W3C PROV-O](https://www.w3.org/TR/prov-o/) | W3C Recommendation | Agent–Activity–Entity、used/generated/derived provenance |
| [Mitchell et al., Model Cards](https://doi.org/10.1145/3287560.3287596) | 同行评审论文 | model identity、intended use、limitations、reporting |
| [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework) | 官方框架 | AI design/use/evaluation 的 trustworthiness 与 risk records |
| [Pardo & Siemens](https://doi.org/10.1111/bjet.12152) | 同行评审论文 | Learning Analytics privacy、trust、transparency、accountability |
| [Drachsler & Greller](https://doi.org/10.1145/2883851.2883893) | 同行评审会议论文 | DELICATE privacy/ethics checklist |
| [De Wever et al.](https://doi.org/10.1016/j.compedu.2005.04.005) | 同行评审综述 | CSCL content coding 的理论、validity、reliability 与 unit 风险 |
| [Butts, relational event framework](https://doi.org/10.1111/j.1467-9531.2008.00203.x) | 同行评审方法论文 | relational-event inference 需要事件序列和 actor risk set |
| [Kossinets](https://doi.org/10.1016/j.socnet.2005.07.002) | 同行评审方法论文 | 网络 missingness 对结构指标的影响 |

## 4. 本地实现证据

| 文件与行 | 核验内容 |
|---|---|
| sena-hk-template/lib/sena/types.ts:42-123 | Person、Utterance、Interaction、Code、CodedSegment、Dataset 五表类型 |
| sena-hk-template/lib/sena/import.ts:38-85 | 五表可映射字段、required 标志与 targetPersonIds aliases |
| sena-hk-template/lib/sena/model.ts:581-599 | S 由 source→target interaction 累加 |
| sena-hk-template/lib/sena/model.ts:602-624 | W 由 unitId::stanzaId 内 binary code co-occurrence 构造 |
| sena-hk-template/lib/sena/model.ts:627-678 | B_PC、B_CP 与 transpose fallback |
| sena-hk-template/lib/sena/model.ts:681-797 | participation Y 与 actor–code-pair G |
| sena-hk-template/lib/sena/model.ts:1141-1319 | stage/moving/turn temporal windows |
| sena-hk-template/lib/sena/import-adapters.ts:142-249 | transcript speaker、相邻发言 interaction、固定 stage/stanza heuristic |
| sena-hk-template/lib/sena/import-adapters.ts:381-460 | forum reply、thread、code extraction 与 coded-segment mapping |
| sena-hk-template/lib/sena/import-adapters.ts:633-720 | 当前文件格式覆盖 |
| sena-hk-template/lib/sena/data-contract-audit.ts:188-367 | five-table、references、temporal、governance audit |
| sena-hk-template/lib/sena/reliability.ts:5-49, 78-99 | coder annotation、kappa、alpha、disagreement queue |
| sena-hk-template/public/sena-pilot/templates/coded_segments.csv:1 | 空白模板未包含 target_person_ids |
| SENA_formula_formal_analysis.md:58-96 | 当前 S/W/B 数据生成公式 |
| SENA_formula_formal_analysis.md:187-219 | directed 与 temporal SENA |
| SENA_formula_formal_analysis.md:282-315 | failure modes 与 validation |

## 5. 关键综合推论的出处说明

### Actor supertype

- 事实：当前实现把全部参与节点命名为 Person。
- 事实：Human–AI learning 文献把 AI 描述为 agent/partner/subsystem，并强调 role、control 与 interaction。
- 推论：v2 应采用 Actor supertype，human 有 person_id，AI 有 agent/run provenance；AI 不应伪装为 person。

### Per-session AI instance

- 事实：同一模型可有不同 role、prompt、deployment 与运行版本。
- 事实：SNA centrality 对节点与边界定义敏感。
- 推论：默认以 group/session 中的 AI instance 为节点，以避免一个全局 AI 节点产生 hub artifact。

### Event ledger as fact layer

- 事实：xAPI/Caliper 使用 event/statement 表示 actor action；PROV-O 表达生成/派生链。
- 事实：当前 SENA matrices 可由 interactions/coded segments 重建。
- 推论：原始 event ledger 应是事实层，五表与 S/W/B/G/A_fusion 为 compatibility/derived layers。

### Explicit uptake

- 事实：当前 targetPersonIds 只表达目标证据；相邻 turn 不足以证明 uptake。
- 事实：Human–AI 研究区分 prompt、response、steering、revision 与 adoption。
- 推论：event_links 应显式编码 adopts/elaborates/challenges/rejects/revises。

### Actor-type measurement audit

- 事实：AI 输出长度、风格和生成条件与 human discourse 不同。
- 事实：当前 B/G 可受发言量和 code count 影响。
- 推论：Human–AI SENA 需做 binary/count、token/opportunity normalization、actor-type prevalence 与 model-version sensitivity。

## 6. 限制与未解决问题

- 本研究优先使用开放论文、出版社摘要页、机构仓储、官方标准与本地代码；未使用付费数据库全文做穷尽式检索。
- Human–AI education 证据仍快速变化；2025–2026 的若干研究是新近发表，跨情境可重复性有限。
- SENS/iSENS 本身包含 proof-of-concept 性质，不支持“任何数据上均优于 SNA/ENA”的普遍主张。
- 推荐的 v2 schema 是跨来源综合推论，不是已经存在的正式 SENA、xAPI、Caliper 或 W3C 标准。
- 未为 sample size 给固定 utterance 阈值；有效 N 取决于 independent units、clusters、code sparsity、network boundary 与研究设计。
- 未访问或记录任何个人凭证、受限学生数据或真实 AI system prompt。

## 7. 可复核性

本轮只新增两份研究输出：

- docs/research/human-ai/sena-analyzable-data-structures-human-ai-2026-07-11.md
- docs/research/human-ai/sena-analyzable-data-structures-human-ai-2026-07-11.provenance.md

未修改 SENA feature code、data contract、templates、tests 或部署状态。
