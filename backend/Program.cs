using GenerativeUi.Api;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 64 * 1024);
builder.Services.AddHttpClient<GroqClient>();
builder.Services.AddSingleton<CatalogContract>();
builder.Services.AddSingleton<MockDataTools>();
builder.Services.AddSingleton<UiSpecCompiler>();
builder.Services.AddControllers().ConfigureApiBehaviorOptions(options =>
{
    // Return a small, frontend-compatible error envelope when controller model binding fails.
    options.InvalidModelStateResponseFactory = _ => new BadRequestObjectResult(new { error = "Request body must be valid JSON" });
});

var app = builder.Build();
Console.WriteLine("GenerativeUi.Api: application built");
var port = Environment.GetEnvironmentVariable("PORT") ?? "3002";
app.Urls.Add(Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? $"http://127.0.0.1:{port}");

app.MapControllers();

Console.WriteLine($"GenerativeUi.Api: listening at {string.Join(", ", app.Urls)}");
app.Run();

public partial class Program;

public sealed record GenerateRequest(string? Prompt);

internal static class IntentSystemPrompt
{
    public const string Value = """
        將使用者問題分類成需要查詢的資料領域與 widgets。只選真正相關的領域。
        monitoring 對應 metrics、latency_chart、error_chart、logs、traces、incident_report；production 對應生產摘要、產量、工站、告警、全部產線；relationships 對應服務依賴與資料庫。
        抽取明確的 service、line、時間範圍，未提到就給 null。詢問所有產線、各線良率或停線時 allLines=true 並選 production_lines。
        每個領域至少選一個相關 widget。只輸出 schema 指定 JSON。
        """;
}
