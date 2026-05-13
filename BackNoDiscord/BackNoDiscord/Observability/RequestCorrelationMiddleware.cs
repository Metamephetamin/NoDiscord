namespace BackNoDiscord.Observability;

public sealed class RequestCorrelationMiddleware
{
    public const string CorrelationIdHeaderName = "X-Correlation-ID";

    private readonly RequestDelegate _next;
    private readonly ILogger<RequestCorrelationMiddleware> _logger;

    public RequestCorrelationMiddleware(RequestDelegate next, ILogger<RequestCorrelationMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = NormalizeCorrelationId(context.Request.Headers[CorrelationIdHeaderName].FirstOrDefault())
            ?? context.TraceIdentifier;
        context.TraceIdentifier = correlationId;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[CorrelationIdHeaderName] = correlationId;
            return Task.CompletedTask;
        });

        var startedAt = TimeProvider.System.GetTimestamp();
        try
        {
            await _next(context);
        }
        finally
        {
            var elapsedMs = TimeProvider.System.GetElapsedTime(startedAt).TotalMilliseconds;
            _logger.LogInformation(
                "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMs:F1} ms correlationId={CorrelationId}",
                context.Request.Method,
                context.Request.Path.Value,
                context.Response.StatusCode,
                elapsedMs,
                correlationId);
        }
    }

    private static string? NormalizeCorrelationId(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > 128)
        {
            return null;
        }

        return normalized.All(character =>
            char.IsLetterOrDigit(character) ||
            character is '-' or '_' or '.' or ':')
            ? normalized
            : null;
    }
}
