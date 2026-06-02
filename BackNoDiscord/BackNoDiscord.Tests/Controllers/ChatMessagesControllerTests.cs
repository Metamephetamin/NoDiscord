using System.Security.Claims;
using System.Text;
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

    [Fact]
    public async Task GetMessages_ReturnsCurrentUsersReadState()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        context.Messages.Add(new Message
        {
            ChannelId = DirectMessageChannels.BuildChannelId(42, 99),
            Username = "Friend",
            Content = "__CHAT_PAYLOAD__:{\"message\":\"hello\",\"authorUserId\":\"99\"}",
            AuthorUserId = "99",
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        context.ChatChannelReadStates.Add(new ChatChannelReadStateRecord
        {
            UserId = "42",
            ChannelId = DirectMessageChannels.BuildChannelId(42, 99),
            LastReadMessageId = 321,
            LastReadAt = DateTimeOffset.Parse("2026-05-13T10:00:00Z"),
            UpdatedAt = DateTimeOffset.Parse("2026-05-13T10:00:00Z")
        });
        await context.SaveChangesAsync();
        var controller = BuildController(context, userId: "42");

        var result = await controller.GetMessages(
            DirectMessageChannels.BuildChannelId(42, 99),
            beforeMessageId: null,
            afterMessageId: null,
            limit: 20,
            CancellationToken.None);

        var actionResult = Assert.IsType<ActionResult<ChatMessagesPageDto>>(result);
        Assert.NotNull(actionResult.Value);
        var dto = actionResult.Value!;
        Assert.NotNull(dto.ReadState);
        Assert.Equal(321, dto.ReadState.LastReadMessageId);
        Assert.Equal("42", dto.ReadState.UserId);
    }

    [Fact]
    public async Task GetMessages_WithAfterMessageId_ReturnsOnlyNewerMessages()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        var channelId = DirectMessageChannels.BuildChannelId(42, 99);
        context.Messages.AddRange(
            new Message
            {
                ChannelId = channelId,
                Username = "Friend",
                Content = "__CHAT_PAYLOAD__:{\"message\":\"first\",\"authorUserId\":\"99\"}",
                AuthorUserId = "99",
                Timestamp = DateTime.UtcNow.AddMinutes(-2),
                IsDeleted = false
            },
            new Message
            {
                ChannelId = channelId,
                Username = "Friend",
                Content = "__CHAT_PAYLOAD__:{\"message\":\"second\",\"authorUserId\":\"99\"}",
                AuthorUserId = "99",
                Timestamp = DateTime.UtcNow.AddMinutes(-1),
                IsDeleted = false
            },
            new Message
            {
                ChannelId = channelId,
                Username = "Friend",
                Content = "__CHAT_PAYLOAD__:{\"message\":\"third\",\"authorUserId\":\"99\"}",
                AuthorUserId = "99",
                Timestamp = DateTime.UtcNow,
                IsDeleted = false
            });
        await context.SaveChangesAsync();
        var firstMessageId = await context.Messages
            .Where(message => message.ChannelId == channelId)
            .OrderBy(message => message.Id)
            .Select(message => message.Id)
            .FirstAsync();
        var controller = BuildController(context, userId: "42");

        var result = await controller.GetMessages(
            channelId,
            beforeMessageId: null,
            afterMessageId: firstMessageId,
            limit: 20,
            cancellationToken: CancellationToken.None);

        var actionResult = Assert.IsType<ActionResult<ChatMessagesPageDto>>(result);
        Assert.NotNull(actionResult.Value);
        var dto = actionResult.Value!;
        Assert.Equal(2, dto.Items.Count);
        Assert.All(dto.Items, message => Assert.True(message.Id > firstMessageId));
        Assert.False(dto.HasMore);
        Assert.Null(dto.NextCursor);
    }

    [Fact]
    public async Task SubmitPollVote_PersistsVoteCountsAndBroadcastsMessageUpdate()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        var channelId = DirectMessageChannels.BuildChannelId(42, 99);
        var pollMessage = CreatePollMessage(new
        {
            version = 2,
            question = "Куда идём?",
            options = new[]
            {
                new { id = "cafe", text = "Кафе" },
                new { id = "park", text = "Парк" }
            },
            settings = new
            {
                anonymous = true,
                showWhoVoted = false,
                allowMultipleAnswers = false,
                allowRevoting = true
            }
        });
        context.Messages.Add(new Message
        {
            ChannelId = channelId,
            Username = "Friend",
            Content = $"__CHAT_PAYLOAD__:{JsonSerializer.Serialize(new ChatMessagePayload { AuthorUserId = "99", Message = pollMessage })}",
            AuthorUserId = "99",
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        await context.SaveChangesAsync();
        var messageId = await context.Messages.Select(message => message.Id).SingleAsync();
        var hubContext = new RecordingHubContext();
        var controller = BuildController(context, userId: "42", hubContext: hubContext);

        var result = await controller.SubmitPollVote(
            channelId,
            messageId,
            new ChatPollVoteRequest { OptionIds = ["park"] },
            CancellationToken.None);

        var actionResult = Assert.IsType<ActionResult<MessageDto>>(result);
        var dto = Assert.IsType<MessageDto>(Assert.IsType<OkObjectResult>(actionResult.Result).Value);
        var updatedPoll = ParsePollMessage(dto.Message);
        Assert.Equal(1, updatedPoll.GetProperty("totalVoters").GetInt32());
        Assert.Equal(1, updatedPoll.GetProperty("votes").GetProperty("park").GetInt32());
        Assert.Equal(0, updatedPoll.GetProperty("votes").GetProperty("cafe").GetInt32());
        Assert.Single(context.MessagePollVotes);
        Assert.Contains(hubContext.Sends, item =>
            item.GroupName == channelId &&
            item.Method == "MessageUpdated" &&
            item.Arguments.Count == 1);
    }

    [Fact]
    public async Task SubmitPollVote_OpenPollIncludesVoterNamesByOption()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        context.Users.Add(new User
        {
            id = 42,
            first_name = "Тест",
            last_name = "Юзер",
            nickname = "lanaya",
            email = "user@example.com",
            password_hash = "hash"
        });
        var channelId = DirectMessageChannels.BuildChannelId(42, 99);
        var pollMessage = CreatePollMessage(new
        {
            version = 2,
            question = "Куда идём?",
            options = new[]
            {
                new { id = "cafe", text = "Кафе" },
                new { id = "park", text = "Парк" }
            },
            settings = new
            {
                anonymous = false,
                showWhoVoted = true,
                allowMultipleAnswers = false,
                allowRevoting = true
            }
        });
        context.Messages.Add(new Message
        {
            ChannelId = channelId,
            Username = "Friend",
            Content = $"__CHAT_PAYLOAD__:{JsonSerializer.Serialize(new ChatMessagePayload { AuthorUserId = "99", Message = pollMessage })}",
            AuthorUserId = "99",
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        await context.SaveChangesAsync();
        var messageId = await context.Messages.Select(message => message.Id).SingleAsync();
        var controller = BuildController(context, userId: "42");

        var result = await controller.SubmitPollVote(
            channelId,
            messageId,
            new ChatPollVoteRequest { OptionIds = ["park"] },
            CancellationToken.None);

        var actionResult = Assert.IsType<ActionResult<MessageDto>>(result);
        var dto = Assert.IsType<MessageDto>(Assert.IsType<OkObjectResult>(actionResult.Result).Value);
        var updatedPoll = ParsePollMessage(dto.Message);
        var voters = updatedPoll.GetProperty("voters").GetProperty("park");
        Assert.Single(voters.EnumerateArray());
        Assert.Equal("42", voters[0].GetProperty("userId").GetString());
        Assert.Equal("lanaya", voters[0].GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task AddPollOption_PersistsOptionWhenPollAllowsIt()
    {
        await using var context = CreateContext();
        context.Friendships.Add(new FriendshipRecord { UserLowId = 42, UserHighId = 99, CreatedAt = DateTimeOffset.UtcNow });
        var channelId = DirectMessageChannels.BuildChannelId(42, 99);
        var pollMessage = CreatePollMessage(new
        {
            version = 2,
            question = "Что заказать?",
            options = new[]
            {
                new { id = "pizza", text = "Пицца" },
                new { id = "sushi", text = "Суши" }
            },
            settings = new
            {
                anonymous = true,
                showWhoVoted = false,
                allowAddingOptions = true
            }
        });
        context.Messages.Add(new Message
        {
            ChannelId = channelId,
            Username = "Friend",
            Content = $"__CHAT_PAYLOAD__:{JsonSerializer.Serialize(new ChatMessagePayload { AuthorUserId = "99", Message = pollMessage })}",
            AuthorUserId = "99",
            Timestamp = DateTime.UtcNow,
            IsDeleted = false
        });
        await context.SaveChangesAsync();
        var messageId = await context.Messages.Select(message => message.Id).SingleAsync();
        var controller = BuildController(context, userId: "42");

        var result = await controller.AddPollOption(
            channelId,
            messageId,
            new ChatPollOptionRequest { Text = "Бургеры" },
            CancellationToken.None);

        var actionResult = Assert.IsType<ActionResult<MessageDto>>(result);
        var dto = Assert.IsType<MessageDto>(Assert.IsType<OkObjectResult>(actionResult.Result).Value);
        var updatedPoll = ParsePollMessage(dto.Message);
        Assert.Contains(updatedPoll.GetProperty("options").EnumerateArray(), option =>
            option.GetProperty("text").GetString() == "Бургеры");
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
            new ChatAttachmentHistoryService(context, CreateCrypto()),
            new ChatFileAccessService(context, new ServerStateService(context)),
            limiter ?? new ChatSpamBurstLimiter(),
            new MessageDeduplicationService(),
            hubContext ?? new RecordingHubContext(),
            new ChatReadStateService(context))
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

    private static string CreatePollMessage<T>(T poll)
    {
        var json = JsonSerializer.Serialize(poll, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return $"[[tend-poll]]{Convert.ToBase64String(Encoding.UTF8.GetBytes(json))}";
    }

    private static JsonElement ParsePollMessage(string? rawMessage)
    {
        const string prefix = "[[tend-poll]]";
        var normalized = rawMessage ?? string.Empty;
        Assert.StartsWith(prefix, normalized);
        var json = Encoding.UTF8.GetString(Convert.FromBase64String(normalized[prefix.Length..]));
        return JsonDocument.Parse(json).RootElement.Clone();
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
