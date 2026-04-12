using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Services;

public class SpeechPunctuationServiceTests
{
    [Theory]
    [InlineData("я думаю что всё готово", "Я думаю, что всё готово.")]
    [InlineData("кто сегодня придет", "Кто сегодня придет?")]
    [InlineData("привет алексей", "Привет, алексей!")]
    [InlineData("напиши мне запятая когда освободишься", "Напиши мне, когда освободишься.")]
    [InlineData("если будет время я тебе напишу", "Если будет время, я тебе напишу.")]
    [InlineData("я честно говоря не ожидал что ты придешь", "Я, честно говоря, не ожидал, что ты придешь.")]
    [InlineData("мы закончили работу и я сразу тебе написал", "Мы закончили работу, и я сразу тебе написал.")]
    [InlineData("к счастью всё обошлось и мы спокойно уехали", "К счастью, всё обошлось, и мы спокойно уехали.")]
    [InlineData("если честно я думаю что это хорошая идея", "Если честно, я думаю, что это хорошая идея.")]
    public void ApplyHeuristicPunctuation_AddsExpectedPunctuation(string input, string expected)
    {
        var result = SpeechPunctuationService.ApplyHeuristicPunctuation(input);

        Assert.Equal(expected, result);
    }
}
