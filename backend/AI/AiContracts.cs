using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net.Http.Json;

namespace GenerativeUi.Api;

internal static class Schemas
{
    // Both model calls use fixed output contracts instead of asking the model to generate a free-form renderer spec.
    private static object StringEnum(params string[] values) => new { type = "string", @enum = values };
    private static object NullableEnum(params string[] values) => new { anyOf = new object[] { StringEnum(values), new { type = "null" } } };
    private static object Object(IReadOnlyDictionary<string, object> properties) => new
    {
        type = "object", properties, required = properties.Keys.ToArray(), additionalProperties = false
    };

    public static readonly object Intent = Object(new Dictionary<string, object>
    {
        ["domains"] = new { type = "array", items = StringEnum("monitoring", "production", "relationships") },
        ["widgets"] = new { type = "array", items = StringEnum(
            "metrics", "latency_chart", "error_chart", "logs", "traces", "incident_report",
            "production_summary", "production_output", "stations", "production_alerts", "production_lines", "service_dependencies") },
        ["service"] = new { anyOf = new object[] { new { type = "string" }, new { type = "null" } } },
        ["line"] = new { anyOf = new object[] { new { type = "string" }, new { type = "null" } } },
        ["allLines"] = new { type = "boolean" },
        ["timeRange"] = NullableEnum("15m", "30m", "1h", "6h", "24h", "shift", "today")
    });

    public static readonly object UiPlan = Object(new Dictionary<string, object>
    {
        ["title"] = new { type = "string" },
        ["subtitle"] = new { type = "string" },
        ["blocks"] = new
        {
            type = "array",
            items = Object(new Dictionary<string, object>
            {
                ["kind"] = StringEnum("metrics", "latency_chart", "error_chart", "logs", "traces", "incident_report",
                    "production_summary", "production_output", "stations", "production_alerts", "production_lines", "service_dependencies", "insight"),
                ["title"] = new { type = "string" },
                ["body"] = new { type = "string" }
            })
        }
    });
}

// Provider adapter: this implementation calls Groq Chat Completions directly. To switch providers,
// keep the IntentResult and UiPlan contracts and replace this adapter plus its auth/session/output-format handling.
public sealed class GroqClient(HttpClient http, IConfiguration configuration)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<T> GenerateAsync<T>(object schema, string schemaName, string system, string prompt,
        int maxTokens, CancellationToken cancellationToken)
    {
        var apiKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey)) throw new InvalidOperationException("GROQ_API_KEY is not configured.");

        var model = Environment.GetEnvironmentVariable("GROQ_MODEL") ?? configuration["Groq:Model"] ?? "openai/gpt-oss-20b";
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        var payload = new Dictionary<string, object?>
        {
            ["model"] = model,
            ["messages"] = new[] { new { role = "system", content = system }, new { role = "user", content = prompt } },
            ["max_completion_tokens"] = maxTokens,
            ["temperature"] = 0.2,
            ["response_format"] = new
            {
                type = "json_schema",
                json_schema = new { name = schemaName, strict = true, schema }
            }
        };
        if (model.StartsWith("openai/gpt-oss-", StringComparison.Ordinal) || model == "qwen/qwen3.8-27b")
            payload["reasoning_effort"] = "low";
        request.Content = JsonContent.Create(payload);

        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var safeBody = body.Length > 700 ? body[..700] : body;
            throw new InvalidOperationException($"Groq API 回應 {(int)response.StatusCode}: {safeBody}");
        }

        using var document = JsonDocument.Parse(body);
        var content = document.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
        if (string.IsNullOrWhiteSpace(content)) throw new InvalidOperationException("Groq returned an empty JSON response.");
        try
        {
            return JsonSerializer.Deserialize<T>(content, JsonOptions)
                ?? throw new InvalidOperationException("Groq JSON could not be converted to the expected type.");
        }
        catch (JsonException exception)
        {
            throw new InvalidOperationException($"Groq JSON could not be parsed: {exception.Message}", exception);
        }
    }
}

internal sealed class IntentResult
{
    [JsonPropertyName("domains")] public List<string> Domains { get; set; } = [];
    [JsonPropertyName("widgets")] public List<string> Widgets { get; set; } = [];
    [JsonPropertyName("service")] public string? Service { get; set; }
    [JsonPropertyName("line")] public string? Line { get; set; }
    [JsonPropertyName("allLines")] public bool AllLines { get; set; }
    [JsonPropertyName("timeRange")] public string? TimeRange { get; set; }

    public void Normalize()
    {
        Domains = Domains.Distinct(StringComparer.Ordinal).Where(x => x is "monitoring" or "production" or "relationships").ToList();
        Widgets = Widgets.Distinct(StringComparer.Ordinal).Where(IntentWidgets.Contains).Take(8).ToList();
        if (Domains.Contains("monitoring") && !Widgets.Any(x => x is "metrics" or "latency_chart" or "error_chart" or "logs" or "traces" or "incident_report")) Widgets.Add("metrics");
        if (Domains.Contains("production"))
        {
            if (AllLines)
            {
                Widgets.RemoveAll(x => x is "production_summary" or "production_output" or "stations" or "production_alerts");
                if (!Widgets.Contains("production_lines")) Widgets.Add("production_lines");
            }
            else
            {
                Widgets.Remove("production_lines");
                if (!Widgets.Any(x => x is "production_summary" or "production_output" or "stations" or "production_alerts")) Widgets.Add("production_summary");
            }
        }
        if (Domains.Contains("relationships") && !Widgets.Contains("service_dependencies")) Widgets.Add("service_dependencies");
        if (TimeRange is not ("15m" or "30m" or "1h" or "6h" or "24h" or "shift" or "today")) TimeRange = null;
    }

    private static readonly HashSet<string> IntentWidgets = new(StringComparer.Ordinal)
    {
        "metrics", "latency_chart", "error_chart", "logs", "traces", "incident_report", "production_summary",
        "production_output", "stations", "production_alerts", "production_lines", "service_dependencies"
    };

    public static List<string> DefaultWidgets(IEnumerable<string> domains) => domains.SelectMany(domain => domain switch
    {
        "monitoring" => new[] { "metrics", "latency_chart", "incident_report" },
        "production" => new[] { "production_summary", "production_output", "stations" },
        "relationships" => new[] { "service_dependencies" },
        _ => Array.Empty<string>()
    }).Distinct().ToList();
}

internal sealed class UiPlan
{
    [JsonPropertyName("title")] public string Title { get; set; } = "分析結果";
    [JsonPropertyName("subtitle")] public string Subtitle { get; set; } = "";
    [JsonPropertyName("blocks")] public List<UiBlock> Blocks { get; set; } = [];
}

internal sealed class UiBlock
{
    [JsonPropertyName("kind")] public string Kind { get; set; } = "insight";
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("body")] public string Body { get; set; } = "";
}
