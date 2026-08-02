# SENA 可分析的数据结构：从 Human–Human 到 Human–AI Social–Epistemic Nexus

日期：2026-07-11（Asia/Hong_Kong）

范围：教育技术、Learning Analytics、Learning Sciences、CSCL、ENA/SNA 与 Human–AI collaborative learning

性质：文献与当前实现证据支持的研究设计建议；不是代码改动或因果结论

## 执行结论

SENA 最适合分析的不是“任意教育大数据”，而是：

> 在有边界的学习活动中，已识别的人类或 AI actor，按可排序的事件序列，对其他 actor、知识对象或共享产物采取可解释的行动；行动与内容可由理论驱动 codebook 编码，并且 social、epistemic、actor–code 关系均可追溯到原始证据。

完整 SENA 数据至少回答五个问题：

1. Who：谁参与？是 human、AI agent，还是仅作为后台工具的 AI service？
2. With whom/what：谁对谁或什么对象采取了什么行动？
3. About what：激活、连接或转换了哪些认识概念、实践或调节行为？
4. When/where：属于什么 session、task、phase、conversation 与 window？
5. Evidence：每条边、编码、AI 输出与 uptake 能否回到 event、message、segment、artifact revision 和模型运行记录？

因此，SENA 应从 person–person 推广为 typed actor–actor–epistemic event model：

- actor = human | ai_agent；
- Human–Human、Human–AI、AI–Human，以及有研究意义时的 AI–AI，均是有方向、有类型的 interaction；
- AI 是可观察的功能性参与者，不被默认赋予人类身份、意图、责任或真实理解；
- prompt、response、feedback、challenge、acceptance、rejection、revision 与 uptake 是不同事件或事件关系；
- 模型、版本、agent 配置与运行参数是数据生成机制的一部分。

