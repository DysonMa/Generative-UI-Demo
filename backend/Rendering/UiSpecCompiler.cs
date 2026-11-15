using System.Runtime.CompilerServices;
using System.Text.Json;

namespace GenerativeUi.Api;

// Phase 4 compiles the compact model-generated uiPlan into a catalog-compatible spec and validates it before streaming.
public sealed class UiSpecCompiler
{
    private sealed record WidgetDefinition(string Component, string? DataPath = null, string? StateKey = null, bool HasTitle = false);

    private static readonly Dictionary<string, WidgetDefinition> Definitions = new(StringComparer.Ordinal)
    {
        ["metrics"] = new("MetricGrid", "/metrics", "metrics"),
        ["latency_chart"] = new("MetricChart", "/latencySeries", "latencySeries", true),
        ["error_chart"] = new("MetricChart", "/errorSeries", "errorSeries", true),
        ["logs"] = new("LogTable", "/logs", "logs", true),
        ["traces"] = new("TraceWaterfall", "/traces", "traces", true),
        ["incident_report"] = new("IncidentReport", null, "metrics"),
        ["production_summary"] = new("ProductionOverview", "/production", "production"),
        ["production_output"] = new("ProductionOutputChart", "/production/hourlyOutput", "production", true),
        ["stations"] = new("ProductionStationTable", "/production/stations", "production", true),
        ["production_alerts"] = new("ProductionAlertList", "/production/alerts", "production", true),
        ["production_lines"] = new("ProductionLineTable", "/productionLines", "productionLines", true),
        ["service_dependencies"] = new("ServiceDependencyGraph", "/serviceRelationships", "serviceRelationships")
    };

    internal RenderSpec Compile(UiPlan plan, Dictionary<string, object?> state, IReadOnlyCollection<string> requestedWidgets,
        IReadOnlySet<string> registeredComponents)
    {
        var allowed = requestedWidgets.ToHashSet(StringComparer.Ordinal);
        var blocks = plan.Blocks.Where(block => block.Kind == "insight" ||
            (allowed.Contains(block.Kind) && Definitions.TryGetValue(block.Kind, out var definition) && state.ContainsKey(definition.StateKey!)))
            .Take(6).ToList();
        if (!blocks.Any(block => block.Kind != "insight"))
        {
            var fallback = requestedWidgets.FirstOrDefault(kind => Definitions.TryGetValue(kind, out var definition) && state.ContainsKey(definition.StateKey!));
            if (fallback is null) throw new InvalidOperationException("No available widget matches the queried data.");
            blocks.Insert(0, new UiBlock { Kind = fallback, Title = plan.Title, Body = "" });
        }

        var elements = new Dictionary<string, RenderElement>(StringComparer.Ordinal)
        {
            ["root"] = new("Stack", new Dictionary<string, object?>
            {
                ["direction"] = "vertical", ["gap"] = "lg", ["align"] = "stretch", ["justify"] = "start", ["className"] = null
            }, ["heading"]),
            ["heading"] = new("Heading", new Dictionary<string, object?>
            {
                ["text"] = Clean(plan.Title, "分析結果"), ["level"] = "h1"
            }, [])
        };
        var rootChildren = elements["root"].Children.ToList();
        if (!string.IsNullOrWhiteSpace(plan.Subtitle))
        {
            elements["subtitle"] = new("Text", new Dictionary<string, object?> { ["text"] = plan.Subtitle.Trim(), ["variant"] = "muted" }, []);
            rootChildren.Add("subtitle");
        }
        for (var i = 0; i < blocks.Count; i++)
        {
            var id = $"block-{i + 1}";
            elements[id] = MakeElement(blocks[i]);
            rootChildren.Add(id);
        }
        elements["root"] = elements["root"] with { Children = rootChildren };
        var spec = new RenderSpec("root", elements, state);
        Validate(spec, registeredComponents);
        return spec;
    }

    private static RenderElement MakeElement(UiBlock block)
    {
        if (block.Kind == "insight")
            return new("Alert", new Dictionary<string, object?> { ["title"] = Clean(block.Title, "分析摘要"), ["message"] = block.Body, ["type"] = "info" }, []);

        var definition = Definitions[block.Kind];
        if (block.Kind == "incident_report")
        {
            return new("IncidentReport", new Dictionary<string, object?>
            {
                ["title"] = Clean(block.Title, "問題分析"), ["confidence"] = "待確認", ["summary"] = block.Body,
                ["findings"] = string.IsNullOrWhiteSpace(block.Body)
                    ? Array.Empty<object>()
                    : new[] { new { title = "資料摘要", detail = block.Body } }
            }, []);
        }

        var props = new Dictionary<string, object?> { ["dataPath"] = definition.DataPath };
        if (definition.HasTitle) props["title"] = Clean(block.Title, block.Kind);
        if (block.Kind is "latency_chart" or "error_chart") props["unit"] = block.Kind == "latency_chart" ? "ms" : "%";
        return new(definition.Component, props, []);
    }

    private static void Validate(RenderSpec spec, IReadOnlySet<string> registeredComponents)
    {
        if (string.IsNullOrWhiteSpace(spec.Root) || !spec.Elements.ContainsKey(spec.Root))
            throw new InvalidOperationException("The UI spec is missing its root element.");
        foreach (var (id, element) in spec.Elements)
        {
            if (!registeredComponents.Contains(element.Type)) throw new InvalidOperationException($"Component type '{element.Type}' is not registered.");
            foreach (var child in element.Children)
                if (!spec.Elements.ContainsKey(child)) throw new InvalidOperationException($"Element '{id}' references missing child '{child}'.");
            if (Definitions.Values.Any(definition => definition.Component == element.Type) && element.Type != "IncidentReport")
            {
                if (!element.Props.TryGetValue("dataPath", out var pathValue) || pathValue is not string path || !PointerExists(spec.State, path))
                    throw new InvalidOperationException($"Element '{id}' dataPath does not resolve to state data.");
            }
        }
    }

    private static bool PointerExists(object? root, string pointer)
    {
        if (pointer.Length == 0) return true;
        if (!pointer.StartsWith('/')) return false;
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(root));
        var current = document.RootElement;
        foreach (var rawPart in pointer[1..].Split('/'))
        {
            var part = rawPart.Replace("~1", "/").Replace("~0", "~");
            if (current.ValueKind == JsonValueKind.Object && current.TryGetProperty(part, out var child)) current = child;
            else if (current.ValueKind == JsonValueKind.Array && int.TryParse(part, out var index) && index >= 0 && index < current.GetArrayLength()) current = current[index];
            else return false;
        }
        return current.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined);
    }

    private static string Clean(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim()[..Math.Min(value.Trim().Length, 120)];

    internal async IAsyncEnumerable<Patch> ToPatches(RenderSpec spec, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        yield return new("add", "/root", spec.Root);
        yield return new("add", "/state", spec.State);
        foreach (var (id, element) in spec.Elements)
        {
            cancellationToken.ThrowIfCancellationRequested();
            yield return new("add", $"/elements/{EscapePointer(id)}", element);
            await Task.Yield();
        }
    }

    private static string EscapePointer(string value) => value.Replace("~", "~0").Replace("/", "~1");
}

internal sealed record RenderSpec(string Root, Dictionary<string, RenderElement> Elements, Dictionary<string, object?> State);
internal sealed record RenderElement(string Type, Dictionary<string, object?> Props, IReadOnlyList<string> Children);
internal sealed record Patch(string Op, string Path, object? Value);
