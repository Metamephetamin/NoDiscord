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
        Assert.Contains("Код: 822435", message.TextBody);
        Assert.DoesNotContain("Код MAX", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(">MAX<", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(">Код: 822435<", message.HtmlBody);
        Assert.DoesNotContain("Ваш код: 822435", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Lanaya", message.HtmlBody);
    }

    [Fact]
    public void BuildVerificationMessage_UsesPasswordResetCopyForPasswordResetPurpose()
    {
        var options = new EmailOptions
        {
            FromAddress = "code@lanaya.space",
            FromName = "Lanaya"
        };

        var message = SmtpEmailVerificationSender.BuildVerificationMessage(
            options,
            "user@example.com",
            "147729",
            "16:10",
            "password_reset");

        Assert.Equal("Восстановление пароля", message.Subject);
        Assert.Contains("Код восстановления: 147729", message.TextBody);
        Assert.Contains("Восстановление пароля", message.HtmlBody);
        Assert.Contains("задать новый пароль", message.HtmlBody);
        Assert.Contains(">Код восстановления: 147729<", message.HtmlBody);
    }
}
