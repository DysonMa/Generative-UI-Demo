import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { autoFixSpec, validateSpec } from "@json-render/core";
import {
  Renderer,
  StateProvider,
  ActionProvider,
  VisibilityProvider,
  useUIStream,
  defineRegistry,
} from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import { catalog } from "./catalog.js";
import {
  IncidentReport,
  LogTable,
  Metric,
  MetricGrid,
  MetricChart,
  ProductionAlertList,
  ProductionLineTable,
  ProductionOutputChart,
  ProductionOverview,
  ProductionStationTable,
  ServiceDependencyGraph,
  TraceWaterfall,
  observabilitySpec,
} from "./observability.jsx";
import "./styles.css";

const quickPrompts = [
  "分析 checkout-api 最近 30 分鐘的 latency、error logs 和慢 trace，產生問題報告",
  "找出 checkout-api 最慢的 trace，說明可能的根因與建議處置方式",
  "比較 checkout-api 最近 30 分鐘的 p50、p95 latency 與 HTTP 5xx 錯誤率",
  "整理 checkout-api 的錯誤日誌，依服務與嚴重程度歸納問題",
];

const sampleTabs = [
  { id: "overview", label: "事件總覽", question: quickPrompts[0] },
  { id: "trace", label: "慢 Trace 根因", question: quickPrompts[1] },
  { id: "latency", label: "延遲與錯誤率", question: quickPrompts[2] },
  { id: "logs", label: "錯誤日誌報告", question: quickPrompts[3] },
];

function makeSampleSpec(id) {
  const base = structuredClone(observabilitySpec);
  // The chart widget accepts a flat array of timestamp/value points.
  base.state.latencySeries = [
    { timestamp: "10:00", value: 420 }, { timestamp: "10:05", value: 460 },
    { timestamp: "10:10", value: 510 }, { timestamp: "10:15", value: 640 },
    { timestamp: "10:20", value: 780 }, { timestamp: "10:25", value: 870 },
  ];
  base.state.errorSeries = [
    { timestamp: "10:00", value: 0.4 }, { timestamp: "10:05", value: 0.6 },
    { timestamp: "10:10", value: 0.7 }, { timestamp: "10:15", value: 1.4 },
    { timestamp: "10:20", value: 2.8 }, { timestamp: "10:25", value: 3.8 },
  ];

  if (id === "trace") {
    base.root = "sample-trace-root";
    base.elements[base.root] = { type: "Stack", props: { direction: "vertical", gap: "lg" }, children: ["sample-trace-title", "trace-card", "report-card"] };
    base.elements["sample-trace-title"] = { type: "Heading", props: { text: "最慢 Trace 根因分析", level: "h1" }, children: [] };
    base.elements.trace.props.title = "最慢請求：GET /checkout/summary（870 ms）";
  } else if (id === "latency") {
    base.root = "sample-latency-root";
    base.elements[base.root] = { type: "Stack", props: { direction: "vertical", gap: "lg" }, children: ["sample-latency-title", "charts", "summary"] };
    base.elements["sample-latency-title"] = { type: "Heading", props: { text: "Latency 與 HTTP 5xx 趨勢", level: "h1" }, children: [] };
  } else if (id === "logs") {
    base.root = "sample-logs-root";
    base.elements[base.root] = { type: "Stack", props: { direction: "vertical", gap: "lg" }, children: ["sample-logs-title", "logs-card", "report-card"] };
    base.elements["sample-logs-title"] = { type: "Heading", props: { text: "錯誤日誌與處置建議", level: "h1" }, children: [] };
    base.elements.report.props = {
      ...base.elements.report.props,
      title: "日誌分析摘要",
      summary: "checkout-api 出現查詢逾時，且 postgres-primary 的連線池已耗盡。建議先檢查資料庫連線與慢查詢。",
    };
  }
  return base;
}

const sampleSpecs = Object.fromEntries(sampleTabs.map(({ id }) => [id, makeSampleSpec(id)]));

const stackGaps = { none: 0, sm: 8, md: 12, lg: 18, xl: 24 };
const stackAlignments = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
const stackJustifications = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
};

function DashboardStack({ props, children }) {
  const horizontal = props?.direction === "horizontal";
  return (
    <div
      className={`ai-stack ${horizontal ? "ai-stack-horizontal" : "ai-stack-vertical"} ${props?.className || ""}`}
      style={{
        gap: `${stackGaps[props?.gap] ?? stackGaps.md}px`,
        alignItems: stackAlignments[props?.align] ?? "stretch",
        justifyContent: stackJustifications[props?.justify] ?? "flex-start",
      }}
    >
      {children}
    </div>
  );
}

