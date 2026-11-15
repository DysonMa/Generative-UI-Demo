import React from "react";
import { useStateValue } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartColors = ["#ff7a90", "#9b8cff", "#ffb454", "#62d5c4", "#7ab7ff", "#d58cff"];

function text(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function useWidgetArray(dataPath, fallback, missingPath) {
  const normalizedPath = typeof dataPath === "string"
    ? dataPath.replace(/^\/state(?=\/)/, "")
    : "";
  const validPath = normalizedPath.startsWith("/") ? normalizedPath : missingPath;
  const stateValue = useStateValue(validPath);
  if (normalizedPath.startsWith("/") && Array.isArray(stateValue)) return stateValue;
  if (Array.isArray(dataPath)) return dataPath;
  return Array.isArray(fallback) ? fallback : [];
}

export function Metric({ props }) {
  const label = text(props?.label, "指標");
  const value = text(props?.value, "—");
  const trend = text(props?.trend);
  return (
    <div className="metric-observe">
      <span>{label}</span>
      <strong>{value}</strong>
      {trend && (
        <small className={trend.startsWith("+") ? "bad-trend" : "good-trend"}>
          {trend} <i>與前一時間窗相比</i>
        </small>
      )}
    </div>
  );
}

const metricLabels = {
  avgLatency: "平均延遲",
  p50Latency: "p50 延遲",
  p95Latency: "p95 延遲",
  errorRate: "錯誤率",
  successRate: "成功率",
  requestRate: "請求速率",
};

function formatMetricLabel(key) {
  if (metricLabels[key]) return metricLabels[key];
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

export function MetricGrid({ props }) {
  const dataPath = typeof props?.dataPath === "string" ? props.dataPath : "/__missing_metrics";
  const stateMetrics = useStateValue(dataPath);
  const metrics = Array.isArray(stateMetrics)
    ? stateMetrics
    : stateMetrics && typeof stateMetrics === "object"
      ? Object.entries(stateMetrics).map(([key, value]) => ({
          label: formatMetricLabel(key),
          ...(value && typeof value === "object" ? value : { value }),
        }))
      : [];

  if (metrics.length === 0) {
    return <div className="widget-empty">目前沒有可顯示的指標</div>;
  }

  return (
    <div className="metric-grid-observe">
      {metrics.slice(0, 6).map((metric, index) => (
        <Metric
          key={`${text(metric?.label, "metric")}-${index}`}
          props={{
            label: text(metric?.label, `指標 ${index + 1}`),
            value: text(metric?.value, "—"),
            trend: text(metric?.trend),
          }}
        />
      ))}
    </div>
  );
}

export function MetricChart({ props }) {
  const points = useWidgetArray(props?.dataPath, null, "/__missing_metric_points")
    .slice(-500)
    .map((point) => ({ timestamp: text(point?.timestamp), value: Number(point?.value) }))
    .filter((point) => point.timestamp && Number.isFinite(point.value));
  const title = text(props?.title, "指標趨勢");

  return (
    <div className="observe-chart">
      <div className="observe-widget-head">
        <div>
          <strong>{title}</strong>
          <span>{text(props?.unit)}</span>
        </div>
      </div>
      {points.length === 0 ? (
        <div className="widget-empty">目前沒有可顯示的時間序列資料</div>
      ) : (
      <div className="metric-chart" role="img" aria-label={text(props?.title, "指標趨勢")}>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#2a4058" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="timestamp"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#7188a0", fontSize: 10, fontFamily: "DM Mono" }}
              minTickGap={24}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={42}
              domain={[0, "auto"]}
              tick={{ fill: "#7188a0", fontSize: 10, fontFamily: "DM Mono" }}
              tickFormatter={(value) => formatMetricValue(value, props?.unit, true)}
            />
            <Tooltip
              cursor={{ stroke: "#637b95", strokeDasharray: "3 4" }}
              content={<MetricTooltip unit={props?.unit} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={title}
              stroke={chartColors[0]}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: "#13243a" }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}

function MetricTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="metric-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={item.dataKey} className="metric-tooltip-row">
          <span>
            <b style={{ background: item.color }} />
            {item.name}
          </span>
          <strong>{formatMetricValue(item.value, unit)}</strong>
        </div>
      ))}
    </div>
  );
}

