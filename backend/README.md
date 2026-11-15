# Backend

The backend is an ASP.NET Core 10 Web API implemented with MVC controllers (`ControllerBase`). It owns request validation, model calls, intent routing, mock data functions, UI plan compilation, spec validation, and JSONL patch streaming.

## Run locally

From the `backend/` directory, load the Groq settings from the repository-root `.env` and start the API:

```sh
set -a
source ../.env
set +a
dotnet run
```

Alternatively, export `GROQ_API_KEY` and run `dotnet run` from `backend/`. ASP.NET Core does not load `.env` files by itself.

The API listens on `http://127.0.0.1:3002` by default. Set `PORT` or `ASPNETCORE_URLS` to override it. The frontend Vite proxy points to this address by default; see [frontend/README.md](../frontend/README.md).

## Controllers and endpoints

| Controller | Method | Route | Response |
| --- | --- | --- | --- |
| `HealthController` | `GET` | `/api/health` | JSON backend/model status |
| `MockObservabilityController` | `GET` | `/api/mock-observability` | JSON monitoring sample |
| `GenerateController` | `POST` | `/api/generate` | `text/plain` JSONL RFC 6902 patches |

### `GET /api/health`

Example response (`application/json`):

```json
{
  "ok": true,
  "model": "openai/gpt-oss-20b",
  "backend": ".NET 10 Web API"
}
```

The `model` value comes from `GROQ_MODEL`, or defaults to `openai/gpt-oss-20b`.

### `GET /api/mock-observability`

This endpoint generates a new sample on each request. Values, trace IDs, and timestamps vary; the response structure and example below are representative.

```json
{
  "service": "checkout-api",
  "generatedAt": "2026-11-15T10:30:00.0000000+00:00",
  "timeRange": "最近 30 分鐘",
  "metrics": [
    { "label": "平均延遲", "value": "650 ms", "trend": "+242%" },
    { "label": "錯誤率", "value": "2.8%", "trend": "+1456%" },
    { "label": "成功率", "value": "97.2%", "trend": "下降" }
  ],
  "latencySeries": [
    { "timestamp": "2026-11-15T10:00:00.0000000+00:00", "value": 190 },
    { "timestamp": "2026-11-15T10:05:00.0000000+00:00", "value": 180 },
    { "timestamp": "2026-11-15T10:10:00.0000000+00:00", "value": 210 },
    { "timestamp": "2026-11-15T10:15:00.0000000+00:00", "value": 315 },
    { "timestamp": "2026-11-15T10:20:00.0000000+00:00", "value": 430 },
    { "timestamp": "2026-11-15T10:25:00.0000000+00:00", "value": 540 },
    { "timestamp": "2026-11-15T10:30:00.0000000+00:00", "value": 650 }
  ],
  "errorSeries": [
    { "timestamp": "2026-11-15T10:00:00.0000000+00:00", "value": 0.18 },
    { "timestamp": "2026-11-15T10:05:00.0000000+00:00", "value": 0.3 },
    { "timestamp": "2026-11-15T10:10:00.0000000+00:00", "value": 0.42 },
    { "timestamp": "2026-11-15T10:15:00.0000000+00:00", "value": 0.95 },
    { "timestamp": "2026-11-15T10:20:00.0000000+00:00", "value": 1.5 },
    { "timestamp": "2026-11-15T10:25:00.0000000+00:00", "value": 2.3 },
    { "timestamp": "2026-11-15T10:30:00.0000000+00:00", "value": 2.8 }
  ],
  "traces": [
    {
      "traceId": "trc-demo-01",
      "service": "checkout-api",
      "durationMs": 540,
      "spans": [
        { "name": "GET /checkout", "service": "checkout-api", "startMs": 0, "durationMs": 540, "status": "ok" },
        { "name": "loadCart", "service": "checkout-api", "startMs": 12, "durationMs": 100, "status": "ok" },
        { "name": "SELECT cart_items", "service": "postgres-primary", "startMs": 28, "durationMs": 320, "status": "ok" },
        { "name": "POST /authorize", "service": "payment-service", "startMs": 438, "durationMs": 80, "status": "ok" }
      ]
    },
    {
      "traceId": "trc-demo-02",
      "service": "checkout-api",
      "durationMs": 690,
      "spans": [
        { "name": "GET /checkout", "service": "checkout-api", "startMs": 0, "durationMs": 690, "status": "ok" },
        { "name": "loadCart", "service": "checkout-api", "startMs": 12, "durationMs": 120, "status": "ok" },
        { "name": "SELECT cart_items", "service": "postgres-primary", "startMs": 28, "durationMs": 420, "status": "error" },
        { "name": "POST /authorize", "service": "payment-service", "startMs": 558, "durationMs": 110, "status": "ok" }
      ]
    },
    {
      "traceId": "trc-demo-03",
      "service": "checkout-api",
      "durationMs": 530,
      "spans": [
        { "name": "GET /checkout", "service": "checkout-api", "startMs": 0, "durationMs": 530, "status": "ok" },
        { "name": "loadCart", "service": "checkout-api", "startMs": 12, "durationMs": 80, "status": "ok" },
        { "name": "SELECT cart_items", "service": "postgres-primary", "startMs": 28, "durationMs": 280, "status": "ok" },
        { "name": "POST /authorize", "service": "payment-service", "startMs": 378, "durationMs": 130, "status": "ok" }
      ]
    }
  ],
  "logs": [
    { "timestamp": "2026-11-15T10:28:00.0000000+00:00", "level": "ERROR", "service": "checkout-api", "message": "checkout request latency 650ms exceeded the 300ms SLO", "traceId": "trc-demo-01" },
    { "timestamp": "2026-11-15T10:26:00.0000000+00:00", "level": "WARN", "service": "postgres-primary", "message": "connection pool utilization reached 92%", "traceId": "trc-demo-02" },
    { "timestamp": "2026-11-15T10:23:00.0000000+00:00", "level": "ERROR", "service": "payment-service", "message": "upstream request completed after retry", "traceId": "trc-demo-03" }
  ]
}
```

