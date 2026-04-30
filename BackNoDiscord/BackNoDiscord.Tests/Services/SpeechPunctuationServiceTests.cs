using BackNoDiscord.Services;

namespace BackNoDiscord.Tests.Services;

public class SpeechPunctuationServiceTests
{
    [Theory]
    [InlineData("привет как дела я сегодня зайду если получится а ты пока напиши что там по серверу", true)]
    [InlineData("я думаю что если мы завтра спокойно проверим весь этот длинный текст то модель должна поставить запятые во всех нужных местах", true)]
    [InlineData("asedeeeeeefqegergaeaeaegaegegaasedeeeeeefqegergaeaeaegaegega", false)]
    [InlineData("аааааааааааааааааааааааааааааа", false)]
    [InlineData("слово aseedeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", false)]
    public void ShouldUseModelPunctuation_SkipsGarbageButAllowsNaturalLongText(string input, bool expected)
    {
        var result = SpeechPunctuationService.ShouldUseModelPunctuation(input);

        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("privet kak dela", "Privet, kak dela?", true)]
    [InlineData("privet sevodnya zaydu", "Privet, segodnya zaydu.", true)]
    [InlineData("privet ya zaydu", "Privet, ya zaglyanu.", false)]
    [InlineData("privet kak dela", "Privet, kak u tebya dela?", false)]
    [InlineData("ne znayu", "nu, znayu", false)]
    public void LooksLikeSafeTextCorrection_AllowsOnlyPunctuationAndSmallTypos(string input, string candidate, bool expected)
    {
        var result = SpeechPunctuationService.LooksLikeSafeTextCorrection(input, candidate);

        Assert.Equal(expected, result);
    }

    [Fact]
    public void ChooseModelPunctuationCandidate_UsesModelTextWhenProjectionCannotPreserveWords()
    {
        const string input = "nu tak vot a v chem problema byla togda v predyduschem v predlozhenii postavit tak zapyatye hochesh skazat chto predlozhenie dlya tebya slishkom bolshoe ili chto ya chto ne pisat bukvy";
        const string candidate = "Nu tak vot, a v chem problema byla togda v predyduschem predlozhenii: postavit tak zapyatye? Hochesh skazat, chto predlozhenie dlya tebya slishkom bolshoe ili chto ya chto-to ne pishu bukvy?";

        var result = SpeechPunctuationService.ChooseModelPunctuationCandidate(input, candidate);

        Assert.Equal(candidate, result);
    }

    [Fact]
    public void TryProjectModelPunctuation_KeepsOriginalWordsWhenModelChangedUnsafeWords()
    {
        const string input = "Так значит ты машипенькая и можешь расставлять запетые только в легких предложения х а что тогда насчет такого думаю ты должна справиться";
        const string candidate = "Так, значит, ты маленькая и можешь расставлять запятые только в лёгких предложения х, а что тогда насчёт такого? Думаю, ты должна справиться.";

        var result = SpeechPunctuationService.TryProjectModelPunctuation(input, candidate);

        Assert.Equal("Так, значит, ты машипенькая и можешь расставлять запетые только в легких предложения х, а что тогда насчет такого? Думаю, ты должна справиться.", result);
    }

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