function formatMetricValue(value, unit = "", axisOnly = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";

  const number = Number(value);
  const normalizedUnit = typeof unit === "string" ? unit : "";
  const isPercentage = normalizedUnit.includes("百分比") || normalizedUnit.includes("%");
  const formatted = new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: isPercentage ? 1 : 0,
  }).format(number);

  if (axisOnly) return isPercentage ? `${formatted}%` : formatted;
  if (isPercentage) return `${formatted}%`;
  if (normalizedUnit.includes("毫秒") || normalizedUnit.toLowerCase().includes("ms")) return `${formatted} ms`;
  return `${formatted}${normalizedUnit ? ` ${normalizedUnit}` : ""}`;
}

export function TraceWaterfall({ props }) {
  const sourceSpans = useWidgetArray(props?.dataPath, props?.spans, "/__missing_trace_spans");
  const flattenedSpans = sourceSpans.flatMap((trace) => {
    if (!Array.isArray(trace?.spans)) return [trace];
    let cursorMs = 0;
    return trace.spans.map((span) => {
      const durationMs = Number(span?.durationMs);
      const providedStart = Number(span?.startMs);
      const startMs = Number.isFinite(providedStart) ? providedStart : cursorMs;
      if (Number.isFinite(durationMs) && durationMs >= 0) cursorMs = Math.max(cursorMs, startMs + durationMs);
      return {
        ...span,
        name: text(span?.name, text(trace?.name, text(trace?.traceId, "Trace span"))),
        service: text(span?.service, text(trace?.service, "unknown-service")),
        status: text(span?.status, text(trace?.status, "ok")),
        startMs,
      };
    });
  });
  const spans = flattenedSpans
    .slice(0, 100)
    .map((span) => ({
      name: text(span?.name, text(span?.traceId, "未命名 span")),
      service: text(span?.service, "unknown-service"),
      startMs: Number(span?.startMs),
      durationMs: Number(span?.durationMs),
      status: text(span?.status, "ok").toLowerCase(),
    }))
    .filter((span) => Number.isFinite(span.startMs) && span.startMs >= 0 && Number.isFinite(span.durationMs) && span.durationMs >= 0);
  const total = Math.max(...spans.map((span) => span.startMs + span.durationMs), 1);
  return (
    <div className="trace-widget">
      <div className="observe-widget-head"><div><strong>{text(props?.title, "Trace 瀑布圖")}</strong><span>總計 {total}ms</span></div><span className="trace-hint">Tempo trace 範例</span></div>
      {spans.length === 0 ? (
        <div className="widget-empty">目前沒有可顯示的 trace span</div>
      ) : (
        <>
          <div className="trace-axis"><span>0ms</span><span>{Math.round(total / 2)}ms</span><span>{total}ms</span></div>
          {spans.map((span, index) => <div className="trace-row" key={`${span.service}-${span.name}-${index}`}><div className="trace-label"><strong>{span.name}</strong><small>{span.service}</small></div><div className="trace-track"><span className={`trace-bar ${span.status === "error" ? "trace-error" : ""}`} style={{ left: `${Math.min((span.startMs / total) * 100, 100)}%`, width: `${Math.min(Math.max((span.durationMs / total) * 100, 1.5), 100)}%` }} /><small>{span.durationMs}ms</small></div></div>)}
        </>
      )}
    </div>
  );
}

