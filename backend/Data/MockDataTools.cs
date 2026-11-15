using System.Security.Cryptography;

namespace GenerativeUi.Api;

// Phase 2 data sources. Replace these mock monitoring, production, and relationship functions with API or MCP adapters.
public sealed class MockDataTools
{
    private static readonly Dictionary<string, (int Target, int Produced, int Defects, int Downtime, double Oee, string Status)> Lines = new()
    {
        ["Line-A"] = (1200, 1086, 23, 34, 82.4, "running"),
        ["Line-B"] = (1000, 972, 11, 18, 88.1, "running"),
        ["Line-C"] = (1400, 1198, 37, 51, 76.8, "stopped")
    };

    public Dictionary<string, object?> QueryMonitoring(string service, string timeRange)
    {
        var random = new Random(RandomNumberGenerator.GetInt32(int.MaxValue));
        var points = Enumerable.Range(0, 7).Select(index =>
        {
            var progress = Math.Max(0, (index - 2) / 4d);
            return new
            {
                timestamp = DateTimeOffset.UtcNow.AddMinutes(-(6 - index) * 5).ToString("O"),
                latency = Math.Max(90, Math.Round(165 + progress * 510 + (random.NextDouble() - .5) * 90)),
                errorRate = Math.Max(.05, Math.Round(.25 + progress * 2.6 + (random.NextDouble() - .5) * .45, 2))
            };
        }).ToArray();
        var first = points[0]; var latest = points[^1];
        var traces = Enumerable.Range(0, 3).Select(index =>
        {
            var db = random.Next(260, 521); var app = random.Next(65, 161); var payment = random.Next(40, 161);
            var spans = new object[]
            {
                new { name = "GET /checkout", service, startMs = 0, durationMs = db + app + payment + 40, status = "ok" },
                new { name = "loadCart", service, startMs = 12, durationMs = app, status = "ok" },
                new { name = "SELECT cart_items", service = "postgres-primary", startMs = 28, durationMs = db, status = db > 400 ? "error" : "ok" },
                new { name = "POST /authorize", service = "payment-service", startMs = db + app + 18, durationMs = payment, status = "ok" }
            };
            return new { traceId = $"trc-{Guid.NewGuid().ToString("N")[..8]}-{index + 1}", service, durationMs = db + app + payment + 40, spans };
        }).ToArray();
        var latencyTrend = Math.Round((latest.latency - first.latency) / Math.Max(first.latency, 1) * 100);
        var errorTrend = Math.Round((latest.errorRate - first.errorRate) / Math.Max(first.errorRate, .1) * 100);
        var success = Math.Round(100 - latest.errorRate, 2);
        var ranges = new Dictionary<string, string> { ["15m"] = "最近 15 分鐘", ["30m"] = "最近 30 分鐘", ["1h"] = "最近 1 小時", ["6h"] = "最近 6 小時", ["24h"] = "最近 24 小時" };
        var logs = new object[]
        {
            new { timestamp = DateTimeOffset.UtcNow.AddMinutes(-2).ToString("O"), level = "ERROR", service, message = $"checkout request latency {latest.latency}ms exceeded the 300ms SLO", traceId = traces[0].traceId },
            new { timestamp = DateTimeOffset.UtcNow.AddMinutes(-4).ToString("O"), level = "WARN", service = "postgres-primary", message = "connection pool utilization reached 92%", traceId = traces[1].traceId },
            new { timestamp = DateTimeOffset.UtcNow.AddMinutes(-7).ToString("O"), level = "ERROR", service = "payment-service", message = "upstream request completed after retry", traceId = traces[2].traceId }
        };
        return new Dictionary<string, object?>
        {
            ["service"] = service, ["generatedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["timeRange"] = ranges.GetValueOrDefault(timeRange, "最近 30 分鐘"),
            ["metrics"] = new object[]
            {
                new { label = "平均延遲", value = $"{latest.latency} ms", trend = $"+{latencyTrend}%" },
                new { label = "錯誤率", value = $"{latest.errorRate}%", trend = $"+{errorTrend}%" },
                new { label = "成功率", value = $"{success}%", trend = success < 99 ? "下降" : "穩定" }
            },
            ["latencySeries"] = points.Select(p => new { p.timestamp, value = p.latency }).ToArray(),
            ["errorSeries"] = points.Select(p => new { p.timestamp, value = p.errorRate }).ToArray(),
            ["traces"] = traces,
            ["logs"] = logs
        };
    }

    public object QueryProduction(string requestedLine, string timeRange)
    {
        var line = Lines.GetValueOrDefault(requestedLine, Lines["Line-A"]);
        var name = Lines.ContainsKey(requestedLine) ? requestedLine : "Line-A";
        var factor = timeRange == "24h" ? 3 : timeRange == "today" ? 2 : 1;
        var target = line.Target * factor; var produced = line.Produced * factor; var defects = line.Defects * factor;
        var hourCount = timeRange == "24h" ? 8 : timeRange == "today" ? 6 : 4;
        var hourly = Enumerable.Range(0, hourCount).Select(index =>
        {
            var planned = target / hourCount;
            var offset = ((index * 17 + name.Length * 3) % 19) - 9;
            return new { hour = $"{8 + index:00}:00", planned, actual = Math.Max(0, planned + offset) };
        }).ToArray();
        var stopped = name == "Line-C";
        return new
        {
            line = name, status = line.Status, timeRange, generatedAt = DateTimeOffset.UtcNow.ToString("O"),
            summary = new { targetUnits = target, producedUnits = produced, achievementPercent = Math.Round(produced / (double)target * 100, 1), yieldPercent = Math.Round((produced - defects) / (double)produced * 100, 2), defectUnits = defects, downtimeMinutes = line.Downtime * factor, oeePercent = line.Oee },
            hourlyOutput = hourly,
            stations = new object[]
            {
                new { name = "SMT-01", status = stopped ? "stopped" : "running", utilizationPercent = 94, currentJob = "PCB-CTRL-2408" },
                new { name = "Assembly-02", status = stopped ? "stopped" : "running", utilizationPercent = 87, currentJob = "PCB-CTRL-2408" },
                new { name = "Inspection-01", status = stopped ? "stopped" : "running", utilizationPercent = stopped ? 72 : 91, currentJob = "PCB-CTRL-2408" },
                new { name = "Packaging-01", status = stopped ? "stopped" : "running", utilizationPercent = 83, currentJob = "PCB-CTRL-2408" }
            },
            alerts = stopped
                ? new object[] { new { severity = "warning", station = "Inspection-01", message = "AOI 誤判率高於 2.5% 門檻" }, new { severity = "error", station = "SMT-01", message = "供料器停機中，累計 51 分鐘" } }
                : new object[] { new { severity = "info", station = "Assembly-02", message = "目前生產節奏符合排程" } }
        };
    }

    public object QueryProductionLines(string timeRange)
    {
        var factor = timeRange == "24h" ? 3 : timeRange == "today" ? 2 : 1;
        var lines = Lines.Select(entry =>
        {
            var data = entry.Value; var produced = data.Produced * factor; var target = data.Target * factor; var defects = data.Defects * factor;
            return new { line = entry.Key, status = data.Status, yieldPercent = Math.Round((produced - defects) / (double)produced * 100, 2), achievementPercent = Math.Round(produced / (double)target * 100, 1), producedUnits = produced, targetUnits = target, downtimeMinutes = data.Downtime * factor };
        }).ToArray();
        return new { timeRange, generatedAt = DateTimeOffset.UtcNow.ToString("O"), lines };
    }

    public object QueryRelationships(string service) => service switch
    {
        "payment-service" => new { service, databases = new[] { new { name = "postgres-payments", type = "PostgreSQL", purpose = "付款與退款紀錄" } }, upstream = new[] { new { name = "checkout-api", relation = "HTTP", purpose = "接收結帳付款請求" } }, downstream = new[] { new { name = "bank-gateway", relation = "HTTPS", purpose = "外部金流授權" }, new { name = "notification-worker", relation = "Kafka", purpose = "付款結果通知" } } },
        "catalog-service" => new { service, databases = new[] { new { name = "postgres-catalog", type = "PostgreSQL", purpose = "商品目錄與價格" }, new { name = "redis-catalog", type = "Redis", purpose = "商品讀取快取" } }, upstream = new[] { new { name = "checkout-api", relation = "HTTP", purpose = "結帳時查詢商品" } }, downstream = new[] { new { name = "inventory-service", relation = "gRPC", purpose = "庫存確認" } } },
        "checkout-api" => new { service, databases = new[] { new { name = "postgres-primary", type = "PostgreSQL", purpose = "訂單、購物車與付款狀態" }, new { name = "redis-cart", type = "Redis", purpose = "購物車快取與 session" } }, upstream = new[] { new { name = "identity-service", relation = "HTTP/gRPC", purpose = "使用者驗證" }, new { name = "catalog-service", relation = "HTTP", purpose = "商品與庫存查詢" } }, downstream = new[] { new { name = "payment-service", relation = "HTTP", purpose = "建立付款授權" }, new { name = "notification-worker", relation = "Kafka", purpose = "訂單通知" } } },
        _ => new { service, databases = new[] { new { name = $"{service}-db", type = "PostgreSQL", purpose = "主要服務資料" } }, upstream = new[] { new { name = "api-gateway", relation = "HTTP", purpose = "接收外部請求" } }, downstream = new[] { new { name = "notification-worker", relation = "Kafka", purpose = "非同步事件處理" } } }
    };
}
