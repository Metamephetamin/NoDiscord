using System.Text.Json;
using BackNoDiscord.Observability;

namespace BackNoDiscord.Tests.Observability;

public sealed class ClientDiagnosticEventSanitizerTests
{
    [Fact]
    public void TrySanitize_AcceptsSafeDiagnosticFields()
    {
        using var document = JsonDocument.Parse("""
        {
          "type": "chat signalr start failed",
          "surface": "chat-signalr",
          "route": "/channels/1?access_token=secret&view=chat",
          "appVersion": "1.2.3",
          "errorName": "NetworkError",
          "phase": "start-failed",
          "status": "Disconnected",
          "timestamp": "2026-05-13T10:00:00Z"
        }
        """);

        var accepted = ClientDiagnosticEventSanitizer.TrySanitize(document.RootElement, out var diagnostic, out var reason);

        Assert.True(accepted, reason);
        Assert.Equal("chat signalr start failed", diagnostic.Type);
        Assert.Equal("chat-signalr", diagnostic.Surface);
        Assert.Equal("/channels/1?access_token=[redacted]&view=chat", diagnostic.Route);
        Assert.Equal("NetworkError", diagnostic.ErrorName);
    }

    [Fact]
    public void TrySanitize_RejectsMessageContentAndTokenFields()
    {
        using var messageDocument = JsonDocument.Parse("""{"type":"renderer","message":"private chat content"}""");
        using var tokenDocument = JsonDocument.Parse("""{"type":"renderer","nested":{"token":"secret"}}""");

        Assert.False(ClientDiagnosticEventSanitizer.TrySanitize(messageDocument.RootElement, out _, out var messageReason));
        Assert.False(ClientDiagnosticEventSanitizer.TrySanitize(tokenDocument.RootElement, out _, out var tokenReason));
        Assert.Contains("sensitive", messageReason);
        Assert.Contains("sensitive", tokenReason);
    }
}
