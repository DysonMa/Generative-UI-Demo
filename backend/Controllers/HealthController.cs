using Microsoft.AspNetCore.Mvc;

namespace GenerativeUi.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController(IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        ok = true,
        model = Environment.GetEnvironmentVariable("GROQ_MODEL") ?? configuration["Groq:Model"] ?? "openai/gpt-oss-20b",
        backend = ".NET 10 Web API"
    });
}