### `POST /api/generate`

Request:

```http
POST /api/generate HTTP/1.1
Content-Type: application/json

{"prompt":"現在有哪些生產線？各自良率如何？"}
```

The response is newline-delimited JSON, not one JSON document. Each line is an RFC 6902 patch. This representative response shows the shape for the production-lines question; the AI-generated titles and optional subtitle may differ.

```text
{"op":"add","path":"/root","value":"root"}
{"op":"add","path":"/state","value":{"productionLines":{"timeRange":"shift","generatedAt":"2026-11-15T10:30:00.0000000+00:00","lines":[{"line":"Line-A","status":"running","yieldPercent":97.88,"achievementPercent":90.5,"producedUnits":1086,"targetUnits":1200,"downtimeMinutes":34},{"line":"Line-B","status":"running","yieldPercent":98.87,"achievementPercent":97.2,"producedUnits":972,"targetUnits":1000,"downtimeMinutes":18},{"line":"Line-C","status":"stopped","yieldPercent":96.91,"achievementPercent":85.6,"producedUnits":1198,"targetUnits":1400,"downtimeMinutes":51}]}}
{"op":"add","path":"/elements/root","value":{"type":"Stack","props":{"direction":"vertical","gap":"lg","align":"stretch","justify":"start","className":null},"children":["heading","block-1"]}}
{"op":"add","path":"/elements/heading","value":{"type":"Heading","props":{"text":"產線生產狀況","level":"h1"},"children":[]}}
{"op":"add","path":"/elements/block-1","value":{"type":"ProductionLineTable","props":{"dataPath":"/productionLines","title":"各產線良率與停線狀態"},"children":[]}}
```

The frontend applies these patches progressively and reads the table rows from `/state/productionLines/lines` through the widget's data path. The model does not send raw component trees or production numbers in props; backend code creates the registered widget and binds it to query state.

### Error responses

With the model key configured, an invalid prompt returns HTTP `400` with an error envelope:

```json
{ "error": "prompt must be a non-empty string" }
```

If `GROQ_API_KEY` is missing, the endpoint returns HTTP `503`:

```json
{ "error": "Missing GROQ_API_KEY. Set it in your environment before starting the .NET API." }
```

Unexpected model or validation errors return HTTP `500` with an `error` message and `requestId`.

## Mock data functions used by `/api/generate`

These are internal C# functions, not separate HTTP routes. Intent routing chooses the relevant function and its result is added to the UI state.

### Production line list

For `query_production_lines("shift")`, the returned data object is:

```json
{
  "timeRange": "shift",
  "generatedAt": "2026-11-15T10:30:00.0000000+00:00",
  "lines": [
    { "line": "Line-A", "status": "running", "yieldPercent": 97.88, "achievementPercent": 90.5, "producedUnits": 1086, "targetUnits": 1200, "downtimeMinutes": 34 },
    { "line": "Line-B", "status": "running", "yieldPercent": 98.87, "achievementPercent": 97.2, "producedUnits": 972, "targetUnits": 1000, "downtimeMinutes": 18 },
    { "line": "Line-C", "status": "stopped", "yieldPercent": 96.91, "achievementPercent": 85.6, "producedUnits": 1198, "targetUnits": 1400, "downtimeMinutes": 51 }
  ]
}
```

