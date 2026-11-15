import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog';
import { z } from 'zod';

// shadcn definitions are shared by the browser registry and the server prompt.
// Observability widgets keep the AI-facing contract small by reading data from state paths.
export const catalog = defineCatalog(schema, {
  components: {
    ...shadcnComponentDefinitions,
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        trend: z.string(),
      }),
      description: 'Compact KPI metric card for dashboard summaries',
    },
    MetricGrid: {
      props: z.object({ dataPath: z.string() }),
      description: 'Responsive group of KPI cards. dataPath points to an array of {label,value,trend?} objects or an object of metric keys to values. Prefer one MetricGrid instead of creating several Metric children.',
      example: { dataPath: '/metrics' },
    },
    ProductionOverview: {
      props: z.object({ dataPath: z.string() }),
      description: 'Production line KPI cards for output, target completion, yield, downtime, and OEE. dataPath points to the production object, usually /production.',
      example: { dataPath: '/production' },
    },
    ProductionLineTable: {
      props: z.object({ title: z.string(), dataPath: z.string() }),
      description: 'All production lines with current running/stopped status, yield, target achievement, and downtime. dataPath is /productionLines.',
      example: { title: '全部產線狀態', dataPath: '/productionLines' },
    },
    ProductionOutputChart: {
      props: z.object({ title: z.string(), dataPath: z.string() }),
      description: 'Grouped bar chart comparing planned and actual units by hour. dataPath points to an array of {hour,planned,actual}, usually /production/hourlyOutput.',
      example: { title: '每小時產量', dataPath: '/production/hourlyOutput' },
    },
    ProductionStationTable: {
      props: z.object({ title: z.string(), dataPath: z.string() }),
      description: 'Production station status table. dataPath points to an array of {name,status,utilizationPercent,currentJob}, usually /production/stations.',
      example: { title: '工站狀態', dataPath: '/production/stations' },
    },
    ProductionAlertList: {
      props: z.object({ title: z.string(), dataPath: z.string() }),
      description: 'Production equipment and quality alert list. dataPath points to an array of {severity,station,message}, usually /production/alerts.',
      example: { title: '產線告警', dataPath: '/production/alerts' },
    },
    ServiceDependencyGraph: {
      props: z.object({ dataPath: z.string() }),
      description: 'Service dependency view showing upstream services, the selected service, downstream services, and connected databases. dataPath points to the object returned by query_service_relationships, usually /serviceRelationships.',
      example: { dataPath: '/serviceRelationships' },
    },
    MetricChart: {
      props: z.object({
        title: z.string(),
        unit: z.string(),
        dataPath: z.string(),
      }),
      description: 'Single-series time line chart. dataPath must point to an array of { timestamp: string, value: number } points ordered oldest to newest. This component draws exactly one line; create another MetricChart for another metric. Keep chart data in state, not props.',
      example: { title: 'Latency 趨勢', unit: 'ms', dataPath: '/latencySeries' },
    },
    TraceWaterfall: {
      props: z.object({
        title: z.string(),
        dataPath: z.string(),
      }),
      description: 'Distributed trace waterfall. Read the spans array from state using dataPath, for example /traces. Do not put spans directly in props.',
      example: { title: '慢速 Trace', dataPath: '/traces' },
    },
    LogTable: {
      props: z.object({
        title: z.string(),
        dataPath: z.string(),
      }),
      description: 'Correlated structured log table. Read log rows from state using dataPath, for example /logs. Do not put log rows directly in props.',
      example: { title: '關聯錯誤日誌', dataPath: '/logs' },
    },
    IncidentReport: {
      props: z.object({
        title: z.string(),
        confidence: z.string(),
        summary: z.string(),
        findings: z.array(z.object({ title: z.string(), detail: z.string() })),
      }),
      description: 'Evidence-based incident summary with findings and recommended next checks',
    },
  },
  actions: {},
});
