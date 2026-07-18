# SENA Researcher Walkthrough (中文 / English)

**Route:** `/workspace/sena` · **Sample:** bundled lesson-study contract
(`/sena-pilot/sample/lesson-study-sena-contract.json`) — 4 participants
(Ms Lee, Mr Chan, Dr Wong, Ms Ho), 7 codes, Plan → Teach → Reflect.

> **Exploratory-only / 仅供探索.** Every output below is exploratory network
> evidence. It is **not** a causal, assessment, or publication claim until the
> coding-reliability, data-governance, and human-review gates in Step 6 are
> complete. `A_fusion` is a normalized typed supra-adjacency, not a causal model,
> and Joint-layout distance is not an inferential statistic.

This is the Track A "researcher walkthrough" deliverable of the
2026-07-18 Next Development Plan. A reviewer should be able to follow it end to
end on the bundled sample without a developer present, then repeat it on a real
dataset. It mirrors the six-step workflow encoded in `demo-walkthrough.ts`.

---

## Step 1 — Data Import · 数据导入  (`#workflow-data`)

**EN.** Open `/workspace/sena`. Click **Load lesson-study sample** (or upload
your own five SENA tables: `people`, `interactions`, `utterances`,
`coded_segments`, `codebook`). Confirm the **Data contract audit** is valid and
read the cleaning manifest (derived placeholder people/codes and warnings are
shown as provenance, not errors). Export `sena-project-snapshot.json` so the
session is restorable.

**中文.** 打开 `/workspace/sena`，点击 **载入 lesson-study 样例**（或上传你自己的
五张表：`people`、`interactions`、`utterances`、`coded_segments`、`codebook`）。
确认 **Data contract audit** 有效，并阅读 cleaning manifest（派生的占位 people/codes
与警告是溯源信息，不是错误）。导出 `sena-project-snapshot.json` 以便随时还原。

*Directed-bridge / Human–AI note:* the blank `coded_segments` template now
exposes a `target_person_ids` column — fill it to record who a coded
contribution is addressed to, which drives independent `B_CP` (code → person)
evidence instead of the transpose fallback.

## Step 2 — Model Builder · 模型构建  (`#workflow-model`)

**EN.** Adjust **α (social) · β (epistemic) · γ (bridge)**, the **normalization**
rule, edge threshold, and layer visibility. These are *declared modelling
choices* — see `docs/validation/sena-parameter-sensitivity-lesson-study.md` for
how each shifts the S/W/B balance of `A_fusion`. Confirm the archived
**fusion-math audit** stays `verified` and the model JSON export stays
consistent.

**中文.** 调整 **α（社会）· β（认识）· γ（桥接）**、**normalization** 规则、边阈值与
图层可见性。这些是*声明式建模选择*——参见
`docs/validation/sena-parameter-sensitivity-lesson-study.md`，了解每个选择如何改变
`A_fusion` 中 S/W/B 的比例。确认 **fusion-math audit** 仍为 `verified`，模型 JSON
导出保持一致。

## Step 3 — Fusion Canvas · 融合画布  (`#workflow-canvas`)

**EN.** The **A1 "Inner Solid Mesh"** grammar: **S** = thick blue outer-orbit
social arcs, **W** = solid purple concept links, **B** = translucent cyan bridge
ribbons, **G** = low-emphasis pink contribution arcs. Switch **Explanatory /
ENA Space / Joint** layouts while keeping the central plot visible. Solid
purple W (concept co-occurrence) must stay visually distinct from blue S.

**中文.** **A1「Inner Solid Mesh」** 图层语法：**S** = 蓝色粗外圈社会弧，**W** = 紫色
实线概念连边，**B** = 半透明青色桥接带，**G** = 低强度粉色贡献弧。在保持中心图可见的
前提下切换 **Explanatory / ENA Space / Joint** 布局。紫色实线 W（概念共现）须与蓝色 S
在视觉上区分。

## Step 4 — Evidence · 证据  (`#workflow-evidence`)

**EN.** Select a **person node**, a **typed edge**, and a **G contribution**
(who contributed to a concept pair). For each, read the original utterance /
coded-segment evidence in the Evidence Ledger *before* writing any
interpretation. Export `sena-evidence-ledger.json` and
`sena-person-code-pair-g-report.json`.

**中文.** 选择一个 **person 节点**、一条 **typed edge** 和一个 **G contribution**
（谁对某个概念对有贡献）。对每一项，先在 Evidence Ledger 中回看原始 utterance /
coded-segment 证据，*再* 写解释。导出 `sena-evidence-ledger.json` 与
`sena-person-code-pair-g-report.json`。

