namespace BackNoDiscord.Services;

public sealed class LiveKitOptions
{
    public string ServerUrl { get; set; } = "ws://127.0.0.1:7880";
    public string ApiKey { get; set; } = string.Empty;
    public string ApiSecret { get; set; } = string.Empty;
    public int TokenLifetimeMinutes { get; set; } = 240;
}
