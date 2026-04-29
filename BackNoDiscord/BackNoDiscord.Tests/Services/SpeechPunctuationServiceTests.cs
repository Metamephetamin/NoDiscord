using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Services;

public class SpeechPunctuationServiceTests
{
    [Theory]
    [InlineData("я думаю что всё готово", "Я думаю что всё готово")]
    [InlineData("напиши мне запятая когда освободишься", "Напиши мне, когда освободишься")]
    [InlineData("привет точка как дела вопросительный знак", "Привет. Как дела?")]
    public void ApplyConservativeSpeechPunctuation_DoesNotGuessGrammarCommas(string input, string expected)
    {
        var result = SpeechPunctuationService.ApplyConservativeSpeechPunctuation(input);

        Assert.Equal(expected, result);
    }

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
    [InlineData("андрей ты где", "Андрей, ты где?")]
    [InlineData("макс посмотри сюда", "Макс, посмотри сюда.")]
    [InlineData("блин это вообще не работает", "Блин, это вообще не работает.")]
    [InlineData("господи это снова сломалось", "Господи, это снова сломалось.")]
    [InlineData("я не только пишу но и звоню", "Я не только пишу, но и звоню.")]
    [InlineData("как ты так и я уже устали", "Как ты, так и я уже устали.")]
    [InlineData("вообще-то я думаю что ты прав", "Вообще-то, я думаю, что ты прав.")]
    [InlineData("я блин не ожидал что так выйдет", "Я, блин, не ожидал, что так выйдет.")]
    [InlineData("я блядь не ожидал что так выйдет", "Я, блядь, не ожидал, что так выйдет.")]
    [InlineData("я не знаю похоже что нет", "Я не знаю, похоже, что нет.")]
    [InlineData("а что у нас с запятыми по итогу исправили мы их или нет", "А что у нас с запятыми, по итогу, исправили мы их или нет?")]
    public void ApplyHeuristicPunctuation_AddsExpectedPunctuation(string input, string expected)
    {
        var result = SpeechPunctuationService.ApplyHeuristicPunctuation(input);

        Assert.Equal(expected, result);
    }
}