## Step 5 — Temporal Trace · 时序轨迹  (`#workflow-temporal`)

**EN.** Switch temporal mode across **Stage / Moving / Turn**. On the bundled
sample this yields **3 / 8 / 10 windows** respectively — window choice is a
theoretical assumption, not a neutral parameter. Read the **Temporal Fusion Arc**
(Plan → Teach → Reflect) and per-window jENA/jSNA/SENA status and `A_fusion`
checksums. Export `sena-temporal-runtime-trace.json`.

**中文.** 在 **Stage / Moving / Turn** 之间切换时序模式。在样例上分别得到
**3 / 8 / 10 个窗口**——窗口选择是理论假设，不是中性参数。阅读
**Temporal Fusion Arc**（Plan → Teach → Reflect）以及每个窗口的 jENA/jSNA/SENA
状态与 `A_fusion` 校验和。导出 `sena-temporal-runtime-trace.json`。

## Step 6 — Report & Gates · 报告与门槛  (`#workflow-report`)

**EN.** Fill the **human-review**, **coding-reliability**, and
**data-governance** fields (see the ethics / governance checklist). Only then
export the **review packet**, JSON report, and Markdown report. The
**claim-readiness gate** stays *exploratory-only* until every gate passes.

**中文.** 填写 **human-review**、**coding-reliability**、**data-governance** 字段
（见伦理 / 治理清单）。完成后再导出 **review packet**、JSON 报告与 Markdown 报告。
在所有门槛通过前，**claim-readiness gate** 保持 *exploratory-only*。

---

## What SENA can / cannot answer · SENA 能与不能回答

**Can (exploratory).** Who interacts with whom around which concepts; whether
social centrality and epistemic contribution/brokerage sit with different
actors; how S/W/B/G shift across Plan/Teach/Reflect.

**Cannot (from SENA alone).** Whether anyone *understood*; whether code
co-occurrence is causal; whether centrality/G equals quality; whether adjacency
is peer influence vs selection/homophily. Causal claims still need randomised /
quasi-experimental / longitudinal design with valid independent units.

## Pilot handoff-freeze checklist · 交付冻结清单 (Track A1)

Run before sharing the package with a reviewer:

- [ ] `npm run sena:pilot:verify` passes (stop local dev/start servers first).
- [ ] `npm test` green; `npx tsc --noEmit` clean; `npm run lint` clean.
- [ ] Handoff package present: sample + blank templates, `sena-project-snapshot.json`,
      `sena-runtime-bundle.json`, `sena-review-packet.json`,
      `sena-demo-verification.json`, `sena-demo-walkthrough.json`,
      `sena-development-plan.json`.
- [ ] Review packet reproduces jENA/jSNA reports, metric provenance, runtime +
      fusion-math audits, and report guardrails; JSON/Markdown reports state that
      `A_fusion` is not causal and Joint distance is not inferential.
- [ ] No v1 export schema changed except by additive fields.
- [x] This walkthrough completed once on the bundled sample (below); one real
      dataset still pending user data.

## Executed walkthrough — bundled sample observations (2026-07-18)

Driven end to end on `/workspace/sena` (dev server) with the lesson-study
sample, and independently by the automated `sena:pilot:verify` browser smoke
(both green). Observed:

- **Step 1–2 (Import / Model).** 4 participants (Ms Lee, Mr Chan, Dr Wong,
  Ms Ho) + 7 codes load; `A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]`
  with α=β=γ=1, edge threshold 0.16.
- **Step 3 (Fusion Canvas).** A1 Inner Solid Mesh renders correctly: blue S
  outer arcs, purple W concept mesh, cyan B ribbons, pink G arcs. Active Plan
  window shows S=3 / W=10 / B=7 / G=10, `A_fusion` checksum `0xc200a461`.
- **Step 4 (Evidence).** Top social tie *Ms Lee → Mr Chan*; top ENA tie
  *Question + Hypothesis*; top bridge *Ms Lee → Question*; top G pair
  *Evidence + Critique* — each traceable to segment evidence.
- **Step 5 (Temporal Trace).** Windows Plan/Teach/Reflect (1/3 … 3/3). The
  adjacent-window delta renders (*Plan → Teach*, top-G-pair shift
  *Evidence + Critique → Critique + Coordination*), confirming the temporal
  transitions fix in the running app.
- **Dual Lens.** Active Plan window vs full conversation: SNA density 0.25 vs
  0.67, S ties 3 vs 8, W links 10 vs 20 — a concrete reminder that the active
  window is a *scoped* view of the full timeline.

**Backlog captured:** none blocking; the one open item is running the same
walkthrough on a real dataset (needs user-supplied data + a domain reviewer).