export function LogTable({ props }) {
  const sourceRows = useWidgetArray(props?.dataPath, props?.rows, "/__missing_log_rows");
  const rows = sourceRows.slice(0, 100).map((row) => ({
    timestamp: text(row?.timestamp, "—"),
    level: text(row?.level, "INFO").toUpperCase(),
    service: text(row?.service, "unknown-service"),
    message: text(row?.message, "無訊息"),
    traceId: text(row?.traceId, "—"),
  }));
  const tableRows = rows.map((row) => [
    row.timestamp,
    row.level,
    row.service,
    row.message,
    row.traceId,
  ]);
  return (
    <div className="log-widget">
      <div className="observe-widget-head">
        <div>
          <strong>{text(props?.title, "關聯日誌")}</strong>
          <span>{rows.length} 筆事件</span>
        </div>
        <span className="trace-hint">Loki 範例</span>
      </div>
      {rows.length === 0 ? (
        <div className="widget-empty">目前沒有可顯示的日誌</div>
      ) : (
        <div className="log-table-scroll">
          <shadcnComponents.Table
            props={{
              columns: ["時間", "嚴重程度", "服務", "訊息", "Trace ID"],
              rows: tableRows,
            }}
          />
        </div>
      )}
    </div>
  );
}

function productionStatusLabel(status) {
  return ({ running: "運轉中", warning: "注意", stopped: "已停止", offline: "離線" })[status] || text(status, "未知");
}

export function ProductionLineTable({ props }) {
  const data = useStateValue(typeof props?.dataPath === "string" ? props.dataPath : "/productionLines");
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const rows = lines.map((line) => [
    text(line?.line, "未命名產線"),
    productionStatusLabel(line?.status),
    Number.isFinite(Number(line?.yieldPercent)) ? `${line.yieldPercent}%` : "—",
    Number.isFinite(Number(line?.achievementPercent)) ? `${line.achievementPercent}%` : "—",
    Number.isFinite(Number(line?.downtimeMinutes)) ? `${line.downtimeMinutes} 分鐘` : "—",
  ]);
  return (
    <section className="production-table-widget">
      <div className="observe-widget-head"><div><strong>{text(props?.title, "全部產線狀態")}</strong><span>{lines.length} 條產線</span></div></div>
      {rows.length === 0 ? <div className="widget-empty">目前沒有產線資料</div> : (
        <div className="production-table-scroll">
          <shadcnComponents.Table props={{ columns: ["產線", "狀態", "良率", "目標達成率", "停機時間"], rows }} />
        </div>
      )}
    </section>
  );
}