function DashboardGrid({ props, children }) {
  const columns = Math.min(6, Math.max(1, Number(props?.columns) || 1));
  const gap = stackGaps[props?.gap] ?? stackGaps.md;
  return (
    <div className={`ai-grid ${props?.className || ""}`} data-columns={columns} style={{ gap: `${gap}px` }}>
      {children}
    </div>
  );
}

function DashboardCard({ props, children }) {
  const title = typeof props?.title === "string" ? props.title : "";
  const description = typeof props?.description === "string" ? props.description : "";
  return (
    <section
      className={`ai-card ${props?.className || ""}`}
      style={{ maxWidth: props?.maxWidth === "sm" ? 480 : props?.maxWidth === "md" ? 720 : props?.maxWidth === "lg" ? 960 : undefined, marginInline: props?.centered ? "auto" : undefined }}
    >
      {(title || description) && (
        <header className="ai-card-header">
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
        </header>
      )}
      <div className="ai-card-content">{children}</div>
    </section>
  );
}

function DashboardAlert({ props }) {
  const type = ["warning", "error", "success", "info"].includes(props?.type) ? props.type : "info";
  return (
    <aside className={`ai-alert ai-alert-${type}`} role="status">
      <span className="ai-alert-mark" aria-hidden="true">{type === "error" ? "!" : type === "warning" ? "△" : "i"}</span>
      <div>
        {props?.title && <strong>{props.title}</strong>}
        {props?.message && <p>{props.message}</p>}
      </div>
    </aside>
  );
}

function getSpecError(spec) {
  if (!spec || typeof spec !== "object") return "AI 沒有產生可解析的 UI spec。";
  if (typeof spec.root !== "string" || !spec.root.trim()) return "UI spec 缺少有效的 root，無法決定要從哪個元件開始渲染。";
  if (!spec.elements || typeof spec.elements !== "object" || Array.isArray(spec.elements)) {
    return "UI spec 缺少有效的 elements map，沒有可渲染的元件。";
  }
  if (!spec.elements[spec.root]) {
    return `UI spec 的 root「${spec.root}」沒有對應的 elements 元件。請重新生成。`;
  }

  const catalogValidation = catalog.validate(spec);
  if (!catalogValidation.success) {
    const issues = catalogValidation.error.issues || [];
    return issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n") || "UI spec 不符合 catalog schema。";
  }

  let structuralResult;
  try {
    structuralResult = validateSpec(spec);
  } catch (error) {
    return `UI spec 結構無法驗證：${error instanceof Error ? error.message : String(error)}`;
  }
  if (!structuralResult.valid) {
    const issues = structuralResult.issues?.filter((issue) => issue.severity === "error") || [];
    return issues.slice(0, 3).map((issue) => issue.message).join("\n") || "UI spec 結構驗證失敗。";
  }

  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return null;
    visited.add(key);
    const element = spec.elements[key];
    if (!element) return `元件「${key}」不存在，但被其他元件引用。`;
    if (!catalog.componentNames.includes(element.type)) {
      return `元件「${key}」使用了未註冊的類型「${element.type}」。`;
    }
    const propsValidation = catalog.data.components[element.type].props.safeParse(element.props);
    if (!propsValidation.success) {
      return `元件「${key}」的 props 不符合 schema：${propsValidation.error.issues[0]?.message || "格式錯誤"}`;
    }

    for (const childKey of element.children || []) {
      const childError = visit(childKey);
      if (childError) return childError;
    }
    return null;
  };

  const treeError = visit(spec.root);
  if (treeError) return treeError;

  const hasContent = [...visited].some((key) => !["Stack", "Grid"].includes(spec.elements[key]?.type));
  if (!hasContent) return "AI 只產生了空的版面容器，沒有生成可顯示的內容元件。請重新生成。";
  return null;
}

function repairGeneratedSpec(spec) {
  const inputError = getSpecError(spec);
  if (inputError && (!spec?.root || !spec?.elements || typeof spec.elements !== "object")) {
    throw new Error(inputError);
  }

  // Validate the model's original output before applying any repair.
  let originalValidation;
  try {
    originalValidation = validateSpec(spec);
  } catch (error) {
    throw new Error(`AI spec 驗證失敗：${error instanceof Error ? error.message : String(error)}`);
  }

  const structuralRepair = autoFixSpec(spec, { lossy: false });
  const fixes = structuralRepair.fixDetails?.map((fix) => fix.message) || [];
  const repairedSpec = structuralRepair.spec;

  if (repairedSpec?.elements && typeof repairedSpec.elements === "object") {
    for (const [elementKey, element] of Object.entries(repairedSpec.elements)) {
      if (!Array.isArray(element?.children)) continue;
      const validChildren = element.children.filter((childKey) => Boolean(repairedSpec.elements[childKey]));
      const removedCount = element.children.length - validChildren.length;
      if (removedCount > 0) {
        repairedSpec.elements[elementKey] = { ...element, children: validChildren };
        fixes.push(`元件「${elementKey}」移除了 ${removedCount} 個不存在的子元件引用。`);
      }
    }
  }

  // Validate again after repair so the Renderer only receives a checked spec.
  const finalValidation = getSpecError(repairedSpec);
  return { spec: repairedSpec, fixes, originalValidation, finalValidation };
}

