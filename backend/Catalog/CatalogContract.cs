using System.Text.Json;

namespace GenerativeUi.Api;

// Reads the cross-language catalog contract used in Phases 3 and 4; the frontend script exports the React/Zod catalog as JSON.
public sealed class CatalogContract
{
    private readonly JsonDocument document;
    private readonly HashSet<string> componentNames;
    public IReadOnlySet<string> ComponentNames => componentNames;

    public CatalogContract(IWebHostEnvironment environment)
    {
        var path = Path.Combine(environment.ContentRootPath, "Catalog", "catalog-contract.json");
        if (!File.Exists(path)) throw new FileNotFoundException($"Frontend catalog was not found at '{path}'. Run 'npm run export:catalog' from the frontend directory first.");
        document = JsonDocument.Parse(File.ReadAllText(path));
        componentNames = document.RootElement.GetProperty("componentNames").EnumerateArray()
            .Select(item => item.GetString()!).ToHashSet(StringComparer.Ordinal);
    }

    public string GetComponentDescriptions(IEnumerable<string> widgets, bool allLines)
    {
        var names = new HashSet<string>(["Stack", "Heading", "Text", "Alert"], StringComparer.Ordinal);
        var map = new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["metrics"] = ["MetricGrid"], ["latency_chart"] = ["MetricChart"], ["error_chart"] = ["MetricChart"],
            ["logs"] = ["LogTable"], ["traces"] = ["TraceWaterfall"], ["incident_report"] = ["IncidentReport"],
            ["production_summary"] = ["ProductionOverview"], ["production_output"] = ["ProductionOutputChart"],
            ["stations"] = ["ProductionStationTable"], ["production_alerts"] = ["ProductionAlertList"],
            ["production_lines"] = ["ProductionLineTable"], ["service_dependencies"] = ["ServiceDependencyGraph"]
        };
        foreach (var widget in widgets)
            if (map.TryGetValue(widget, out var components)) names.UnionWith(components);
        if (allLines) names.Add("ProductionLineTable");

        var componentsElement = document.RootElement.GetProperty("components");
        return string.Join("\n", names.Where(componentNames.Contains).Select(name =>
        {
            var item = componentsElement.GetProperty(name);
            var description = item.TryGetProperty("description", out var value) ? value.GetString() : "";
            var example = item.TryGetProperty("example", out var exampleValue) ? $" 範例：{exampleValue}" : "";
            return $"- {name}: {description}{example}";
        }));
    }
}
