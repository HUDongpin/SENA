from __future__ import annotations

import shutil
import subprocess
import tempfile
import textwrap
import zipfile
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/dongpinhu/Desktop/SENA")
REPORT_DIR = ROOT / "reports" / "sena_application_domain_report_build"
OUTPUT_DOCX = ROOT / "reports" / "SENA_应用领域深度分析报告_2026-06-08.docx"
OUTPUT_MD = REPORT_DIR / "SENA_应用领域深度分析报告_2026-06-08.md"
FIGURE_1 = REPORT_DIR / "figure_1_sena_stack.png"
FIGURE_2 = REPORT_DIR / "figure_2_priority_matrix.png"
BASE_DOCX = REPORT_DIR / "SENA_应用领域深度分析报告_2026-06-08.base.docx"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
ET.register_namespace("w", W_NS)
NS = {"w": W_NS}


def font(path: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def wrap(draw: ImageDraw.ImageDraw, text: str, max_width: int, text_font: ImageFont.ImageFont) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        width = draw.textbbox((0, 0), candidate, font=text_font)[2]
        if width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], fill: str = "#333333") -> None:
    draw.line([start, end], fill=fill, width=4)
    x1, y1 = end
    x0, y0 = start
    if x1 == x0 and y1 == y0:
        return
    dx = x1 - x0
    dy = y1 - y0
    length = (dx * dx + dy * dy) ** 0.5
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    arrow_len = 18
    arrow_width = 8
    p1 = (x1, y1)
    p2 = (int(x1 - ux * arrow_len + px * arrow_width), int(y1 - uy * arrow_len + py * arrow_width))
    p3 = (int(x1 - ux * arrow_len - px * arrow_width), int(y1 - uy * arrow_len - py * arrow_width))
    draw.polygon([p1, p2, p3], fill=fill)


def rounded_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    lines: Iterable[str],
    fill: str,
    outline: str = "#333333",
) -> None:
    draw.rounded_rectangle(box, radius=22, fill=fill, outline=outline, width=3)
    x0, y0, x1, y1 = box
    title_font = font(FONT_BOLD, 32)
    body_font = font(FONT_REGULAR, 25)
    draw.text((x0 + 24, y0 + 18), title, fill="#111111", font=title_font)
    y = y0 + 72
    for line in lines:
        draw.text((x0 + 26, y), f"- {line}", fill="#222222", font=body_font)
        y += 34


def generate_figure_1(path: Path) -> None:
    image = Image.new("RGB", (1700, 980), "white")
    draw = ImageDraw.Draw(image)
    title_font = font(FONT_BOLD, 40)
    draw.text((60, 36), "Current SENA analytical stack and evidence flow", fill="#111111", font=title_font)

    rounded_box(
        draw,
        (70, 140, 470, 520),
        "Input data contract",
        [
            "people",
            "interactions",
            "utterances",
            "coded_segments",
            "codebook",
        ],
        "#EEF5FF",
    )
    rounded_box(
        draw,
        (630, 120, 1080, 600),
        "Current computation layer",
        [
            "S, W, B, and G matrices",
            "weighted fusion matrix",
            "stage / moving / turn windows",
            "social metrics via sna.js",
            "evidence-linked edges and pairs",
        ],
        "#F6F0FF",
    )
    rounded_box(
        draw,
        (1240, 120, 1620, 600),
        "Current workspace outputs",
        [
            "Fusion Canvas",
            "SNA report",
            "pair contribution report",
            "report JSON / Markdown",
            "interactive inspector",
        ],
        "#EEFBEF",
    )
    rounded_box(
        draw,
        (320, 690, 1410, 890),
        "Current boundary conditions",
        [
            "joint layout is a proof of concept rather than a validated latent-space model",
            "benchmark parity, uncertainty, coding reliability, anonymization, and backend governance remain open work",
        ],
        "#FFF7E8",
    )

    draw_arrow(draw, (470, 330), (630, 330))
    draw_arrow(draw, (1080, 330), (1240, 330))
    draw_arrow(draw, (855, 600), (855, 690))

    image.save(path)


