using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Services;

public sealed class EmailVerificationSenderTests
{
    [Fact]
    public void BuildVerificationMessage_UsesLanayaBrandWithoutDuplicatingOldMaxCodeTitle()
    {
        var options = new EmailOptions
        {
            FromAddress = "code@lanaya.space",
            FromName = "Lanaya"
        };

        var message = SmtpEmailVerificationSender.BuildVerificationMessage(
            options,
            "user@example.com",
            "822435",
            "11:11");

        Assert.Equal("Lanaya", message.From.Mailboxes.Single().Name);
        Assert.Equal("Код входа", message.Subject);
        Assert.DoesNotContain("Код MAX", message.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Ваш код: 822435", message.TextBody);
        Assert.DoesNotContain("Код MAX", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(">MAX<", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Lanaya", message.HtmlBody);
    }
}