### Single production line

For `query_production_data("Line-A", "shift")`, the result has this shape:

```json
{
  "line": "Line-A",
  "status": "running",
  "timeRange": "shift",
  "generatedAt": "2026-11-15T10:30:00.0000000+00:00",
  "summary": {
    "targetUnits": 1200,
    "producedUnits": 1086,
    "achievementPercent": 90.5,
    "yieldPercent": 97.88,
    "defectUnits": 23,
    "downtimeMinutes": 34,
    "oeePercent": 82.4
  },
  "hourlyOutput": [
    { "hour": "08:00", "planned": 300, "actual": 309 },
    { "hour": "09:00", "planned": 300, "actual": 307 },
    { "hour": "10:00", "planned": 300, "actual": 305 },
    { "hour": "11:00", "planned": 300, "actual": 303 }
  ],
  "stations": [
    { "name": "SMT-01", "status": "running", "utilizationPercent": 94, "currentJob": "PCB-CTRL-2408" },
    { "name": "Assembly-02", "status": "running", "utilizationPercent": 87, "currentJob": "PCB-CTRL-2408" },
    { "name": "Inspection-01", "status": "running", "utilizationPercent": 91, "currentJob": "PCB-CTRL-2408" },
    { "name": "Packaging-01", "status": "running", "utilizationPercent": 83, "currentJob": "PCB-CTRL-2408" }
  ],
  "alerts": [
    { "severity": "info", "station": "Assembly-02", "message": "目前生產節奏符合排程" }
  ]
}
```

The Line-B and Line-C fixtures use the same shape. Line-C is stopped and includes an AOI warning plus an SMT feeder error.

### Service relationships

For `query_service_relationships("checkout-api")`:

```json
{
  "service": "checkout-api",
  "databases": [
    { "name": "postgres-primary", "type": "PostgreSQL", "purpose": "訂單、購物車與付款狀態" },
    { "name": "redis-cart", "type": "Redis", "purpose": "購物車快取與 session" }
  ],
  "upstream": [
    { "name": "identity-service", "relation": "HTTP/gRPC", "purpose": "使用者驗證" },
    { "name": "catalog-service", "relation": "HTTP", "purpose": "商品與庫存查詢" }
  ],
  "downstream": [
    { "name": "payment-service", "relation": "HTTP", "purpose": "建立付款授權" },
    { "name": "notification-worker", "relation": "Kafka", "purpose": "訂單通知" }
  ]
}
```

## Backend source layout

| Folder/file | Responsibility |
| --- | --- |
| `Controllers/` | MVC controllers for health, mock observability, and UI generation |
| `AI/` | Groq client, intent/uiPlan contracts, and model output schemas |
| `Catalog/` | Catalog contract reader and generated frontend catalog JSON |
| `Data/` | Mock monitoring, production, and service relationship functions |
| `Rendering/` | Compiles and validates the json-render UI spec |
| `Hosting/Program.cs` | Dependency injection, MVC setup, server URL, and controller registration |
| `GenerativeUi.Api.csproj` | .NET 10 Web API project |

## Request phases

The corresponding English phase comments are in `Controllers/GenerateController.cs`:

1. **Phase 0:** Validate the HTTP request and prompt.
2. **Phase 1:** Classify the request into domains and widgets.
3. **Phase 2:** Select mock data functions and assemble state.
4. **Phase 3:** Scope catalog descriptions and generate a compact UI plan.
5. **Phase 4:** Compile and validate the json-render spec.
6. **Phase 5:** Stream the validated spec as JSONL patches.

## Frontend catalog contract

`Catalog/catalog-contract.json` is generated from `frontend/src/catalog.js`. After changing the frontend catalog, run this from the `frontend/` directory:

```sh
npm run export:catalog
```

The JSON file exports all registered component names, descriptions, examples, the json-render prompt, and spec JSON Schema. The API reads its component list and descriptions to construct the scoped prompt and validate that compiled component types are registered. New widgets also need an explicit mapping/compile implementation in `Rendering/UiSpecCompiler.cs`; catalog export alone does not create backend behavior.

Commit the generated contract together with catalog changes so the .NET project can run from a clean checkout without regenerating files first.