def generate_figure_2(path: Path) -> None:
    domains = [
        ("Research", 4.8, 4.8, "#1f77b4"),
        ("Education", 4.2, 4.5, "#2ca02c"),
        ("Learning analytics", 3.9, 4.7, "#ff7f0e"),
        ("Social-cognitive network", 3.7, 4.1, "#9467bd"),
        ("Organization collaboration", 2.7, 3.9, "#8c564b"),
        ("Policy / evaluation", 2.4, 4.0, "#d62728"),
        ("Productization", 2.6, 4.4, "#17becf"),
    ]

    image = Image.new("RGB", (1700, 980), "white")
    draw = ImageDraw.Draw(image)
    title_font = font(FONT_BOLD, 40)
    axis_font = font(FONT_BOLD, 28)
    label_font = font(FONT_REGULAR, 24)
    draw.text((60, 36), "Application-domain priority matrix", fill="#111111", font=title_font)

    chart = (170, 140, 1480, 860)
    x0, y0, x1, y1 = chart

    draw.rectangle((x0, y0, (x0 + x1) // 2, (y0 + y1) // 2), fill="#FBFBFB")
    draw.rectangle((((x0 + x1) // 2), y0, x1, (y0 + y1) // 2), fill="#F2FAF1")
    draw.rectangle((x0, (y0 + y1) // 2, (x0 + x1) // 2, y1), fill="#FFF8F2")
    draw.rectangle((((x0 + x1) // 2), (y0 + y1) // 2, x1, y1), fill="#EEF7FF")

    draw.line((x0, y1, x1, y1), fill="#222222", width=4)
    draw.line((x0, y0, x0, y1), fill="#222222", width=4)

    for i in range(1, 6):
        x = x0 + (x1 - x0) * i / 5
        y = y1 - (y1 - y0) * i / 5
        draw.line((int(x), y0, int(x), y1), fill="#DDDDDD", width=1)
        draw.line((x0, int(y), x1, int(y)), fill="#DDDDDD", width=1)
        draw.text((int(x) - 7, y1 + 12), str(i), fill="#444444", font=label_font)
        draw.text((x0 - 34, int(y) - 12), str(i), fill="#444444", font=label_font)

    draw.text((610, 900), "Current code fit and implementation readiness", fill="#111111", font=axis_font)
    draw.text((20, 320), "Strategic value", fill="#111111", font=axis_font)
    draw.text((1110, 165), "Priority now", fill="#255B1C", font=axis_font)
    draw.text((205, 165), "Research risk / validation load", fill="#7B4B00", font=axis_font)

    for label, x_score, y_score, fill in domains:
        x = x0 + (x1 - x0) * (x_score - 1) / 4
        y = y1 - (y1 - y0) * (y_score - 1) / 4
        radius = 40 if y_score >= 4.4 else 34
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill, outline="#333333", width=3)
        lines = wrap(draw, label, 180, label_font)
        label_y = y + radius + 12
        for index, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=label_font)
            draw.text((x - (bbox[2] - bbox[0]) / 2, label_y + index * 26), line, fill="#111111", font=label_font)

    image.save(path)


def build_markdown() -> str:
    return textwrap.dedent(
        f"""\
        # SENA 应用领域深度分析报告

        本报告基于当前 SENA 项目代码、现有页面文案、项目记忆与仓库内分析文档撰写，重点回答一个实际问题：**以当前代码基线看，SENA 最适合先落在哪些应用领域，为什么，下一步要补什么，哪些场景应当谨慎后置。**

        执行摘要先给出结论。第一，SENA 当前最强的应用锚点仍然是**研究型协作学习分析**，因为它已经具备清晰的数据契约、可计算的社会层与认识论层、桥接矩阵、时间窗、证据回溯与基础报告导出。第二，最值得作为近期产品化试点的场景是**教育改进与学习分析**，尤其是 lesson study、教师协作、知识建构课堂和课程团队复盘。第三，**组织协作、政策/评估与广义 SaaS 产品化**并非没有价值，而是它们对数据治理、匿名化、统计稳健性、访问控制与部署架构的要求显著高于当前 MVP。

        如 Table 1 所示，当前仓库已经把 SENA 从概念草图推进到了一个可运行的 fusion workspace：项目支持 `people`、`interactions`、`utterances`、`coded_segments`、`codebook` 五张核心表，能构造 `S`、`W`、`B`、`G` 与 weighted fusion matrix，并生成社会指标、时序窗口、证据链接与 JSON/Markdown 报告。这意味着 SENA 已经能够服务“带有明确语料、明确编码框架、明确分析单位”的应用；它最不适合的则是“没有可解释编码框架、没有隐私治理、希望直接自动化结论生成”的场景。

        **Table 1**

        *Current SENA capability-to-application map*

        | 能力模块 | 当前项目依据 | 对应用范围的含义 |
        |---|---|---|
        | 数据契约与导入 | 当前 workspace 支持 `people`、`interactions`、`utterances`、`coded_segments`、`codebook` 五表结构，并带有列名自动映射与导入警告。 | 适合有明确定义数据表、可追溯说话轮次与编码段的数据集；不适合完全无结构日志直接入模。 |
        | 核心矩阵 | 已实现 `S`、`W`、`B`、`G` 和 fusion matrix。 | 能同时回答“谁和谁互动”“哪些概念共同激活”“谁推动了哪些概念与 code-pair 连接”。 |
        | 社会层分析 | 项目记忆与当前代码共同表明，系统已覆盖 density、tie count、components、average path length、degree、strength、closeness、reachable nodes，并在 workspace 报告层进一步呈现 reciprocity、betweenness 与 deterministic community detection。 | 对教师协作、学习参与角色、组织协作角色识别很有价值。 |
        | 时序分析 | 已支持 stage、moving-window、turn-window 三类 temporal windows。 | 适合研究协作过程演化、课程阶段变化、干预前后变化与活动设计节奏。 |
        | 证据追溯 | 边、pair contribution 与 temporal window 都能回连原始 utterance / segment evidence。 | 有利于研究解释、教师复盘与 human-reviewed reporting，不适合“黑箱评分”。 |
        | 导出与报告 | 当前可导出 model JSON、social report、G report、report JSON/Markdown。 | 已具备研究与内部试点的报告基础，但尚未内建 publication-ready Word/PDF pipeline。 |
        | 解释护栏 | workspace 明确声明 cross-layer distance 在 explanatory / ENA-space 模式下不应当被解释为严格统计距离，joint mode 只是 shared embedding proof of concept。 | 适合作为 exploratory / interpretive analytics；若要做高风险决策，仍需补正式 joint embedding 与统计验证。 |
        | 平台缺口 | README 与伦理区块都指出：后端、身份认证、匿名化、审计日志、AI coding transparency、访问控制、正式 benchmark parity 仍待建设。 | 说明当前更适合 pilot、研究与小范围教学改进，而非直接机构级治理或商业化规模部署。 |

        如 Figure 1 所示，当前 SENA 的逻辑已经非常清楚：输入层是五张结构化数据表，中间层是 `S/W/B/G + fusion` 的计算与时序切片，输出层是 Fusion Canvas、SNA 指标、pair contribution、temporal trace 与 report export。与此同时，底部还保留了一个清晰但尚未完全补齐的“边界条件层”，包括 benchmark parity、uncertainty、coding reliability、anonymization 与 backend governance。

        ![]({FIGURE_1.name})

        **Figure 1**

        *Current SENA analytical stack and evidence flow*

        *Note.* The figure summarizes the current project state inferred from the SENA workspace code, README, project memory, and feasibility notes.

        ## 1. 研究场景

        **价值：** 研究场景是当前 SENA 与代码基线最吻合的应用领域。项目已经围绕协作互动、话语转录、coded segments、codebook 与 temporal windows 组织数据结构，这与 ENA 对 coded connection 的要求高度一致，也与将社会关系和认识论关系并置分析的方向一致 (Shaffer et al., 2016; Gašević et al., 2019; Swiecki & Shaffer, 2020)。  
        **典型使用情境：** CSCL 研究、课程设计研究、跨组比较、干预前后比较、同一团队在 brainstorming → evidence building → reflection 各阶段的变化研究。项目中 `ResearchCases.tsx` 已经公开展示了 MOOC collaborative learning、knowledge building、teacher scaffolding 与 deep learning representation 等案例方向。  
        **数据需求：** 至少需要可识别参与者、互动关系、话轮文本、编码段与 codebook；若要做稳健时间分析，还应保留 stage、turn index、unit/stanza 与 outcome metadata。  
        **方法适配性：** 当前 `S/W/B/G` 结构特别适合研究“谁推动了哪些概念连接”而不仅是“谁最活跃”或“哪些 code 最常共现”。`G` 矩阵让研究者能把个体贡献与 code-pair activation 对接起来，这是普通 SNA 或普通 ENA 各自做不到的。  
        **潜在限制：** 目前 joint layout 仍是 POC；group comparison、significance、uncertainty、benchmark parity 和 coding reliability 还没有形成正式研究工作流。  
        **伦理/隐私风险：** 研究场景通常涉及课堂对话、论坛帖子、身份与成绩信息，必须把“可视化方便”与“参与者可识别风险”分开处理；系统当前也还没有正式匿名化与审计日志模块。  
        **实施路线：** 近期应优先把研究场景作为 SENA 的第一落地面：补 CSV/JSON 上传模板文档、codebook 模板、human review fields、publication-ready figure export、benchmark notes 与 dataset manifest。  
        **优先级建议：** 最高优先级（Tier 1）。这是最能直接验证 SENA 理论主张、也最能基于现有代码快速形成高质量案例的领域。

        ## 2. 教育场景

        **价值：** 教育场景与研究场景高度相邻，但目标更偏向 formative improvement，而不是正式发表。当前项目公开页面已经把 interdisciplinary lesson study、teacher collaboration、knowledge building 和 teacher scaffolding 视为直接应用方向，这说明产品叙事与方法设计本身已经在面向教育使用者。  
        **典型使用情境：** lesson study 团队复盘、教师专业发展工作坊、课堂协作任务回顾、学生小组讨论质量反馈、知识建构课程的阶段性诊断。Pantić et al. (2022) 表明 social and epistemic network analysis 对教师 agency for change 的理解具有解释力，这与 SENA 的桥接层定位相符。  
        **数据需求：** 除基础五表外，还需要课程阶段、任务类型、角色标签、班级/小组信息，以及可供教师理解的 outcome anchors，例如 rubric、artifact quality 或 reflection notes。  
        **方法适配性：** 当前系统的 stage windows、evidence-linked inspector 和 pair contribution 报告非常适合做“这一阶段谁在推动 evidence-explanation-critique 的连接”“教师支架是否改变了讨论结构”这类问题。Ouyang and Dai (2022) 所提出的 three-layered social-cognitive network analysis 也说明教育场景重视社会参与角色、认知结构与时间变化的同时解释。  
        **潜在限制：** 若教育使用者期待“一键评分”或“自动判定谁表现差”，当前方法并不适合；它更适合教师引导型解释，而非直接替代专业判断。  
        **伦理/隐私风险：** 教室场景往往同时涉及未成年人、成绩、课堂摄录、敏感互动关系。若把 centrality 或 discourse quality 直接用于评价个体，容易造成标签化与误用。  
        **实施路线：** 先做教师/课程团队专用 pilot：增加课程模板、角色模板、阶段标签模板、可打印报告与更友好的“evidence snippets + reflective prompts”页面。  
        **优先级建议：** 最高优先级（Tier 1）。它比正式研究更容易形成试点，也最能体现 SENA 对教学设计和教师复盘的直接价值。

        ## 3. 组织协作场景

        **价值：** 组织协作场景可以把 SENA 从教育研究方法扩展为知识工作分析工具，用于理解团队讨论如何把角色关系、任务协调与问题解决连接起来。理论上，这与 multilayer network 和 heterogeneous network 的思路一致 (Kivelä et al., 2014)。  
        **典型使用情境：** 研究团队会议、跨部门项目复盘、产品评审会、政策工作组协商记录、医院或学校的跨专业协作会议分析。  
        **数据需求：** 基础五表仍然成立，但组织场景对 interaction extraction 与 coding schema 的要求更高，因为 Slack、email、meeting transcript 与 issue tracker 数据并不会天然落在当前 SENA contract 上。  
        **方法适配性：** 如果组织已愿意使用明确的 discourse codebook，例如 decision making、evidence use、risk escalation、handoff、coordination，那么当前 B/G 结构就很有价值，能够揭示“谁在推动哪类知识连接与组织协调”。  
        **潜在限制：** 当前项目没有企业身份权限、保留策略、细粒度审计、批处理管线，也没有专门针对异步沟通数据的 ingestion layer。  
        **伦理/隐私风险：** 这是高风险场景。组织沟通数据包含绩效、权力关系、敏感业务信息与员工画像风险。如果没有 consent、purpose limitation 与 access control，SENA 很容易从协作改进工具滑向监控工具。  
        **实施路线：** 该场景不应作为第一批公开产品目标，而应在研究/教育 pilot 稳定后，通过小范围合作项目验证。需要先补 anonymization、RBAC、审计日志、组织级 codebook governance 与 secure backend。  
        **优先级建议：** 中等优先级（Tier 2）。价值大，但治理成本显著高于当前代码准备度。

        ## 4. 学习分析场景

        **价值：** 学习分析是当前项目最值得加速靠近的场景之一，因为 SENA 天然可以充当“把 social participation 与 epistemic engagement 放在同一个解释框架里”的 dashboard engine，而不是只报点击量或发帖量。SENS、iSENS 与 SeNA 都在不同程度上说明将 social 与 epistemic 维度结合，有助于更有信息量地理解学习过程 (Gašević et al., 2019; Swiecki & Shaffer, 2020; Yan et al., 2023)。  
        **典型使用情境：** 课程仪表板、MOOC 论坛过程监控、项目制学习小组比较、教练或教学助理的 formative intervention dashboard。  
        **数据需求：** 除标准五表外，learning analytics 场景通常还需要 course roster、time stamps、assignment metadata、outcome linkage、dashboard access roles 与 intervention logs。  
        **方法适配性：** 当前 temporal window builder、social metrics panel 与 report generator 已经具备 dashboard 核心骨架。对于“哪些小组虽然互动多，但证据-解释连接弱”“谁虽然不是最 central，但在关键 code-pair 上有高贡献”这类问题，SENA 比传统 activity analytics 更强。  
        **潜在限制：** 目前缺少 near-real-time backend、batch jobs、dashboard persistence、institutional authentication 与 cross-course model governance。  
        **伦理/隐私风险：** 学习分析一旦接近实时干预，就会放大 consent、student agency、model opacity 与 data minimization 问题。Slade and Prinsloo (2013) 与 Drachsler and Greller (2016) 都提醒我们，学习分析不能默认把“能算”当作“该用”。  
        **实施路线：** 应把学习分析定位为 Tier 1.5 场景：先从课程团队内部 dashboard 与 weekly review report 起步，而不是做实时学生监控。技术上优先补 authentication、saved analyses、result snapshots、teacher-facing guidance 与 governance checklist。  
        **优先级建议：** 高优先级（Tier 1），但应先做 instructor-facing pilot，而非 student-facing automated intervention system。

        ## 5. 社会-认知网络分析场景

        **价值：** 这是最能体现 SENA 方法学独特性的领域。与其把它看作一个单独行业，不如把它看作 SENA 的“方法实验室”场景：研究者可以用它比较 SNA、ENA、SENS、iSENS、SeNA、SCNA 与多层网络表征的差异。  
        **典型使用情境：** 方法论文、比较研究、grant proposal 中的方法演示、跨研究团队的 shared analytic workbench。  
        **数据需求：** 与研究场景类似，但更强调可重复的数据清单、参数日志、normalization 记录、window rules、benchmark notes 与 versioned codebooks。  
        **方法适配性：** 当前项目已经把“joint mode 只是 proof of concept”“cross-layer distance 不可随意解释”明确写进 workspace guardrail，这反而为方法学场景加分，因为它表明项目没有把 exploratory visualization 伪装成完成的统计模型。Bowman et al. (2021) 对 ENA 数学基础的澄清，也支持把 SENA 明确表述为 fusion adjacency representation，而不是直接声称自己已经完成传统 ENA 的全部统计解释。  
        **潜在限制：** 目前还没有 formal uncertainty estimates、permutation testing、comparison workflow、stability diagnostics 与 richer benchmark suite。  
        **伦理/隐私风险：** 相对较低，但如果用真实课堂或组织数据做方法演示，仍须遵守最小化披露与匿名化原则。  
        **实施路线：** 将这一场景与研究场景并行推进：保留它作为 grant writing、conference demo 与 methodological validation 的核心阵地。  
        **优先级建议：** 中高优先级（Tier 2）。它不是最先变现的场景，却是最重要的学术护城河。

        ## 6. 政策与评估场景

        **价值：** 政策/评估场景关注的不是单个团队的对话，而是项目、课程、计划或机构层面的比较与证据汇总。理论上，SENA 可以为项目评估提供比传统问卷更细的过程证据。  
        **典型使用情境：** 教改项目评估、教师发展计划评估、跨校协作项目评估、政策试点中的过程性证据采集。  
        **数据需求：** 在五表之外，需要 cohort comparability、sampling rules、intervention metadata、outcome linkage、aggregation rules、uncertainty and confidence documentation。  
        **方法适配性：** SENA 很适合做过程性解释层，帮助评估者说明某项政策或干预是否改变了参与结构、证据使用、反思深度与协作桥接方式。  
        **潜在限制：** 当前代码还不具备机构级 aggregation、case comparison pipeline、governance dashboard、approval workflow 与 statistical reporting robustness。没有这些支撑时，把 exploratory network evidence 直接上升为政策判断是过早的。  
        **伦理/隐私风险：** 高。政策与评估场景容易把群体层分析向个体追责滑移；同时跨项目数据整合会显著放大去标识化失败风险。  
        **实施路线：** 该场景应当晚于研究、教育和教师/课程 learning analytics 试点。先把 SENA 作为“evaluation companion tool”，而不是“policy score engine”。  
        **优先级建议：** 中低优先级（Tier 3）。长期重要，但当前方法与治理成熟度都不足以支撑大规模评估决策。

        ## 7. 产品化场景

        **价值：** 产品化不是单一应用领域，而是前述领域能否被稳定封装、部署与持续服务的综合结果。SENA 作为产品的潜力，在于它不是一般的 network visualization，而是把 social structure、epistemic structure、bridge contribution、temporal change 和 evidence review 串成一个工作台。  
        **典型使用情境：** 研究团队 SaaS、机构内分析门户、课程团队订阅式 dashboard、方法咨询与报告服务平台。  
        **数据需求：** 除分析数据本身，还需要 tenants、permissions、saved projects、job queues、audit logs、secure storage、API contracts、report templates 与 admin tooling。  
        **方法适配性：** 当前前端与本地分析逻辑已经证明交互式产品体验可以成立；README 也明确指出后续应补身份认证、上传、报告、日志与后端服务。换句话说，产品化在架构上是 plausible 的，但还不是 deployment-ready。  
        **潜在限制：** 现在的项目仍然更像 high-quality MVP / research platform template，而不是 production SaaS。没有 backend orchestration、observability、privacy-by-design pipeline、billing/tenant model，就不能把“可演示”误判为“可交付”。  
        **伦理/隐私风险：** 产品化会把所有前述风险放大，因为 scale 会带来更多数据、更复杂权限与更多误用机会。  
        **实施路线：** 产品化应被拆成三个阶段：先做 research/education pilot package，再做 institution-facing secure deployment，再考虑 generalized SaaS。  
        **优先级建议：** 条件性优先级（Tier 3）。它在商业上可能重要，但从当前项目成熟度看，不应早于研究、教育和 instructor-facing learning analytics。

        ## 8. 跨领域方法与治理要求

        跨领域看，SENA 最关键的数据要求并不是“数据多”，而是“数据结构清楚、编码框架清楚、证据链清楚”。当前项目的数据契约已经很好地定义了这一点，因此近期最值得坚持的策略不是盲目扩张数据源，而是维持 contract discipline：谁是 actor，什么是 interaction，哪一段文本被赋予了哪些 code，时间窗如何定义，哪些结论必须回连原始证据。

        同样重要的是治理要求。当前页面的 ethics section 已经把 anonymization、role-based access control、consent/IRB metadata、audit logs、AI coding transparency、bias warnings、reproducibility exports 与 human review 列为可信使用前提。这些并不是“以后再说的锦上添花”，而是决定 SENA 能否进入 learning analytics、organization collaboration 与 policy/evaluation 场景的硬门槛。

        ## 9. 优先级与实施路线

        Table 2 总结了基于当前代码基线而非抽象愿景所做的优先级判断。这里的 `当前代码适配度` 反映现有功能与该场景的贴合程度，`战略价值` 反映其长期影响与代表性，`实施/治理负担` 越高表示越不应过早推进。

        **Table 2**

        *Application-domain priority summary*

        | 应用领域 | 当前代码适配度 (1-5) | 战略价值 (1-5) | 实施/治理负担 (1-5) | 建议优先级 |
        |---|---:|---:|---:|---|
        | 研究 | 5.0 | 5.0 | 2.0 | Tier 1 |
        | 教育 | 4.0 | 5.0 | 2.0 | Tier 1 |
        | 学习分析 | 4.0 | 5.0 | 3.0 | Tier 1 |
        | 社会-认知网络分析 | 4.0 | 4.0 | 3.0 | Tier 2 |
        | 组织协作 | 3.0 | 4.0 | 4.0 | Tier 2 |
        | 政策/评估 | 2.0 | 4.0 | 5.0 | Tier 3 |
        | 产品化 | 3.0 | 4.0 | 5.0 | Tier 3 |

        *Note.* Higher implementation/governance load indicates stronger reasons to delay full-scale rollout even when strategic value is high.

        Figure 2 把同样的判断放在一个二维矩阵里。右上象限是应该先投入的方向，左上象限是价值高但治理或验证成本过大的方向，右下象限则通常意味着“技术上能做，但不是当前最值得优先的机会”。

        ![]({FIGURE_2.name})

        **Figure 2**

        *Application-domain priority matrix*

        *Note.* Positions are analytic judgments grounded in the current SENA codebase and project documents, not empirical product-market-fit measurements.

        **Table 3**

        *Recommended phased implementation roadmap*

        | 阶段 | 核心目标 | 需要补充的能力 | 代表性交付物 |
        |---|---|---|---|
        | 0-3 个月 | 夯实研究与教育 pilot | 上传模板、codebook templates、publication-ready exports、benchmark notes、human review workflow | 2-3 个高质量研究/课程试点案例与标准报告模板 |
        | 3-6 个月 | 做 instructor-facing learning analytics | 身份认证、saved analyses、result snapshots、teacher guidance、governance checklist | 课程团队 dashboard 与周期性复盘报告 |
        | 6-12 个月 | 谨慎扩展到组织协作与机构部署 | anonymization pipeline、RBAC、audit logs、secure backend、batch jobs、API contracts | 受控机构试点、项目级评估伴随工具 |

        综合来看，当前 SENA 最应该坚持的不是“功能越多越好”，而是“应用场景与方法成熟度严格匹配”。如果项目把研究、教育与 instructor-facing learning analytics 做深，SENA 将同时获得理论可信度、产品可解释性与真实使用反馈；如果过早冲向组织监控、政策评分或通用 SaaS，当前代码与治理基础都还不足以支撑。

        因此，本报告的最终建议是：

        1. 把**研究 + 教育 + instructor-facing learning analytics**作为近期主航道。
        2. 把**社会-认知网络方法验证**作为学术护城河，持续补 benchmark、uncertainty 与 comparison workflow。
        3. 把**组织协作、政策/评估与广义产品化**放在治理与后端能力补齐之后，再进入正式规模化推进。

        ## References

        Bowman, N. A., Frank, K. A., & Shaffer, D. W. (2021). The mathematical foundations of epistemic network analysis. In D. Williamson Shaffer (Ed.), *Computer-supported collaboration with epistemic network analysis* (pp. 91-108). Springer. https://doi.org/10.1007/978-3-030-67788-6_7

        Drachsler, H., & Greller, W. (2016). Privacy and analytics: It’s a DELICATE issue. In *Proceedings of the Sixth International Conference on Learning Analytics & Knowledge* (pp. 89-98). ACM. https://doi.org/10.1145/2883851.2883893

        Gašević, D., Joksimović, S., Eagan, B. R., & Shaffer, D. W. (2019). SENS: Network analytics to combine social and cognitive perspectives of collaborative learning. *Computers in Human Behavior, 92*, 562-577. https://doi.org/10.1016/j.chb.2018.07.003

        Kivelä, M., Arenas, A., Barthelemy, M., Gleeson, J. P., Moreno, Y., & Porter, M. A. (2014). Multilayer networks. *Journal of Complex Networks, 2*(3), 203-271. https://doi.org/10.1093/comnet/cnu016

        Ouyang, F., & Dai, X. (2022). A three-layered social-cognitive network analysis framework for examining online collaborative learning. *Australasian Journal of Educational Technology, 38*(5), 74-91. https://doi.org/10.14742/ajet.7166

        Pantić, N., Brown, C., Florian, L., & Jääskeläinen, A. (2022). Making sense of teacher agency for change with social and epistemic network analysis. *Journal of Educational Change, 23*, 717-739. https://doi.org/10.1007/s10833-021-09413-7

        Shaffer, D. W., Collier, W., & Ruis, A. R. (2016). A tutorial on epistemic network analysis: Analyzing the structure of connections in cognitive, social, and interaction data. *Journal of Learning Analytics, 3*(3), 9-45. https://doi.org/10.18608/jla.2016.33.3

        Siebert-Evenstone, A. L., Irgens, G. A., Collier, W., Swiecki, Z., Ruis, A. R., & Shaffer, D. W. (2017). In search of conversational grain size: Modeling semantic structure using moving stanza windows. *Journal of Learning Analytics, 4*(3), 123-139. https://doi.org/10.18608/jla.2017.43.7

        Slade, S., & Prinsloo, P. (2013). Learning analytics: Ethical issues and dilemmas. *American Behavioral Scientist, 57*(10), 1510-1529. https://doi.org/10.1177/0002764213479366

        Swiecki, Z., & Shaffer, D. W. (2020). iSENS: An integrated approach to combining epistemic and social network analyses. In *Proceedings of the Tenth International Conference on Learning Analytics & Knowledge* (pp. 177-181). ACM. https://doi.org/10.1145/3375462.3375505

        Yan, L., Martinez-Maldonado, R., Zhao, Y., Li, X., & Gašević, D. (2023). SeNA: Modelling socio-spatial analytics on homophily by integrating social and epistemic network analysis. In *Proceedings of the 13th International Learning Analytics and Knowledge Conference* (pp. 455-466). ACM. https://doi.org/10.1145/3576050.3576054
        """
    )


def ensure_ppr(paragraph: ET.Element) -> ET.Element:
    ppr = paragraph.find("w:pPr", NS)
    if ppr is None:
        ppr = ET.Element(f"{{{W_NS}}}pPr")
        paragraph.insert(0, ppr)
    return ppr


def set_spacing(ppr: ET.Element, before: str = "0", after: str = "120") -> None:
    spacing = ppr.find("w:spacing", NS)
    if spacing is None:
        spacing = ET.SubElement(ppr, f"{{{W_NS}}}spacing")
    spacing.set(f"{{{W_NS}}}before", before)
    spacing.set(f"{{{W_NS}}}after", after)


def paragraph_text(paragraph: ET.Element) -> str:
    return "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()


def set_justification(ppr: ET.Element, value: str = "both") -> None:
    jc = ppr.find("w:jc", NS)
    if jc is None:
        jc = ET.SubElement(ppr, f"{{{W_NS}}}jc")
    jc.set(f"{{{W_NS}}}val", value)


def set_indent(ppr: ET.Element, left: str, hanging: str | None = None) -> None:
    ind = ppr.find("w:ind", NS)
    if ind is None:
        ind = ET.SubElement(ppr, f"{{{W_NS}}}ind")
    ind.set(f"{{{W_NS}}}left", left)
    if hanging is not None:
        ind.set(f"{{{W_NS}}}hanging", hanging)


def add_keep_next(ppr: ET.Element) -> None:
    if ppr.find("w:keepNext", NS) is None:
        ET.SubElement(ppr, f"{{{W_NS}}}keepNext")


def find_style(root: ET.Element, style_id: str) -> ET.Element | None:
    for style in root.findall("w:style", NS):
        if style.get(f"{{{W_NS}}}styleId") == style_id:
            return style
    return None


def ensure_rpr(style: ET.Element) -> ET.Element:
    rpr = style.find("w:rPr", NS)
    if rpr is None:
        rpr = ET.SubElement(style, f"{{{W_NS}}}rPr")
    return rpr


def ensure_style_ppr(style: ET.Element) -> ET.Element:
    ppr = style.find("w:pPr", NS)
    if ppr is None:
        ppr = ET.SubElement(style, f"{{{W_NS}}}pPr")
    return ppr


def set_style_fonts(rpr: ET.Element, size_half_points: str) -> None:
    fonts = rpr.find("w:rFonts", NS)
    if fonts is None:
        fonts = ET.SubElement(rpr, f"{{{W_NS}}}rFonts")
    for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
        fonts.set(f"{{{W_NS}}}{attr}", "Times New Roman")
    for attr in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
        fonts.attrib.pop(f"{{{W_NS}}}{attr}", None)

    sz = rpr.find("w:sz", NS)
    if sz is None:
        sz = ET.SubElement(rpr, f"{{{W_NS}}}sz")
    sz.set(f"{{{W_NS}}}val", size_half_points)
    sz_cs = rpr.find("w:szCs", NS)
    if sz_cs is None:
        sz_cs = ET.SubElement(rpr, f"{{{W_NS}}}szCs")
    sz_cs.set(f"{{{W_NS}}}val", size_half_points)


def set_table_borders(tbl_pr: ET.Element) -> None:
    borders = tbl_pr.find("w:tblBorders", NS)
    if borders is None:
        borders = ET.SubElement(tbl_pr, f"{{{W_NS}}}tblBorders")
    spec = {
        "top": "single",
        "bottom": "single",
        "left": "nil",
        "right": "nil",
        "insideH": "nil",
        "insideV": "nil",
    }
    for edge, val in spec.items():
        child = borders.find(f"w:{edge}", NS)
        if child is None:
            child = ET.SubElement(borders, f"{{{W_NS}}}{edge}")
        child.set(f"{{{W_NS}}}val", val)
        if val == "single":
            child.set(f"{{{W_NS}}}sz", "8")
            child.set(f"{{{W_NS}}}space", "0")
            child.set(f"{{{W_NS}}}color", "000000")


def patch_docx(docx_path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="sena_docx_patch_") as temp_dir:
        temp_path = Path(temp_dir)
        with zipfile.ZipFile(docx_path, "r") as source_zip:
            source_zip.extractall(temp_path)

        styles_path = temp_path / "word" / "styles.xml"
        styles_root = ET.parse(styles_path).getroot()

        doc_defaults = styles_root.find("w:docDefaults", NS)
        if doc_defaults is not None:
            rpr_default = doc_defaults.find("w:rPrDefault/w:rPr", NS)
            if rpr_default is not None:
                set_style_fonts(rpr_default, "24")

        for style_id in ("Normal", "Compact"):
            style = find_style(styles_root, style_id)
            if style is not None:
                ppr = ensure_style_ppr(style)
                set_justification(ppr, "both")
                set_spacing(ppr, before="0", after="120" if style_id == "Normal" else "0")
                rpr = ensure_rpr(style)
                set_style_fonts(rpr, "24")

        for style_id in ("Heading1", "Heading2", "Heading3"):
            style = find_style(styles_root, style_id)
            if style is not None:
                ppr = ensure_style_ppr(style)
                set_spacing(ppr, before="240", after="60")
                add_keep_next(ppr)
                set_justification(ppr, "left")
                rpr = ensure_rpr(style)
                set_style_fonts(rpr, "24")
                color = rpr.find("w:color", NS)
                if color is not None:
                    color.set(f"{{{W_NS}}}val", "000000")
                    for attr in ("themeColor", "themeShade", "themeTint"):
                        color.attrib.pop(f"{{{W_NS}}}{attr}", None)
                if rpr.find("w:b", NS) is None:
                    ET.SubElement(rpr, f"{{{W_NS}}}b")

        table_style = find_style(styles_root, "Table")
        if table_style is not None:
            tbl_pr = table_style.find("w:tblPr", NS)
            if tbl_pr is None:
                tbl_pr = ET.SubElement(table_style, f"{{{W_NS}}}tblPr")
            set_table_borders(tbl_pr)
            tbl_ind = tbl_pr.find("w:tblInd", NS)
            if tbl_ind is None:
                tbl_ind = ET.SubElement(tbl_pr, f"{{{W_NS}}}tblInd")
            tbl_ind.set(f"{{{W_NS}}}type", "dxa")
            tbl_ind.set(f"{{{W_NS}}}w", "120")
            cell_mar = tbl_pr.find("w:tblCellMar", NS)
            if cell_mar is None:
                cell_mar = ET.SubElement(tbl_pr, f"{{{W_NS}}}tblCellMar")
            for edge, width in (("top", "60"), ("bottom", "60"), ("left", "108"), ("right", "108")):
                node = cell_mar.find(f"w:{edge}", NS)
                if node is None:
                    node = ET.SubElement(cell_mar, f"{{{W_NS}}}{edge}")
                node.set(f"{{{W_NS}}}type", "dxa")
                node.set(f"{{{W_NS}}}w", width)

        ET.ElementTree(styles_root).write(styles_path, encoding="utf-8", xml_declaration=True)

        document_path = temp_path / "word" / "document.xml"
        document_root = ET.parse(document_path).getroot()
        body = document_root.find("w:body", NS)
        in_references = False
        previous_was_table_label = False
        previous_was_figure_label = False

        if body is not None:
            for child in body:
                if child.tag == f"{{{W_NS}}}p":
                    text = paragraph_text(child)
                    ppr = ensure_ppr(child)
                    if text == "References":
                        in_references = True
                        set_justification(ppr, "left")
                        set_spacing(ppr, before="240", after="120")
                    elif in_references and text:
                        set_indent(ppr, left="720", hanging="720")
                        set_justification(ppr, "both")
                        set_spacing(ppr, before="0", after="120")
                    elif text.startswith("Table "):
                        previous_was_table_label = True
                        previous_was_figure_label = False
                        add_keep_next(ppr)
                        set_justification(ppr, "left")
                        set_spacing(ppr, before="180", after="0")
                    elif previous_was_table_label:
                        add_keep_next(ppr)
                        set_justification(ppr, "left")
                        set_spacing(ppr, before="0", after="60")
                        previous_was_table_label = False
                    elif text.startswith("Figure "):
                        previous_was_figure_label = True
                        previous_was_table_label = False
                        set_justification(ppr, "left")
                        set_spacing(ppr, before="120", after="0")
                    elif previous_was_figure_label:
                        set_justification(ppr, "left")
                        set_spacing(ppr, before="0", after="60")
                        previous_was_figure_label = False
                    elif text.startswith("Note."):
                        set_justification(ppr, "left")
                        set_spacing(ppr, before="0", after="120")
                    else:
                        set_justification(ppr, "both")
                        set_spacing(ppr, before="0", after="120")

                    if child.find(".//w:drawing", NS) is not None:
                        set_justification(ppr, "center")
                        set_spacing(ppr, before="120", after="60")

                elif child.tag == f"{{{W_NS}}}tbl":
                    previous_was_table_label = False
                    tbl_pr = child.find("w:tblPr", NS)
                    if tbl_pr is None:
                        tbl_pr = ET.SubElement(child, f"{{{W_NS}}}tblPr")
                    set_table_borders(tbl_pr)

        ET.ElementTree(document_root).write(document_path, encoding="utf-8", xml_declaration=True)

        rebuilt = docx_path.with_suffix(".patched.docx")
        with zipfile.ZipFile(rebuilt, "w", zipfile.ZIP_DEFLATED) as out_zip:
            for file_path in temp_path.rglob("*"):
                if file_path.is_file():
                    out_zip.write(file_path, file_path.relative_to(temp_path))
        shutil.move(rebuilt, docx_path)


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DOCX.parent.mkdir(parents=True, exist_ok=True)

    generate_figure_1(FIGURE_1)
    generate_figure_2(FIGURE_2)
    OUTPUT_MD.write_text(build_markdown(), encoding="utf-8")

    subprocess.run(
        [
            "pandoc",
            str(OUTPUT_MD),
            "--resource-path",
            str(REPORT_DIR),
            "-o",
            str(BASE_DOCX),
        ],
        check=True,
    )

    shutil.copyfile(BASE_DOCX, OUTPUT_DOCX)
    patch_docx(OUTPUT_DOCX)
    print(OUTPUT_DOCX)


if __name__ == "__main__":
    main()
