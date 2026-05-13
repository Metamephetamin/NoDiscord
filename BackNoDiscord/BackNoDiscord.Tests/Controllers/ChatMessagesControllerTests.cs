using System.Security.Claims;
using System.Text.Json;
using BackNoDiscord.Controllers;
using BackNoDiscord.Security;
using BackNoDiscord.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
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
        var hubContext = new RecordingHubContext();
        var controller = BuildController(context, userId: "42", hubContext: hubContext);

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
        Assert.Contains(hubContext.Sends, item =>
            item.GroupName == DirectMessageChannels.BuildChannelId(42, 99) &&
            item.Method == "ReceiveMessage" &&
            item.Arguments.Count == 1);
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

    [Fact]
    public async Task SendOutboxMessage_UsesSharedBurstLimiter()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        await context.SaveChangesAsync();
        var limiter = new ChatSpamBurstLimiter();
        var controller = BuildController(context, userId: "42", limiter);
        var channelId = DirectMessageChannels.BuildChannelId(42, 99);

        for (var index = 0; index < 12; index++)
        {
            await controller.SendOutboxMessage(
                channelId,
                new ChatOutboxMessageRequest { Message = $"message {index}", ClientTempId = $"temp-{index}" },
                CancellationToken.None);
        }

        var blocked = await controller.SendOutboxMessage(
            channelId,
            new ChatOutboxMessageRequest { Message = "blocked", ClientTempId = "temp-blocked" },
            CancellationToken.None);

        var actionResult = Assert.IsType<ActionResult<MessageDto>>(blocked);
        var statusResult = Assert.IsType<ObjectResult>(actionResult.Result);
        Assert.Equal(StatusCodes.Status429TooManyRequests, statusResult.StatusCode);
        Assert.Equal(12, context.Messages.Count());
    }

    private static ChatMessagesController BuildController(
        AppDbContext context,
        string userId,
        ChatSpamBurstLimiter? limiter = null,
        IHubContext<ChatHub>? hubContext = null)
    {
        var controller = new ChatMessagesController(
            context,
            CreateCrypto(),
            NullLogger<ChatMessagesController>.Instance,
            new ServerStateService(context),
            new MessageSearchService(context, CreateCrypto()),
            new ChatFileAccessService(context, new ServerStateService(context)),
            limiter ?? new ChatSpamBurstLimiter(),
            hubContext ?? new RecordingHubContext())
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

    private sealed record RecordedHubSend(string GroupName, string Method, IReadOnlyList<object?> Arguments);

    private sealed class RecordingHubContext : IHubContext<ChatHub>
    {
        public RecordingHubContext()
        {
            Clients = new RecordingHubClients(Sends);
            Groups = new RecordingGroupManager();
        }

        public List<RecordedHubSend> Sends { get; } = [];

        public IHubClients Clients { get; }

        public IGroupManager Groups { get; }
    }

    private sealed class RecordingHubClients(List<RecordedHubSend> sends) : IHubClients
    {
        private IClientProxy EmptyProxy => new RecordingClientProxy(string.Empty, sends);

        public IClientProxy All => EmptyProxy;

        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => EmptyProxy;

        public IClientProxy Client(string connectionId) => EmptyProxy;

        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => EmptyProxy;

        public IClientProxy Group(string groupName) => new RecordingClientProxy(groupName, sends);

        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => new RecordingClientProxy(groupName, sends);

        public IClientProxy Groups(IReadOnlyList<string> groupNames) => EmptyProxy;

        public IClientProxy User(string userId) => EmptyProxy;

        public IClientProxy Users(IReadOnlyList<string> userIds) => EmptyProxy;
    }

    private sealed class RecordingClientProxy(string groupName, List<RecordedHubSend> sends) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            sends.Add(new RecordedHubSend(groupName, method, args));
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
