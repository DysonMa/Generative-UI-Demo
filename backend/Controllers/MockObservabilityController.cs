using Microsoft.AspNetCore.Mvc;

namespace GenerativeUi.Api.Controllers;

[ApiController]
[Route("api/mock-observability")]
public sealed class MockObservabilityController(MockDataTools dataTools) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(dataTools.QueryMonitoring("checkout-api", "30m"));
}
