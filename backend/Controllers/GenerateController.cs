using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace GenerativeUi.Api.Controllers;

[ApiController]
[Route("api/generate")]
public sealed class GenerateController(
    GroqClient groq,
    CatalogContract catalog,
    MockDataTools tools,
    UiSpecCompiler compiler,
    ILogger<GenerateController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Generate([FromBody] GenerateRequest? request)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];
        void Stage(string stage, object? extra = null)
        {
            var fields = extra is null ? "" : $" {JsonSerializer.Serialize(extra)}";
            logger.LogInformation("[{RequestId}] {Stage}{Extra}", requestId, stage, fields);
        }

        // Phase 0 — Accept and validate the request body and prompt.
        Stage("request_received");
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GROQ_API_KEY")))
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { error = "Missing GROQ_API_KEY. Set it in your environment before starting the .NET API." });

        var prompt = request?.Prompt?.Trim();
        if (string.IsNullOrWhiteSpace(prompt)) return BadRequest(new { error = "prompt must be a non-empty string" });
        if (prompt.Length > 4000) return BadRequest(new { error = "prompt must be 4000 characters or fewer" });

        try
        {
            Stage("request_validated");

            // Phase 1 — Classify intent into a validated domain, widget, service/line, and time range.
            var intent = await groq.GenerateAsync<IntentResult>(Schemas.Intent, "request_intent", IntentSystemPrompt.Value,
                prompt, 900, HttpContext.RequestAborted);
            intent.Normalize();
            if (intent.Domains.Count == 0) throw new InvalidOperationException("The model did not select a data domain.");
            Stage("intent_classification_finished", new { intent.Domains, intent.Widgets });

            // Phase 2 — Query data: backend code selects read-only functions and assembles the UI state.
            // The model cannot provide arbitrary function names or unchecked tool arguments.
            var state = new Dictionary<string, object?>();
            var selectedTools = new List<string>();
            if (intent.Domains.Contains("monitoring"))
            {
                selectedTools.Add("query_monitoring_data");
                Stage("tool_started", new { tool = "query_monitoring_data" });
                var monitoring = tools.QueryMonitoring(intent.Service ?? "checkout-api", intent.TimeRange ?? "30m");
                state["service"] = monitoring["service"];
                state["generatedAt"] = monitoring["generatedAt"];
                state["timeRange"] = monitoring["timeRange"];
                state["metrics"] = monitoring["metrics"];
                state["latencySeries"] = monitoring["latencySeries"];
                state["errorSeries"] = monitoring["errorSeries"];
                state["traces"] = monitoring["traces"];
                state["logs"] = monitoring["logs"];
                Stage("tool_finished", new { tool = "query_monitoring_data" });
            }
            if (intent.Domains.Contains("production"))
            {
                if (intent.AllLines)
                {
                    selectedTools.Add("query_production_lines");
                    Stage("tool_started", new { tool = "query_production_lines" });
                    state["productionLines"] = tools.QueryProductionLines(intent.TimeRange ?? "shift");
                    Stage("tool_finished", new { tool = "query_production_lines" });
                }
                else
                {
                    selectedTools.Add("query_production_data");
                    Stage("tool_started", new { tool = "query_production_data" });
                    state["production"] = tools.QueryProduction(intent.Line ?? "Line-A", intent.TimeRange ?? "shift");
                    Stage("tool_finished", new { tool = "query_production_data" });
                }
            }
            if (intent.Domains.Contains("relationships"))
            {
                selectedTools.Add("query_service_relationships");
                Stage("tool_started", new { tool = "query_service_relationships" });
                state["serviceRelationships"] = tools.QueryRelationships(intent.Service ?? "checkout-api");
                Stage("tool_finished", new { tool = "query_service_relationships" });
            }
            Stage("tools_selected", new { tools = selectedTools });

            // Phase 3 — Scope the catalog and ask the model for a compact UI plan.
            var requestWidgets = intent.Widgets.Count > 0 ? intent.Widgets : IntentResult.DefaultWidgets(intent.Domains);
            var available = catalog.GetComponentDescriptions(requestWidgets, intent.AllLines);
            var systemPrompt = $"""
                你是繁體中文介面規劃器。只輸出 schema 指定的 title、subtitle、blocks。
                blocks 順序即畫面順序。kind 僅可使用本次可用 widgets；每個 block 的 title 是區塊標題，body 僅用於 insight 或 incident_report 摘要。
                僅根據提供資料描述，不可捏造數字或因果。若資料不足，明確說明限制。最多產生 6 個 blocks。
                本次可用 widgets：{string.Join(", ", requestWidgets)}。
                可用元件定義：
                {available}
                """;
            var serializedState = JsonSerializer.Serialize(state);
            Stage("ui_generation_started", new { componentCount = available.Length, stateBytes = serializedState.Length });
            var plan = await groq.GenerateAsync<UiPlan>(Schemas.UiPlan, "ui_plan", systemPrompt,
                $"使用者問題：\n{prompt}\n\n已查詢資料（唯一事實來源）：\n{serializedState}", 2200, HttpContext.RequestAborted);

            // Phase 4 — Compile and validate the json-render spec before sending any response data.
            var spec = compiler.Compile(plan, state, requestWidgets, catalog.ComponentNames);
            Stage("ui_generation_validated", new { elements = spec.Elements.Count });

            // Phase 5 — Stream validated JSONL patches in the format consumed by the React renderer.
            Response.StatusCode = StatusCodes.Status200OK;
            Response.ContentType = "text/plain; charset=utf-8";
            Response.Headers.CacheControl = "no-cache";
            await foreach (var patch in compiler.ToPatches(spec, HttpContext.RequestAborted))
            {
                await Response.WriteAsync(JsonSerializer.Serialize(patch, new JsonSerializerOptions(JsonSerializerDefaults.Web)) + "\n",
                    HttpContext.RequestAborted);
                await Response.Body.FlushAsync(HttpContext.RequestAborted);
            }
            Stage("ui_patches_sent");
            return new EmptyResult();
        }
        catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
        {
            Stage("request_cancelled");
            return new EmptyResult();
        }
        catch (Exception exception)
        {
            logger.LogError("Request {RequestId} failed with {ErrorType}. Stack trace: {StackTrace}",
                requestId, exception.GetType().Name, exception.StackTrace);
            Stage("request_failed", new { errorType = exception.GetType().Name });
            if (Response.HasStarted)
            {
                HttpContext.Abort();
                return new EmptyResult();
            }
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { error = $"AI 生成失敗（請求 {requestId}）：{exception.Message}", requestId });
        }
    }
}
