using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Services;

public class SpeechPunctuationServiceTests
{
    [Theory]
    [InlineData("я думаю что всё готово", "Я думаю, что всё готово.")]
    [InlineData("кто сегодня придет", "Кто сегодня придет?")]
    [InlineData("привет алексей", "Привет, алексей!")]
    [InlineData("напиши мне запятая когда освободишься", "Напиши мне, когда освободишься.")]
    public void ApplyHeuristicPunctuation_AddsExpectedPunctuation(string input, string expected)
    {
        var result = SpeechPunctuationService.ApplyHeuristicPunctuation(input);

        Assert.Equal(expected, result);
    }
}
