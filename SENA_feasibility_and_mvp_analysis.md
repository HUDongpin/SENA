# SENA 工具可行性分析与 MVP 说明

基于文件：

- `SENA_web_tool_development_spec.md`
- `SENA_web_tool_design_mockup.html`
- `ENAHK_SENA_Framework_Report.docx`
- `SENA Papers/Good Version_SENA_Conceptual_Paper_Computers_and_Education_Format.docx`
- `sena-hk-template` 现有 Next.js / jENA 代码

## 1. 核心判断

SENA 作为 Web-based research tool 是可实现的，而且项目中已经具备一个很好的起点：`sena-hk-template` 已有 Next.js App Router、主题/语言框架、jENA-powered ENA workspace、API route、可视化组件和测试。当前最合理的 MVP 不是重写整个平台，而是在现有 ENA 能力旁边新增一个 SENA Fusion proof of concept，用样例数据真实构造 S、W、B 和融合矩阵，并把人、概念、桥接贡献放入同一个可交互工作台。

本次实现的 POC 已新增 `/workspace/sena`，可展示：

- SNA 社会层矩阵 `S`
- ENA 概念共现矩阵 `W`
- person-code 桥接矩阵 `B`
- 加权融合矩阵 `A_fusion`
- SNA / ENA / SENA 三类边的交互式 Fusion Canvas
- 节点和边的 inspector
- 原始话语 evidence 回溯
- Bridge score、epistemic diversity、alignment、concept brokerage 等指标
- temporal SENA trace
- JSON export

## 2. 理论基础

SENA 的理论定位可以概括为：把 collaborative learning 视为一个 social-epistemic nexus，而不是单独的社会网络或单独的概念网络。

SNA 能回答 “who interacts with whom”，但不能说明互动内容是否体现 evidence、explanation、reflection 或 critique。ENA 能回答 “which concepts or discourse moves connect”，但不能说明这些连接由谁推动、通过什么社会关系产生。SENA 的理论贡献在于引入第三层：social-epistemic bridge。

因此，SENA 的最小可计算框架是：

```text
S: person-person social interaction matrix
W: code-code epistemic co-occurrence matrix
B: person-code contribution matrix
```

融合矩阵：

```text
A_fusion = [ alpha*S   gamma*B  ]
           [ gamma*B'  beta*W   ]
```

这与项目文档中的定位一致：SENA 不是把 SNA 图和 ENA 图机械叠加，而是把人-人互动、概念-概念共现、人与概念贡献建模为一个三层异构网络。

## 3. MVP 实现范围

本次 MVP 选择实现 `SENA Fusion Canvas`，因为它是整个框架最能被展示和理解的核心功能。论文草稿中提到的三个系统功能可按阶段推进：

| 功能 | MVP 状态 | 说明 |
|---|---:|---|
| Dual Lens Dashboard | 部分覆盖 | POC 中保留 S/W/B 矩阵和层开关，但还没有完整 conversation stream dashboard |
| SENA Fusion Canvas | 已实现 | 当前核心 demo，可交互、可调权重、可回溯证据 |
| Temporal SENA Trace | 初步实现 | 已有阶段曲线；后续需要 time-window 数据和动态网络动画 |

## 4. 工程可行性

### 已具备

- Next.js 14 + React + TypeScript 应用骨架
- `jena-js` 本地 ENA engine
- `/workspace/ena` 可运行 ENA 分析
- SNA.js 或等价 SNA 计算库已引入，并已完成 benchmark
- 样例数据、CSV parsing、ENA validation 和 tests
- 主题、导航、基础 UI component patterns

### 本次新增

- `lib/sena/model.ts`：SENA 计算核心
- `lib/sena/sample-data.ts`：可演示的协作讨论样例
- `lib/sena/__tests__/sena.test.ts`：SENA 矩阵和指标测试
- `components/sena/SenaFusionWorkspace.tsx`：交互式 POC 工作台
- `app/workspace/sena/page.tsx`：SENA Fusion route
- 修复 `jena-js` 子路径导入问题，使 test/build 可通过

### 仍需验证

- jENA 与成熟 ENA 软件输出的 benchmark parity
- joint embedding 的正式统计解释
- coding reliability、AI-assisted coding 的 human review workflow
- group comparison 的显著性、置信区间或 permutation testing
- export 到 publication-ready SVG/PNG/PDF/report 的质量控制

## 5. 解释边界

MVP 中有三种布局：

- `Explanatory`：人节点在外围，概念节点在中心。适合展示框架，但跨层距离不能解释为统计距离。
- `ENA Space`：人节点位置由其 code contribution profile 的 barycentric approximation 决定。适合解释 epistemic profile，但仍是 POC approximation。
- `Joint`：使用归一化 `A_fusion` 做 deterministic force embedding POC。只有这一类模式才接近 “人和概念共享同一个空间” 的解释，但正式研究仍需明确 embedding 方法、随机种子、归一化、权重和稳定性检验。

POC 页面已在 canvas 下方加入 interpretation guardrail，避免把可读性布局过度解释为潜在空间中的严格距离。

## 6. 下一阶段建议

1. 把 `sampleSenaDataset` 替换为上传式 data contract：people、interactions、utterances、coded_segments、codebook。
2. 在 `/workspace/sena` 增加 CSV/JSON import、column mapping 和 validation warnings。
3. 基于已完成 benchmark 的 SNA.js 能力，把 degree、strength、betweenness、closeness、density、reciprocity、community detection 等指标接入 SENA workspace 的 UI 与报告导出。
4. 将当前 person-code `B` 扩展为 person-code-pair `G`，用于更强地解释 “谁推动了 Evidence-Explanation 连接”。
5. 增加 Dual Lens Dashboard，把 raw conversation stream 与 SNA/ENA 分离视图放在 fusion 之前。
6. 增加 temporal window builder，支持 stage、moving window、turn window 和 animation。
7. 增加 report generator：导出参数、矩阵、图、evidence snippets 和 human-reviewed interpretation。
8. 继续对 jENA 做成熟 ENA 软件的 benchmark parity；SNA.js 则保留回归 benchmark，用于后续版本更新时防止指标漂移。

## 7. 当前运行方式

```bash
cd /Users/dongpinhu/Desktop/SENA/sena-hk-template
npm run dev
```

打开：

```text
http://localhost:3000/workspace/sena
```

验证命令：

```bash
npm test
npm run build
```

当前测试状态：`10 passed`。当前 build 状态：成功生成 `/workspace/sena` 静态页面。