[SENS](https://doi.org/10.1016/j.chb.2018.07.003) 说明 SNA 与 ENA 对协作学习具有互补性；[iSENS](https://doi.org/10.1145/3375462.3375505) 进一步整合社会与认识连接。SENA 的合理扩展是将参与者集合从 people 推广为 human–AI actors，同时保留类型差异。

## 1. SENA 的广义数据生成逻辑

令 actor 集合为：

    A = H ∪ M

其中 H 是 human actors，M 是具备可观察互动行为的 AI agents。令 C 为有限、版本化的认识代码集合，T 为 discourse/activity windows。

actor interaction block 可展开为：

    S_AA = [ S_HH  S_HM
             S_MH  S_MM ]

广义融合对象为：

    A_fusion = [ αŜ_AA       γ_out B̂_AC
                 γ_in B̂_CA  βŴ_CC     ]

- S_AA：actor–actor interaction；保留 Human–Human、Human–AI、AI–Human、AI–AI 的类型与方向。
- W_CC：同一有理论意义 window 内的 code–code 共现；标准 ENA 共现是关联，不是因果或时间方向。
- B_AC：谁提出、使用、生成、修改或贡献了什么 code。
- B_CA：什么 coded contribution 明确指向、反馈给或要求哪个 actor 处理。
- G：哪个 actor 对某个 code-pair 的形成提供直接或支持性贡献。
- A_fusion(t)：上述结构在 stage、moving window 或 turn window 中的时间切片。

没有独立 code→actor 证据时，B_CA = B_AC 转置只能作为明确标注的 compatibility fallback，不能解释为 uptake、影响或反馈。研究“AI 建议是否被学生取用”必须另存 uptake event/link。

## 2. 数据资格的七个门

### 2.1 Actor boundary

必须有明确 roster、membership 与观察边界。缺席、未记录、拒答、API timeout 与真正“零互动”不能混合。

AI 应分为：

- ai_agent：向学习者或其他 actor 产生可观察回复、反馈、提问、建议或委派，可进入 interaction network；
- ai_service/tool：后台分类、检索、安全过滤等通常进入 provenance/context，不自动成为 social node；
- agent_design：角色与配置，例如 Socratic tutor；
- agent_instance：某 group/session 中实际运行的实例；
- model_snapshot/deployment：具体模型与版本。

把同一个全局 AI 节点连接所有学生会机械地产生超级中心节点。较稳健的默认是以 group/session 中的 agent instance 为节点，同时映射到共同 agent design 与 model snapshot。

### 2.2 Relational event

社会层不能只由“同班”“同时在线”或聚合点击量构成。每条边需有 source、target、relation type、direction、time/order、observation opportunity 与 evidence。适合的关系包括 reply、mention、question-to、feedback-to、prompt-to、response-to、challenge、revision request、delegation、co-edit handoff。

### 2.3 Epistemic coding

[ENA tutorial](https://doi.org/10.18608/jla.2016.33.3) 将 ENA 定义为对 coded data 中元素连接的识别、量化与比较；[Mathematical Foundations of ENA](https://doi.org/10.1007/978-3-030-67788-6_7) 说明从 coded discourse 到单位网络与投影的数学转换。

codebook 至少记录 code_id、definition、theoretical framework、include/exclude rules、examples、version/hash、适用 actor/modality 与 validity evidence。建议增加：

    code_role = epistemic | regulatory | social | affective | interaction | ai-use

如果 social action codes 与 epistemic codes 无差别进入同一个 W，社会性会在 S 与 W 中重复计量，epistemic layer 的含义会漂移。

### 2.4 Shared join keys

Full SENA 至少共享：

- actor_id / actor_instance_id；
- group_id / session_id / task_id；
- conversation_id；
- event_id / message_id / segment_id；
- sequence_index 或可靠 timestamp；
- window_id / stage。

若 SNA 与 ENA 来自不同人群、不同任务或不可连接的时间，只能并列报告，不能称为一个 nexus。

### 2.5 Time and window

window 是理论假设，不是纯技术参数。[Moving Stanza Windows](https://doi.org/10.18608/jla.2017.43.7) 指出跨 turn 的意义范围取决于 segmentation；[SoLAR temporal chapter](https://doi.org/10.18608/hla22.007) 强调粒度与窗口会改变结论。

应分别保存 timestamp、sequence_index、教学 phase、conversation/task boundary 以及分析时生成的 window。不同研究曾使用 3-post、5-turn 或 6-utterance window，这些均是情境化选择，不是 SENA 的普适默认。

### 2.6 Reliability, provenance, governance

结果应追踪 raw → cleaned → segmented → coded → matrices → report。人工和 AI coding 都要记录 coder/source、版本、confidence、adjudication 与 reliability。编码一致性不等于 construct validity，AI 输出含某 code 也不等于内容正确或人类已掌握。

Learning Analytics 把 privacy、transparency、accountability、consent 与 stewardship 视为设计组成。[Pardo & Siemens](https://doi.org/10.1111/bjet.12152)；[DELICATE](https://doi.org/10.1145/2883851.2883893)。

### 2.7 Valid analysis unit

utterance、segment 和 edge 是记录，不自动是独立样本。独立或分配单位通常是 student、group、class、school 或 session。单个大型聊天仍可能只是一个案例；组间推断不能把数千 turns 当数千学习者。

## 3. 当前 SENA 实现实际支持什么

| 表 | 当前核心字段 | 矩阵作用 |
|---|---|---|
| people | id, label, role, group, initials | person roster |
| interactions | source, target, weight, channel, stage, turnIndex, evidence | S |
| utterances | id, personId, unitId, stanzaId, stage, turnIndex, text, timestamp | 话语、时间、证据 |
| coded_segments | segmentId, utteranceId, personId, targetPersonIds?, unitId, stanzaId, stage, turnIndex, text, codes, confidence | W、B_PC、B_CP、G |
| codebook | id, label, family, description, color | code 集合 |

本地证据：

- 五表类型：sena-hk-template/lib/sena/types.ts:42-123。
- S：model.ts:581-599。
- W 以 unitId::stanzaId 共现构造：model.ts:602-624。
- B_PC 由 segment author 构造；B_CP 由 targetPersonIds 构造，否则转置 fallback：model.ts:631-678。
- G：model.ts:720-797。
- stage、moving-window、turn-window：model.ts:1246-1319。
- 导入 SENA JSON、五 CSV、XLSX、LMS/forum、TXT/MD、SRT/VTT：import-adapters.ts:15-18, 633-720。

### Human–AI 的当前边界

把 AI 写为 people 中一行，矩阵代码机械上可能运行，但不构成 research-grade Human–AI SENA，因为会丢失：

- human/AI actor type；
- agent role、instance、provider、model snapshot、deployment；
- system prompt/config 与 sampling provenance；
- prompt-response parent、tool call、retry/refusal/error；
- exposure、uptake、challenge、adoption、rejection 的差异；
- AI 与 human 文本在长度、代码密度与构念解释上的非等价性。

准确表述应是：

> Person-only contract 可被不安全地挪用来画 Human–AI 边，但尚未提供可验证的 Human–AI data contract。

### 当前实现的具体漂移/风险

1. targetPersonIds 已被 type/importer/model 支持，但空白 coded_segments.csv 未暴露此列。
2. forum adapter 已恢复 reply target 作为 interaction，却未写入 coded segment target IDs，B_CP 仍会退化为转置。
3. transcript adapter 用相邻 speaker 推导 interaction，并把文本机械分成 Plan/Teach/Reflect；相邻发言不是 addressed-to、uptake 或 influence。
4. forum 将整条 thread 同时当 unit/stanza，长 thread 容易产生稠密伪共现。
5. 当前 W 是 stanza 内 binary code-pair 共现，不使用先后顺序或 confidence。
6. jENA unit 固定为 personId，尚不能把 dyad、team、session 或 Human–AI pair 声明为单位。

因此 adapter 输出是清洗起点，不是自动的研究级数据。

## 4. 推荐的 SENA v2 canonical structure

推荐 event ledger + normalized evidence tables + compatibility views。矩阵是可复算产物，不是输入真相。

### contexts

    context_id, parent_context_id
    context_type  # institution/course/class/group/session/task/phase/thread
    condition_id, learning_design_id
    start_time, end_time, timezone

这避免当前 unitId 同时承担 group、case、conversation 和 analysis unit。

### actors

    actor_id
    actor_type    # human | ai_agent
    label, role, group_id
    valid_from, valid_to
    person_id     # human only, pseudonymous
    agent_design_id  # AI only

### ai_agent_runs

    agent_run_id, actor_id, actor_instance_id, context_id
    provider, model_family, model_snapshot, deployment_id, api_version
    agent_config_version, system_prompt_hash
    retrieval_corpus_version, tool_policy_version
    temperature, top_p, seed, request_id
    started_at, ended_at

不可获得字段应标记 unknown/not_exposed。Model Cards 强调 intended use、限制与透明报告；NIST AI RMF 将设计、使用与评估条件纳入风险管理。[Model Cards](https://doi.org/10.1145/3287560.3287596)；[NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework)。

### events

    event_id, context_id, conversation_id
    source_actor_instance_id
    action_type  # utter/prompt/respond/question/hint/feedback/critique/...
    object_type, object_id
    target_actor_instance_ids
    timestamp, sequence_index, channel, modality, duration_ms, weight
    status  # completed/refused/timeout/error/redacted
    content_id, agent_run_id

该结构可与 xAPI 的 Actor–Verb–Object 和 Caliper 的 actor–action–object–eventTime–context 互操作。[xAPI](https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-Data.md)；[Caliper 1.2](https://www.imsglobal.org/spec/caliper/v1p2/)。但当 object 只是 video/quiz/page 时，还需补 social target、epistemic codes 与 window，才是 full SENA。

### event_links

    link_id, source_event_id, target_event_id
    link_type  # reply_to/prompted_by/cites/revises/adopts/
               # elaborates/challenges/rejects/tool_result_of
    evidence_segment_id, coder_id, confidence, adjudication_status

Human prompt→AI response 是 turn linkage；AI suggestion→human adoption 是 uptake evidence。时间邻接不等于采纳。

### contents / segments

    content_id, event_id, content_type, text_or_uri
    language, source_hash, redaction_status
    segment_id, start_offset, end_offset, segment_text

raw gaze、audio、video、gesture、proximity 或 physiological streams 需要时间同步、特征提取与理论解释，再形成 event/segment。[Di Mitri et al.](https://doi.org/10.1111/jcal.12288)。

### code_assignments

    assignment_id, segment_id, code_id, value, weight
    coder_type  # human | llm | rule | adjudicated
    coder_id, coder_model_snapshot
    codebook_version, confidence, adjudication_status

这应替代仅用 codes[] 作为最终事实，以保留多 coder、negative assignment、AI coder 版本与 adjudication。

### codebook

除当前字段外增加：

    code_role, theoretical_framework, definition
    inclusion_rules, exclusion_rules, examples
    applies_to_actor_types, applies_to_modalities
    version, content_hash, validity_evidence

[ICAP](https://doi.org/10.1080/00461520.2014.965823)、Community of Inquiry、argumentation、knowledge building、epistemic frame、SRL/SSRL 可提供代码体系，但标签并非天然等价构念。[Human–AI shared regulation](https://doi.org/10.1111/bjet.13325) 支持操作化 human 与 AI 调节系统间的触发和协作。

### artifacts / revisions

    artifact_id, artifact_type, context_id
    revision_id, actor_instance_id, parent_revision_id
    timestamp, diff_uri_or_text, codes, ai_assistance_event_ids

这样 collaborative documents、design artifacts、code、concept maps、peer-feedback revisions 可以进入 SENA。

### outcomes / memberships / provenance

成绩、问卷、背景属性与 condition 应作为 comparison/validation sidecar，不应硬塞进 S 或 W。provenance 记录 source hash、清洗、排除、missing/censoring、consent、purpose、retention、codebook 与模型版本。[W3C PROV-O](https://www.w3.org/TR/prov-o/) 的 Agent–Activity–Entity 可作为参考。

### 兼容视图

    people         := actors WHERE actor_type = human
    interactions   := events/event_links WHERE target is actor
    utterances     := communicative events JOIN contents
    coded_segments := segments JOIN code_assignments
    codebook       := codebook

Human–AI v2 改用 actors；旧五表作为兼容导入/导出视图。

## 5. 哪些数据最适合 SENA

| 数据场景 | 适配度 | 最小转换/条件 |
|---|---|---|
| 同步小组讨论、协作问题解决 | 高 | speaker、recipient/reply、turn、task/phase、coded segments |
| 异步论坛、Knowledge Building、CoI | 高 | author、parent post、thread、time、codes、revision/build-on |
| Human–AI tutor/chat | 高但需 v2 | typed actors、prompt-response、model run、codes、uptake |
| Human–Human–AI triad/group | 很高 | HH/HA/AH edges、agent instance、shared task/window |
| AI 支持 peer feedback/writing | 高 | reviewer-author-AI、feedback/revision、artifact versions |
| lesson study、课堂对话、simulation/debrief | 高 | transcript/video segments、speaker/addressee、phase、codes |
| 共享文档、白板、设计、编程 | 中高 | edit/comment/review、artifact diff、actor、codes、handoff |
| SRL/SSRL/co-regulation | 中高 | plan/monitor/evaluate/help-seeking、target、sequence、codes |
| LMS/xAPI/Caliper logs | 条件适合 | actor-action-object-time-context，再补 target、codes、windows |
| multimodal classroom | 条件适合 | synchronized streams → derived events → coded segments |
| peer nomination/survey network | 条件适合 | source-target、boundary、wave；另需可连接 discourse/codes |
| individual essays/reflections | 仅 ENA 部分 | author、segments、codes、units/windows；没有 social nexus |
| individual student–AI dyad | 有限 | typed actors、turn log、provenance、uptake；不宜解释群体中心性 |
| pre/post、成绩、问卷宽表 | 不直接适合 | 仅作为 outcomes/covariates |
| 无 actor/time/evidence 的最终矩阵 | 不适合研究级 SENA | 需恢复 event/edge provenance |

## 6. Human–AI SENA 的特殊编码

### 6.1 AI role 与 control

至少区分 AI tutor、peer、facilitator、critic、assessor、recommender、scribe、orchestrator。Molenaar 的 hybrid human–AI 框架强调 detect–diagnose–act 与人/技术控制程度，因此 role、initiative_source、automation_level、human_override 应进入 metadata。[Molenaar, 2022](https://doi.org/10.1111/ejed.12527)。

### 6.2 Interaction vocabulary

    human → AI: prompt, request, clarify, constrain, correct,
               challenge, verify, accept, reject, revise-with
    AI → human: respond, ask, hint, explain, critique, feedback,
               recommend, refuse, warn
    human → human: reply, question, explain, challenge, coordinate,
                   build-on, feedback
    AI → AI/tool: delegate, retrieve, call-tool, critique, aggregate

AI–AI/tool 只有在研究问题涉及且日志可观察时才进入 interaction layer。不可见 chain-of-thought 不得被推断为 social interaction。

### 6.3 Production、exposure 与 uptake

1. Production：谁生成/提出 code 或 code-pair。
2. Exposure/targeting：contribution 明确发给谁。
3. Uptake/transformation：后续 actor 是否 acknowledge、adopt、elaborate、challenge、reject 或 revise。

Human–AI 对话可以作为学习证据，但要观察学生如何 steer interaction 以及如何在对话中表现 domain expertise；[DRIVE](https://doi.org/10.1016/j.caeai.2025.100497) 正是以这两类证据讨论 GenAI interaction-based assessment。

### 6.4 Measurement non-invariance

AI 输出常更长、格式更完整、代码密度更高。若按 code count 构造 B/G/W，AI 会机械地主导。至少做：

- binary presence 与 count/confidence weighting 敏感性比较；
- token/turn/opportunity normalization；
- human-only、AI-only、hybrid networks 对照；
- actor-type 分层 code prevalence；
- codebook 在 human/AI 文本上的 measurement audit；
- model snapshot 与 prompt-template 分层。

AI“说到概念”不等于内容正确，也不等于学生学会。

## 7. 可以与不能回答的问题

### 可以较好回答

- 谁与谁围绕哪些概念、证据或调节行为互动？
- social centrality 与 epistemic contribution/brokerage 是否由不同 actors 承担？
- AI tutor/peer/critic 是否改变 human–human 互动与概念连接？
- 哪些 human/AI actors 对特定 code-pair 贡献最多？
- AI feedback 之后出现 adoption、elaboration、challenge 还是 rejection？
- Plan–Teach–Reflect 或 problem-solving phases 中 S/W/B/G 如何变化？
- shared artifact 如何由 human 与 AI revisions 累积？

### 不能仅凭 SENA 回答

- AI 或学生是否真正理解；
- code 共现是否是逻辑、心理或因果连接；
- centrality、bridge score 或 G 是否等于高质量；
- AI 建议后 human 发言是否证明 uptake；
- Human–AI interaction 是否导致学习增益；
- network association 是否是 peer influence 而非 selection/homophily/context；
- 同名 AI 服务在不同日期是否是同一数据生成机制；
- 缺失日志是否表示没有互动。

因果结论仍需随机化、准实验、纵向设计、有效 independent units 与 causal identification。SENA 图本身不是因果模型。

## 8. 研究级 gate

### 必须满足

- actor/network boundary、risk set、观察起止、纳入/排除；
- event ID、顺序；动态强度问题需 timestamp；
- 区分 observed zero、missing、redacted、AI refusal、timeout/error；
- ENA 声明 unit、conversation、window、codes、codebook version；
- SNA 声明 tie semantics、direction、weight、evidence；
- 保留 student/group/class/session/model nesting；
- coding 有 human reliability 或 human-reviewed AI workflow；
- Human–AI 有 model/config/version provenance；
- 矩阵/edge 可回溯原始记录；
- consent、purpose、access、retention、pseudonymization。

### 强烈建议

- window、normalization、α/β/γ、code prevalence、missingness sensitivity；
- 显式编码 uptake、challenge、appropriation；
- 比较 human-only、AI-only 与 hybrid layers；
- 以真正 independent/assignment units 做 bootstrap/permutation/multilevel inference；
- 同一 model 的随机重跑不作为新增 learner N；
- 自动 coding 使用 held-out human audit；
- 保留 raw、cleaned、coded、matrix、report hashes。

### 禁止性解释

- 将 AI 填入 people 后宣称已实现 Human–AI SENA；
- 把 B_AC 转置宣称为独立 code→actor uptake；
- 把标准 W 当有方向概念转移；
- 把 turns/segments/edges 当独立样本量；
- 把相邻发言当 addressed-to 或 adoption；
- 把 AI 代码密度解释为 epistemic superiority；
- 把 descriptive temporal change 解释成机制/因果；
- 把单一班级、小组或 deployment 一般化到总体。

## 9. 产品与研究路线

### P0：使 Human–AI 数据语义正确

1. Person → Actor，增加 actorType = human | ai_agent；people 成 compatibility view。
2. 增加 ai_agent_runs 与 model/config/version provenance。
3. targetPersonIds → targetActorIds，并修正 CSV template/forum adapter。
4. 增加 parentEventId、actionType、status、agentRunId。
5. 默认 per-group/session AI instance，防止 global AI hub artifact。
6. content producer 与 coder 分开。
7. jENA unit 可配置 actor/dyad/team/session。

### P1：升级为可复算 event ledger

1. contexts、events、event_links、contents/segments、code_assignments。
2. 五表由 ledger 派生；矩阵由行级 evidence 重建。
3. xAPI/Caliper adapter；只有满足 social/epistemic joins 才升级为 full SENA。
4. artifact revision 与 multimodal alignment。
5. coder/model provenance 与 adjudication 进入正式 contract。

### P2：研究级 Human–AI multiplex inference

1. 显示 S_HH、S_HA、S_AH、S_AA，并允许 relation/channel-specific normalization。
2. 分开 production、exposure、uptake、transformation bridges。
3. actor-type/model-version measurement 与 sensitivity panels。
4. nested units、group/session/model strata、共同 projection 与有效 permutation/bootstrap。
5. 将 agent role、automation/control level 与 causal design 写入 method protocol。

## 10. 最终判断

最适合 SENA 的 data structure 是：

> A bounded, temporally ordered, theory-coded, evidence-traceable heterogeneous actor–event–epistemic system.

即：

> 有边界、可排序、理论编码、证据可追溯的异质 actor–事件–认识系统。

SENA 的 social 应从 person–person 扩展到 human 与 AI 在学习活动中的可观察功能性交互；但类型、方向、角色、控制、模型版本、内容来源与 human uptake 不能被抹平。

最有价值的 Human–AI SENA 问题不是“AI 说了多少”，而是：

> AI 何时、以何种角色进入人的社会—认识系统；它如何改变人与人之间的互动、概念连接、认识劳动分配，以及人如何验证、改写、拒绝或取用 AI 提供的认识资源。

## 参考文献（APA 7，核心）

Bowman, D., Swiecki, Z., Cai, Z., Wang, Y., Eagan, B., & Linderoth, J. (2021). The mathematical foundations of epistemic network analysis. In *Advances in quantitative ethnography* (pp. 91–105). Springer. https://doi.org/10.1007/978-3-030-67788-6_7

Chi, M. T. H., & Wylie, R. (2014). The ICAP framework: Linking cognitive engagement to active learning outcomes. *Educational Psychologist, 49*(4), 219–243. https://doi.org/10.1080/00461520.2014.965823

Di Mitri, D., Schneider, J., Specht, M., & Drachsler, H. (2018). From signals to knowledge: A conceptual model for multimodal learning analytics. *Journal of Computer Assisted Learning, 34*(4), 338–349. https://doi.org/10.1111/jcal.12288

Drachsler, H., & Greller, W. (2016). Privacy and analytics—It’s a DELICATE issue. In *Proceedings of LAK 2016* (pp. 89–98). ACM. https://doi.org/10.1145/2883851.2883893

Gašević, D., Joksimović, S., Eagan, B. R., & Shaffer, D. W. (2019). SENS. *Computers in Human Behavior, 92*, 562–577. https://doi.org/10.1016/j.chb.2018.07.003

Järvelä, S., Nguyen, A., & Hadwin, A. F. (2023). Human and artificial intelligence collaboration for socially shared regulation in learning. *British Journal of Educational Technology, 54*(5), 1057–1076. https://doi.org/10.1111/bjet.13325

Mitchell, M., et al. (2019). Model cards for model reporting. In *Proceedings of FAT* (pp. 220–229). ACM. https://doi.org/10.1145/3287560.3287596

Molenaar, I. (2022). Towards hybrid human–AI learning technologies. *European Journal of Education, 57*(4), 632–645. https://doi.org/10.1111/ejed.12527

Pardo, A., & Siemens, G. (2014). Ethical and privacy principles for learning analytics. *British Journal of Educational Technology, 45*(3), 438–450. https://doi.org/10.1111/bjet.12152

Shaffer, D. W., Collier, W., & Ruis, A. R. (2016). A tutorial on epistemic network analysis. *Journal of Learning Analytics, 3*(3), 9–45. https://doi.org/10.18608/jla.2016.33.3

Siebert-Evenstone, A. L., et al. (2017). In search of conversational grain size. *Journal of Learning Analytics, 4*(3), 123–139. https://doi.org/10.18608/jla.2017.43.7

Swiecki, Z., & Shaffer, D. W. (2020). iSENS. In *Proceedings of LAK 2020* (pp. 305–313). ACM. https://doi.org/10.1145/3375462.3375505