const { registry } = defineRegistry(catalog, {
  components: {
    ...shadcnComponents,
    Card: DashboardCard,
    Stack: DashboardStack,
    Grid: DashboardGrid,
    Heading: shadcnComponents.Heading,
    Text: shadcnComponents.Text,
    Badge: shadcnComponents.Badge,
    Alert: DashboardAlert,
    Metric,
    MetricGrid,
    MetricChart,
    ProductionAlertList,
    ProductionLineTable,
    ProductionOutputChart,
    ProductionOverview,
    ProductionStationTable,
    ServiceDependencyGraph,
    TraceWaterfall,
    LogTable,
    IncidentReport,
  },
  actions: {},
});

class RendererErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("json-render runtime error", error, info);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="result-error" role="alert">
        <div className="result-error-icon">!</div>
        <div>
          <strong>元件渲染失敗</strong>
          <p>{this.state.error.message || "Renderer 發生未預期錯誤。"}</p>
          <button type="button" className="retry-button" onClick={this.props.onRetry}>
            重新嘗試
          </button>
        </div>
      </div>
    );
  }
}

function App() {
  const [hasAsked, setHasAsked] = useState(false);
  const [activeSampleTab, setActiveSampleTab] = useState(sampleTabs[0].id);
  const [prompt, setPrompt] = useState("");
  const [specError, setSpecError] = useState(null);
  const [renderSpec, setRenderSpec] = useState(null);
  const [repairNotes, setRepairNotes] = useState([]);
  const [generationKey, setGenerationKey] = useState(0);
  const promptInputRef = useRef(null);
  const handleStreamComplete = (spec) => {
    try {
      if (!spec || typeof spec !== "object") {
        setSpecError("AI 沒有產生可解析的 UI spec。");
        return;
      }
      const repaired = repairGeneratedSpec(spec);
      setRenderSpec(repaired.spec);
      setRepairNotes(repaired.fixes);
      setSpecError(repaired.finalValidation);
    } catch (completeError) {
      console.error("Failed to finalize json-render spec", completeError);
      setRenderSpec(null);
      setRepairNotes([]);
      setSpecError(completeError instanceof Error ? completeError.message : "UI spec 完成處理失敗。");
    }
  };
  const {
    isStreaming,
    error,
    send,
  } = useUIStream({ api: "/api/generate", onComplete: handleStreamComplete });
  const handleSubmit = (event) => {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || isStreaming) return;
    setHasAsked(true);
    setSpecError(null);
    setRenderSpec(null);
    setRepairNotes([]);
    setGenerationKey((key) => key + 1);
    send(nextPrompt);
  };
  const applyQuickPrompt = (quickPrompt) => {
    setPrompt(quickPrompt);
    promptInputRef.current?.focus();
  };
  const handleSampleTabKeyDown = (event) => {
    const currentIndex = sampleTabs.findIndex((tab) => tab.id === activeSampleTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % sampleTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + sampleTabs.length) % sampleTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = sampleTabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = sampleTabs[nextIndex];
    setActiveSampleTab(nextTab.id);
    document.getElementById(`sample-tab-${nextTab.id}`)?.focus();
  };
  const retry = () => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt || isStreaming) return;
    setSpecError(null);
    setRenderSpec(null);
    setRepairNotes([]);
    setGenerationKey((key) => key + 1);
    send(nextPrompt);
  };
  const showResult = hasAsked;
  const activeSpec = renderSpec;
  const canRenderSpec = Boolean(activeSpec?.root && activeSpec?.elements?.[activeSpec.root]);

  return (
    <main className={`shell query-app ${hasAsked ? "has-result" : "welcome"}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">⌘</span>
          <span>
            observability <em>AI incident workspace</em>
          </span>
        </div>
        <span className="status">
          <b /> MCP 模擬資料
        </span>
      </header>
      <section className={`query-stage ${hasAsked ? "compact" : ""}`}>
        {!hasAsked && (
          <div className="welcome-copy">
            <p className="kicker">AI OBSERVABILITY ASSISTANT</p>
            <h1>
              你想了解什麼<span>？</span>
            </h1>
            <p>用自然語言查詢 metrics、logs 與 traces，產生可互動的問題分析。</p>
          </div>
        )}
        <form className="query-form" onSubmit={handleSubmit}>
          <div className="query-input-wrap">
            <textarea
              ref={promptInputRef}
              value={prompt}
              rows={hasAsked ? 1 : 3}
              maxLength={4000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：分析 checkout-api 最近 30 分鐘的延遲與錯誤…"
              aria-label="輸入觀測性問題"
            />
            <button type="submit" className="query-submit" disabled={isStreaming || !prompt.trim()}>
              {isStreaming ? "分析中…" : "送出"}
              <span>↗</span>
            </button>
          </div>
          {!hasAsked && (
            <>
              <div className="quick-heading">快速開始</div>
              <div className="quick-prompts">
                {quickPrompts.map((quickPrompt) => (
                  <button type="button" key={quickPrompt} onClick={() => applyQuickPrompt(quickPrompt)}>
                    {quickPrompt}
                  </button>
                ))}
              </div>
            </>
          )}
        </form>
      </section>
      {!hasAsked && (
        <section className="sample-preview" aria-label="建議問題的範例結果">
          <div className="sample-preview-heading">
            <div>
              <div className="section-label">範例結果</div>
              <h2>看看不同問題會產生什麼介面</h2>
            </div>
            <span className="sample-preview-note">使用模擬觀測性資料</span>
          </div>
          <div className="sample-tabs" role="tablist" aria-label="範例問題">
            {sampleTabs.map((tab) => (
              <button
                id={`sample-tab-${tab.id}`}
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeSampleTab === tab.id}
                aria-controls={`sample-panel-${tab.id}`}
                tabIndex={activeSampleTab === tab.id ? 0 : -1}
                className={activeSampleTab === tab.id ? "active" : ""}
                onClick={() => setActiveSampleTab(tab.id)}
                onKeyDown={handleSampleTabKeyDown}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {sampleTabs.filter((tab) => tab.id === activeSampleTab).map((tab) => (
            <div
              id={`sample-panel-${tab.id}`}
              key={tab.id}
              role="tabpanel"
              aria-labelledby={`sample-tab-${tab.id}`}
              className="sample-panel"
            >
              <div className="sample-question-row">
                <p>{tab.question}</p>
                <button type="button" onClick={() => applyQuickPrompt(tab.question)}>
                  套用問題 <span aria-hidden="true">↗</span>
                </button>
              </div>
              <div className="render-surface result-surface sample-render-surface">
                <StateProvider key={`sample-${tab.id}`} initialState={sampleSpecs[tab.id].state || {}}>
                  <VisibilityProvider>
                    <ActionProvider handlers={{}}>
                      <Renderer spec={sampleSpecs[tab.id]} registry={registry} loading={false} />
                    </ActionProvider>
                  </VisibilityProvider>
                </StateProvider>
              </div>
            </div>
          ))}
        </section>
      )}
      {showResult && (
        <section className="result-section">
          <div className="result-head">
            <div>
              <div className="section-label">分析結果</div>
              <h2>Observability incident view</h2>
            </div>
            <span className="pill">{isStreaming ? "AI 串流中" : "AI 生成介面"}</span>
          </div>
          <div className="render-surface result-surface">
            {specError || error ? (
              <div className="result-error" role="alert">
                <div className="result-error-icon">!</div>
                <div>
                  <strong>{specError ? "AI 回傳的 UI 無法渲染" : "AI 生成失敗"}</strong>
                  <p>{specError || error.message}</p>
                  <button type="button" className="retry-button" onClick={retry} disabled={isStreaming}>
                    重新嘗試
                  </button>
                </div>
              </div>
            ) : canRenderSpec ? (
              <RendererErrorBoundary resetKey={generationKey} onRetry={retry}>
                <StateProvider key={generationKey} initialState={activeSpec.state || {}}>
                  <VisibilityProvider>
                    <ActionProvider handlers={{}}>
                      <Renderer spec={activeSpec} registry={registry} loading={false} />
                    </ActionProvider>
                  </VisibilityProvider>
                </StateProvider>
              </RendererErrorBoundary>
            ) : (
              <div className="result-loading">
                <span className="loading-dot" />
                正在查詢資料並整理介面…
              </div>
            )}
          </div>
          {repairNotes.length > 0 && (
            <div className="repair-notice">
              <strong>部分 UI 結構已修復，可能有元件未顯示。</strong>
              <ul>
                {repairNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
              </ul>
              <button type="button" className="retry-button" onClick={retry} disabled={isStreaming}>
                重新生成完整介面
              </button>
            </div>
          )}
        </section>
      )}
      {!hasAsked && (
        <footer className="query-footer">
          <span>POST /api/generate → AI 規劃 → json-render Renderer</span>
          <code>受控 catalog · Recharts · shadcn UI</code>
        </footer>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
