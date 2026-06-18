"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "zhHant" | "zhHans";

type Translation = {
  nav: {
    home: string;
    platform: string;
    method: string;
    workspace: string;
    demo: string;
    docs: string;
    login: string;
    register: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    support: string;
    launch: string;
    method: string;
    demo: string;
    taglines: string[];
  };
  sections: {
    platform: string;
    platformKicker: string;
    method: string;
    methodKicker: string;
    workspace: string;
    workspaceKicker: string;
    cases: string;
    casesKicker: string;
    analytics: string;
    analyticsKicker: string;
    ethics: string;
    ethicsKicker: string;
    docs: string;
    docsKicker: string;
  };
  labels: {
    inputs: string;
    outputs: string;
    role: string;
    email: string;
    password: string;
    fullName: string;
    organization: string;
    confirmPassword: string;
    inviteCode: string;
    remember: string;
    forgot: string;
    sso: string;
    orcid: string;
    google: string;
    already: string;
    noAccount: string;
    aiNotice: string;
  };
  footer: {
    line: string;
    built: string;
  };
};

export const dictionary: Record<Lang, Translation> = {
  en: {
    nav: {
      home: "Home",
      platform: "Platform",
      method: "Method",
      workspace: "Workspace",
      demo: "Demo",
      docs: "Docs",
      login: "Log in",
      register: "Register"
    },
    hero: {
      eyebrow: "Social-Epistemic Nexus Analytics",
      title: "Social-Epistemic Nexus Analytics",
      subtitle: "An AI-assisted research platform for modeling collaborative discourse as social-epistemic networks.",
      support: "Compare groups, trace learning processes, identify roles, and generate transparent, reproducible network-based reports.",
      launch: "Launch Research Workspace",
      method: "Explore SENA Method",
      demo: "View Demo",
      taglines: [
        "Map people, ideas, and learning through social-epistemic networks.",
        "Where discourse becomes network evidence.",
        "From discourse to social-epistemic insight."
      ]
    },
    sections: {
      platform: "A complete SENA research workflow",
      platformKicker: "From raw discourse to transparent, reproducible social-epistemic evidence.",
      method: "A nexus framework for people, ideas, roles, and time",
      methodKicker: "SENA connects Social Network Analysis, Epistemic Network Analysis, and SENS into one theory-aligned workflow.",
      workspace: "Enterprise research workspace preview",
      workspaceKicker: "A serious dashboard for importing, coding, comparing, interpreting, and reporting social-epistemic evidence.",
      cases: "Research cases",
      casesKicker: "Built for educational research, discourse analysis, teacher collaboration, and knowledge-building studies.",
      analytics: "Visual analytics gallery",
      analyticsKicker: "Publication-ready network figures, comparison panels, and temporal views for social-epistemic research.",
      ethics: "Ethics, privacy, and reproducibility",
      ethicsKicker: "SENA treats AI as an assistant, not an authority. Every claim should remain auditable and human-reviewed.",
      docs: "Docs and method library",
      docsKicker: "Scholarly guides, templates, examples, and API-ready documentation for research teams."
    },
    labels: {
      inputs: "Inputs",
      outputs: "Outputs",
      role: "Role",
      email: "Institutional email",
      password: "Password",
      fullName: "Full name",
      organization: "Organization / University",
      confirmPassword: "Confirm password",
      inviteCode: "Invite code (optional)",
      remember: "Remember me",
      forgot: "Forgot password?",
      sso: "Continue with Institution SSO",
      orcid: "Continue with ORCID",
      google: "Continue with Google",
      already: "Already have an account?",
      noAccount: "New to SENA?",
      aiNotice: "AI-generated interpretation: please verify against the coding scheme, network parameters, statistical results, and research context."
    },
    footer: {
      line: "A research platform for modeling collaborative discourse as social-epistemic networks.",
      built: "Built for social-epistemic research, discourse analysis, and reproducible learning analytics."
    }
  },
  zhHant: {
    nav: {
      home: "首頁",
      platform: "平台",
      method: "方法",
      workspace: "工作區",
      demo: "示範",
      docs: "文件",
      login: "登入",
      register: "註冊"
    },
    hero: {
      eyebrow: "社會—知識網絡樞紐分析",
      title: "Social-Epistemic Nexus Analytics",
      subtitle: "一個 AI 輔助的研究平台，用於將協作話語建模為社會—知識網絡。",
      support: "比較群組、追蹤學習歷程、識別角色，並生成透明、可複現的網絡分析報告。",
      launch: "啟動研究工作區",
      method: "探索 SENA 方法",
      demo: "查看示範",
      taglines: [
        "透過社會—知識網絡映射人、觀念與學習。",
        "讓話語成為網絡證據。",
        "從話語走向社會—知識洞察。"
      ]
    },
    sections: {
      platform: "完整的 SENA 研究流程",
      platformKicker: "從原始話語到透明、可複現的社會—知識證據。",
      method: "連結人、觀念、角色與時間的 Nexus 框架",
      methodKicker: "SENA 將社會網絡分析、知識網絡分析與 SENS 整合為一個理論導向的流程。",
      workspace: "企業級研究工作區預覽",
      workspaceKicker: "用於導入、編碼、比較、解釋與報告社會—知識證據的嚴肅研究儀表板。",
      cases: "研究案例",
      casesKicker: "面向教育研究、話語分析、教師協作與知識建構研究。",
      analytics: "視覺分析展示",
      analyticsKicker: "面向出版的網絡圖、比較面板與時間軌跡視圖。",
      ethics: "倫理、隱私與可複現性",
      ethicsKicker: "SENA 將 AI 視為輔助，而非權威；每一項主張都應可審核並經人工檢視。",
      docs: "文件與方法庫",
      docsKicker: "為研究團隊提供學術指南、模板、案例與 API 文件。"
    },
    labels: {
      inputs: "輸入",
      outputs: "輸出",
      role: "角色",
      email: "機構電郵",
      password: "密碼",
      fullName: "姓名",
      organization: "機構／大學",
      confirmPassword: "確認密碼",
      inviteCode: "邀請碼（選填）",
      remember: "記住我",
      forgot: "忘記密碼？",
      sso: "使用機構 SSO 繼續",
      orcid: "使用 ORCID 繼續",
      google: "使用 Google 繼續",
      already: "已有帳戶？",
      noAccount: "第一次使用 SENA？",
      aiNotice: "AI 生成的解釋：請根據編碼方案、網絡參數、統計結果與研究情境進行核驗。"
    },
    footer: {
      line: "將協作話語建模為社會—知識網絡的研究平台。",
      built: "為社會—知識研究、話語分析與可複現學習分析而建。"
    }
  },
  zhHans: {
    nav: {
      home: "首页",
      platform: "平台",
      method: "方法",
      workspace: "工作区",
      demo: "演示",
      docs: "文档",
      login: "登录",
      register: "注册"
    },
    hero: {
      eyebrow: "社会—知识网络枢纽分析",
      title: "Social-Epistemic Nexus Analytics",
      subtitle: "一个 AI 辅助的研究平台，用于将协作话语建模为社会—知识网络。",
      support: "比较群组、追踪学习过程、识别角色，并生成透明、可复现的网络分析报告。",
      launch: "启动研究工作区",
      method: "探索 SENA 方法",
      demo: "查看演示",
      taglines: [
        "通过社会—知识网络映射人、观念与学习。",
        "让话语成为网络证据。",
        "从话语走向社会—知识洞察。"
      ]
    },
    sections: {
      platform: "完整的 SENA 研究流程",
      platformKicker: "从原始话语到透明、可复现的社会—知识证据。",
      method: "连接人、观念、角色与时间的 Nexus 框架",
      methodKicker: "SENA 将社会网络分析、知识网络分析与 SENS 整合为一个理论导向流程。",
      workspace: "企业级研究工作区预览",
      workspaceKicker: "用于导入、编码、比较、解释与报告社会—知识证据的严肃研究仪表盘。",
      cases: "研究案例",
      casesKicker: "面向教育研究、话语分析、教师协作与知识建构研究。",
      analytics: "可视化分析展示",
      analyticsKicker: "面向发表的网络图、比较面板与时间轨迹视图。",
      ethics: "伦理、隐私与可复现性",
      ethicsKicker: "SENA 将 AI 视为辅助，而非权威；每一项主张都应可审计并经人工核验。",
      docs: "文档与方法库",
      docsKicker: "为研究团队提供学术指南、模板、案例与 API 文档。"
    },
    labels: {
      inputs: "输入",
      outputs: "输出",
      role: "角色",
      email: "机构邮箱",
      password: "密码",
      fullName: "姓名",
      organization: "机构／大学",
      confirmPassword: "确认密码",
      inviteCode: "邀请码（选填）",
      remember: "记住我",
      forgot: "忘记密码？",
      sso: "使用机构 SSO 继续",
      orcid: "使用 ORCID 继续",
      google: "使用 Google 继续",
      already: "已有账户？",
      noAccount: "第一次使用 SENA？",
      aiNotice: "AI 生成的解释：请根据编码方案、网络参数、统计结果与研究情境进行核验。"
    },
    footer: {
      line: "将协作话语建模为社会—知识网络的研究平台。",
      built: "为社会—知识研究、话语分析与可复现学习分析而建。"
    }
  }
};

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  copy: Translation;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("sena-lang") as Lang | null;
    if (stored && dictionary[stored]) setLangState(stored);
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem("sena-lang", next);
  };

  const value = useMemo(() => ({ lang, setLang, copy: dictionary[lang] }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
