using System.Security.Claims;
using System.Text.Json;
using BackNoDiscord.Controllers;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace BackNoDiscord.Tests.Controllers;

public sealed class ChatMessagesControllerTests
{
    [Fact]
    public async Task SendOutboxMessage_PersistsTextMessageForAuthorizedDirectChat()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        await context.SaveChangesAsync();
        var controller = BuildController(context, userId: "42");

        var result = await controller.SendOutboxMessage(
            DirectMessageChannels.BuildChannelId(42, 99),
            new ChatOutboxMessageRequest
            {
                Message = "hello over http fallback",
                PhotoUrl = "/avatars/u42.png",
                ClientTempId = "client-temp-1"
            },
            CancellationToken.None);

        var actionResult = Assert.IsType<ActionResult<MessageDto>>(result);
        var dto = Assert.IsType<MessageDto>(Assert.IsType<OkObjectResult>(actionResult.Result).Value);
        Assert.Equal("hello over http fallback", dto.Message);
        Assert.Equal("42", dto.AuthorUserId);
        Assert.Equal("client-temp-1", dto.ClientTempId);
        Assert.Single(context.Messages);
    }

    [Fact]
    public async Task SendOutboxMessage_ReusesExistingMessageForRepeatedClientTempId()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        await context.SaveChangesAsync();
        var controller = BuildController(context, userId: "42");
        var channelId = DirectMessageChannels.BuildChannelId(42, 99);
        var request = new ChatOutboxMessageRequest
        {
            Message = "dedup me",
            ClientTempId = "client-temp-dedup"
        };

        var first = await controller.SendOutboxMessage(channelId, request, CancellationToken.None);
        var second = await controller.SendOutboxMessage(channelId, request, CancellationToken.None);

        var firstDto = Assert.IsType<MessageDto>(Assert.IsType<OkObjectResult>(Assert.IsType<ActionResult<MessageDto>>(first).Result).Value);
        var secondDto = Assert.IsType<MessageDto>(Assert.IsType<OkObjectResult>(Assert.IsType<ActionResult<MessageDto>>(second).Result).Value);
        Assert.Equal(firstDto.Id, secondDto.Id);
        Assert.Single(context.Messages);
    }

    private static ChatMessagesController BuildController(AppDbContext context, string userId)
    {
        var controller = new ChatMessagesController(
            context,
            CreateCrypto(),
            NullLogger<ChatMessagesController>.Instance,
            new ServerStateService(context),
            new MessageSearchService(context, CreateCrypto()),
            new ChatFileAccessService(context, new ServerStateService(context)))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [
                        new Claim(ClaimTypes.NameIdentifier, userId),
                        new Claim(ClaimTypes.Email, "user@example.com"),
                        new Claim("first_name", "Test"),
                        new Claim("last_name", "User")
                    ], "test"))
                }
            }
        };

        return controller;
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static CryptoService CreateCrypto()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Crypto:Key"] = "0123456789abcdef0123456789abcdef"
            })
            .Build();
        return new CryptoService(configuration);
    }
}
