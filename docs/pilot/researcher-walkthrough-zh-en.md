# SENA Researcher Walkthrough (中文 / English)

**Route:** `/workspace/sena`  
**Sample:** bundled lesson-study contract (`/sena-pilot/sample/lesson-study-sena-contract.json`)

> **Exploratory-only / 仅供探索.** Every output below is exploratory network evidence. It is **not** a causal, assessment, or publication claim until coding-reliability, data-governance, and human-review gates pass. `A_fusion` is a normalized typed supra-adjacency, not a causal model, and Joint-layout distance is not an inferential statistic.

This committed walkthrough is generated from `deliveryCandidate.demoScript` in `sena-hk-template/lib/sena/development-plan.ts`. Follow it on `/workspace/sena` without opening the in-app generator.

The workspace still has a Model Builder panel (`#workflow-model`) between import and Fusion Canvas. It is supporting UI, not a sixth `demoScript` step.

---

## Step 1 — Import data  (`#workflow-data`)

**EN.** Import the lesson-study sample or five CSV tables and confirm the Data contract audit is valid.

**中文.** 导入 lesson-study 样例或五表 CSV，确认 Data contract audit 有效。

**Export / 导出:** `sena-project-snapshot.json`

## Step 2 — Review Fusion Canvas  (`#workflow-canvas`)

**EN.** Review Fusion Canvas, switch Explanatory, ENA Space, and Joint layouts, and keep the A1 layer grammar visible.

**中文.** 查看 Fusion Canvas，切换 Explanatory、ENA Space、Joint，并保留 A1 图层语法。

**Export / 导出:** `sena-visual-grammar.json`

## Step 3 — Inspect Temporal Trace  (`#workflow-temporal`)

**EN.** Switch Stage, Moving, and Turn temporal modes, then inspect per-window jENA/jSNA/SENA status and A_fusion checksums.

**中文.** 切换 Stage、Moving、Turn 时序模式，检查每个窗口的 jENA/jSNA/SENA 状态和 A_fusion checksum。

**Export / 导出:** `sena-temporal-runtime-trace.json`

## Step 4 — Inspect evidence  (`#workflow-evidence`)

**EN.** Select nodes, edges, and G contributions, then inspect original utterance evidence before writing interpretations.

**中文.** 选择节点、边和 G 贡献，回看原始 utterance evidence 后再写解释。

**Export / 导出:** `sena-evidence-ledger.json`

## Step 5 — Export review packet  (`#workflow-report`)

**EN.** Fill human review and coding reliability fields, then export the review packet, runtime bundle, and report JSON/Markdown.

**中文.** 填写 human review 与 coding reliability，导出 review packet、runtime bundle、report JSON/Markdown。

**Export / 导出:** `sena-review-packet.json`, `sena-runtime-bundle.json`, `sena-analysis-report.json`, `sena-analysis-report.md`

---

## What SENA can / cannot answer · SENA 能与不能回答

**Can (exploratory).** Who interacts with whom around which concepts; whether social centrality and epistemic contribution/brokerage sit with different actors; how S/W/B/G shift across Plan/Teach/Reflect.

**Cannot (from SENA alone).** Whether anyone *understood*; whether code co-occurrence is causal; whether centrality/G equals quality; whether adjacency is peer influence vs selection/homophily. Causal claims still need randomised / quasi-experimental / longitudinal design with valid independent units.

## Pilot handoff-freeze checklist · 交付冻结清单

Run before sharing the package with a reviewer:

- [ ] `npm run sena:pilot:verify` passes (stop local `next dev` / `next start` servers first).
- [ ] Follow every `demoScript` step above on the bundled lesson-study sample.
- [ ] Handoff package present: sample + blank templates, `sena-project-snapshot.json`, `sena-runtime-bundle.json`, `sena-review-packet.json`, `sena-demo-verification.json`, `sena-demo-walkthrough.json`, `sena-development-plan.json`.
- [ ] JSON/Markdown reports state that `A_fusion` is not causal and Joint distance is not inferential.