export function ProductionOverview({ props }) {
  const path = typeof props?.dataPath === "string" ? props.dataPath : "/production";
  const production = useStateValue(path);
  const summary = production?.summary;
  if (!summary) return <div className="widget-empty">目前沒有可顯示的產線資料</div>;

  const items = [
    { label: "實際產量", value: summary.producedUnits, unit: "件", note: `目標 ${text(summary.targetUnits, "—")} 件` },
    { label: "目標達成率", value: summary.achievementPercent, unit: "%", note: "本時段進度" },
    { label: "良率", value: summary.yieldPercent, unit: "%", note: `不良 ${text(summary.defectUnits, "—")} 件` },
    { label: "設備綜合效率 OEE", value: summary.oeePercent, unit: "%", note: `停機 ${text(summary.downtimeMinutes, "—")} 分鐘` },
  ];

  return (
    <section className="production-overview" aria-label={`${text(production.line, "產線")}生產摘要`}>
      <div className="observe-widget-head">
        <div><strong>{text(production.line, "產線")} 生產摘要</strong><span>{production.timeRange === "shift" ? "本班次" : text(production.timeRange)}</span></div>
        <span className="trace-hint">模擬生產資料</span>
      </div>
      <div className="production-kpis">
        {items.map((item) => (
          <article className="production-kpi" key={item.label}>
            <span>{item.label}</span>
            <strong>{text(item.value, "—")}<small>{item.unit}</small></strong>
            <em>{item.note}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ProductionOutputChart({ props }) {
  const points = useWidgetArray(props?.dataPath, null, "/__missing_production_output")
    .slice(0, 48)
    .map((point) => ({ hour: text(point?.hour), planned: Number(point?.planned), actual: Number(point?.actual) }))
    .filter((point) => point.hour && Number.isFinite(point.planned) && Number.isFinite(point.actual));

  return (
    <section className="production-chart">
      <div className="observe-widget-head"><div><strong>{text(props?.title, "每小時產量")}</strong><span>計畫與實際產量</span></div></div>
      {points.length === 0 ? <div className="widget-empty">目前沒有可顯示的產量趨勢</div> : (
        <div className="production-chart-canvas" role="img" aria-label={text(props?.title, "每小時產量趨勢")}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#2a4058" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: "#8296ac", fontSize: 10, fontFamily: "DM Mono" }} />
              <YAxis axisLine={false} tickLine={false} width={42} tick={{ fill: "#8296ac", fontSize: 10, fontFamily: "DM Mono" }} />
              <Tooltip cursor={{ fill: "#ffffff0a" }} contentStyle={{ background: "#0d1b2d", border: "1px solid #3c5874", borderRadius: 8, color: "#eaf0f6", fontSize: 11 }} />
              <Legend wrapperStyle={{ color: "#9fb1c6", fontSize: 11 }} />
              <Bar dataKey="planned" name="計畫產量" fill="#58718c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="actual" name="實際產量" fill="#bcff48" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function ProductionStationTable({ props }) {
  const stations = useWidgetArray(props?.dataPath, null, "/__missing_production_stations").slice(0, 50);
  const rows = stations.map((station) => [
    text(station?.name, "未命名工站"),
    productionStatusLabel(station?.status),
    Number.isFinite(Number(station?.utilizationPercent)) ? `${station.utilizationPercent}%` : "—",
    text(station?.currentJob, "—"),
  ]);

  return (
    <section className="production-table-widget">
      <div className="observe-widget-head"><div><strong>{text(props?.title, "工站狀態")}</strong><span>{stations.length} 個工站</span></div></div>
      {rows.length === 0 ? <div className="widget-empty">目前沒有工站資料</div> : (
        <div className="production-table-scroll">
          <shadcnComponents.Table props={{ columns: ["工站", "狀態", "稼動率", "目前工單"], rows }} />
        </div>
      )}
    </section>
  );
}

export function ProductionAlertList({ props }) {
  const alerts = useWidgetArray(props?.dataPath, null, "/__missing_production_alerts").slice(0, 20);
  return (
    <section className="production-alert-widget">
      <div className="observe-widget-head"><div><strong>{text(props?.title, "產線告警")}</strong><span>{alerts.length} 筆事件</span></div></div>
      {alerts.length === 0 ? <div className="widget-empty">目前沒有產線告警</div> : (
        <ul className="production-alert-list">
          {alerts.map((alert, index) => {
            const severity = ["error", "warning", "info"].includes(alert?.severity) ? alert.severity : "info";
            return <li className={`production-alert production-alert-${severity}`} key={`${alert?.station}-${index}`}>
              <span className="production-alert-severity">{severity === "error" ? "嚴重" : severity === "warning" ? "注意" : "資訊"}</span>
              <div><strong>{text(alert?.station, "產線")}</strong><p>{text(alert?.message, "無告警內容")}</p></div>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}

function ServiceNodes({ items, kind }) {
  if (items.length === 0) return <div className="service-node-empty">沒有已知依賴</div>;
  return items.map((item) => (
    <article className="service-node" key={`${kind}-${item.name}`}>
      <span className="service-node-type">{kind === "database" ? text(item.type, "資料庫") : text(item.relation, "服務")}</span>
      <strong>{text(item.name, "未命名")}</strong>
      <small>{text(item.purpose, "")}</small>
    </article>
  ));
}

export function ServiceDependencyGraph({ props }) {
  const path = typeof props?.dataPath === "string" ? props.dataPath : "/serviceRelationships";
  const relation = useStateValue(path);
  if (!relation?.service) return <div className="widget-empty">目前沒有可顯示的服務關聯資料</div>;
  const upstream = Array.isArray(relation.upstream) ? relation.upstream : [];
  const downstream = Array.isArray(relation.downstream) ? relation.downstream : [];
  const databases = Array.isArray(relation.databases) ? relation.databases : [];

  return (
    <section className="service-dependency-widget" aria-label={`${relation.service} 服務關聯`}>
      <div className="observe-widget-head"><div><strong>服務關聯</strong><span>上游、下游與資料儲存</span></div><span className="trace-hint">模擬服務目錄</span></div>
      <div className="service-dependency-graph">
        <div className="service-dependency-column">
          <h4>上游服務 <span>{upstream.length}</span></h4>
          <ServiceNodes items={upstream} kind="upstream" />
        </div>
        <div className="service-dependency-center">
          <div className="service-node-primary"><small>目前服務</small><strong>{relation.service}</strong></div>
          <div className="service-database-list">
            <span>連接的資料庫</span>
            <ServiceNodes items={databases} kind="database" />
          </div>
        </div>
        <div className="service-dependency-column">
          <h4>下游服務 <span>{downstream.length}</span></h4>
          <ServiceNodes items={downstream} kind="downstream" />
        </div>
      </div>
    </section>
  );
}

export function IncidentReport({ props }) {
  const findings = (Array.isArray(props?.findings) ? props.findings : [])
    .slice(0, 12)
    .map((finding, index) => ({
      title: text(finding?.title, `發現 ${index + 1}`),
      detail: text(finding?.detail, "無詳細資訊"),
    }));
  return (
    <div className="report-widget"><div className="observe-widget-head"><div><strong>{text(props?.title, "事件分析報告")}</strong><span>AI 輔助摘要</span></div><span className="confidence">信心度：{text(props?.confidence, "未知")}</span></div><p className="report-summary">{text(props?.summary, "目前沒有可用的摘要。")}</p>{findings.length === 0 ? <div className="widget-empty">目前沒有可顯示的分析發現</div> : <div className="finding-list">{findings.map((finding, index) => <div className="finding" key={`${finding.title}-${index}`}><span className="finding-mark">→</span><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></div>)}</div>}</div>
  );
}

export const observabilitySpec = {
  root: "incident",
  state: {
    latencySeries: [
      { name: "p95", color: "#ff7a90", data: [{ timestamp: "10:00", value: 420 }, { timestamp: "10:05", value: 460 }, { timestamp: "10:10", value: 510 }, { timestamp: "10:15", value: 640 }, { timestamp: "10:20", value: 780 }, { timestamp: "10:25", value: 870 }] },
      { name: "p50", color: "#9b8cff", data: [{ timestamp: "10:00", value: 110 }, { timestamp: "10:05", value: 120 }, { timestamp: "10:10", value: 130 }, { timestamp: "10:15", value: 150 }, { timestamp: "10:20", value: 190 }, { timestamp: "10:25", value: 210 }] },
    ],
    errorSeries: [
      { name: "checkout-api", color: "#ffb454", data: [{ timestamp: "10:00", value: 0.4 }, { timestamp: "10:05", value: 0.6 }, { timestamp: "10:10", value: 0.7 }, { timestamp: "10:15", value: 1.4 }, { timestamp: "10:20", value: 2.8 }, { timestamp: "10:25", value: 3.8 }] },
    ],
    traces: [
      { name: "HTTP GET /checkout/summary", service: "checkout-api", startMs: 0, durationMs: 870, status: "ok" },
      { name: "loadCart", service: "checkout-api", startMs: 22, durationMs: 110, status: "ok" },
      { name: "SELECT cart_items", service: "postgres-primary", startMs: 145, durationMs: 520, status: "error" },
      { name: "GET /pricing", service: "pricing-service", startMs: 690, durationMs: 145, status: "ok" },
    ],
    logs: [
      { timestamp: "10:25:41", level: "ERROR", service: "checkout-api", message: "查詢逾時，超過 500ms", traceId: "trace=7f2a91" },
      { timestamp: "10:25:39", level: "WARN", service: "postgres-primary", message: "connection pool 已耗盡", traceId: "trace=7f2a88" },
      { timestamp: "10:25:31", level: "ERROR", service: "checkout-api", message: "載入購物車項目失敗", traceId: "trace=7f2a72" },
    ],
  },
  elements: {
    incident: { type: "Stack", props: { direction: "vertical", gap: "lg" }, children: ["title", "alert", "summary", "charts", "trace-card", "logs-card", "report-card"] },
    title: { type: "Heading", props: { text: "Checkout 延遲事件", level: "h1" }, children: [] },
    alert: { type: "Alert", props: { title: "偵測到效能劣化", message: "checkout-api 最近 30 分鐘的 p95 latency 已超過 800ms 閾值。", type: "warning" }, children: [] },
    summary: { type: "Grid", props: { columns: 3, gap: "md" }, children: ["latency", "errors", "requests"] },
    latency: { type: "Metric", props: { label: "p95 延遲", value: "870 ms", trend: "+107%" }, children: [] },
    errors: { type: "Metric", props: { label: "5xx 錯誤率", value: "3.8%", trend: "+2.9%" }, children: [] },
    requests: { type: "Metric", props: { label: "請求速率", value: "1.2k rpm", trend: "-4%" }, children: [] },
    charts: { type: "Grid", props: { columns: 2, gap: "md" }, children: ["latency-chart", "error-chart"] },
    "latency-chart": { type: "MetricChart", props: { title: "Checkout 延遲", unit: "毫秒 · p95", dataPath: "/latencySeries" }, children: [] },
    "error-chart": { type: "MetricChart", props: { title: "HTTP 5xx 錯誤率", unit: "百分比", dataPath: "/errorSeries" }, children: [] },
    "trace-card": { type: "Card", props: { title: "慢速 trace 檢視", description: "Trace 7f2a… 顯示資料庫等待時間主導整條 request path。", maxWidth: "full", centered: false }, children: ["trace"] },
    trace: { type: "TraceWaterfall", props: { title: "GET /checkout/summary", dataPath: "/traces" }, children: [] },
    "logs-card": { type: "Card", props: { title: "關聯錯誤日誌", description: "checkout-api 與 postgres-primary 的最新錯誤。", maxWidth: "full", centered: false }, children: ["logs"] },
    logs: { type: "LogTable", props: { title: "Loki 錯誤範例", dataPath: "/logs" }, children: [] },
    "report-card": { type: "Card", props: { title: "事件報告", description: "根據 Prometheus、Loki 與 Tempo 證據產生。", maxWidth: "full", centered: false }, children: ["report"] },
    report: { type: "IncidentReport", props: { title: "可能的資料庫壅塞", confidence: "中等", summary: "Checkout p95 latency 從 420ms 上升到 870ms，同時 postgres-primary 的 connection pool 已耗盡。Trace 範例支持資料庫等待時間是主要延遲來源。", findings: [{ title: "資料庫 span 佔比最高", detail: "SELECT cart_items 在 870ms 的 trace 中耗費 520ms。", }, { title: "錯誤率與事件同步上升", detail: "connection pool 耗盡日誌出現的同時，HTTP 5xx 上升至 3.8%。" }, { title: "建議下一步檢查", detail: "先檢查 postgres-primary 的 active connections、slow queries 與 pool limits，再考慮擴展 checkout-api。" }] }, children: [] },
  },
};
