using BackNoDiscord.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace BackNoDiscord
{
    public class ChatHub : Hub
    {
        private const string MessagePayloadPrefix = "__CHAT_PAYLOAD__:";

        private readonly AppDbContext _context;
        private readonly CryptoService _crypto;

        public ChatHub(AppDbContext context, CryptoService crypto)
        {
            _context = context;
            _crypto = crypto;
        }

        public async Task SendScreenOffer(string targetConnectionId, string sdp)
        {
            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenOffer", Context.ConnectionId, sdp);
        }

        public async Task SendScreenAnswer(string targetConnectionId, string sdp)
        {
            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenAnswer", Context.ConnectionId, sdp);
        }

        public async Task SendIceCandidate(string targetConnectionId, string candidate)
        {
            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveIceCandidate", Context.ConnectionId, candidate);
        }

        public async Task SendMessage(
            string channelId,
            string username,
            string message,
            string photoUrl,
            string? attachmentUrl = null,
            string? attachmentName = null,
            long? attachmentSize = null,
            string? attachmentContentType = null)
        {
            if (string.IsNullOrWhiteSpace(channelId))
                throw new HubException("channelId is required");

            if (string.IsNullOrWhiteSpace(username))
                throw new HubException("username is required");

            var payload = new ChatMessagePayload
            {
                Message = message?.Trim() ?? string.Empty,
                AttachmentUrl = attachmentUrl?.Trim(),
                AttachmentName = attachmentName?.Trim(),
                AttachmentSize = attachmentSize,
                AttachmentContentType = attachmentContentType?.Trim()
            };

            if (string.IsNullOrWhiteSpace(payload.Message) && string.IsNullOrWhiteSpace(payload.AttachmentUrl))
                throw new HubException("message or attachment is required");

            var serializedPayload = SerializePayload(payload);
            var encrypted = _crypto.Encrypt(serializedPayload);

            var msg = new Message
            {
                ChannelId = channelId,
                Username = username,
                Content = serializedPayload,
                EncryptedContent = encrypted,
                PhotoUrl = photoUrl,
                Timestamp = DateTime.UtcNow,
                IsDeleted = false
            };

            _context.Messages.Add(msg);
            await _context.SaveChangesAsync();

            await Clients.Group(channelId).SendAsync("ReceiveMessage", ToMessageDto(msg, payload));
        }

        public async Task<List<MessageDto>> JoinChannel(string channelId)
        {
            if (string.IsNullOrWhiteSpace(channelId))
                throw new HubException("channelId is required");

            await Groups.AddToGroupAsync(Context.ConnectionId, channelId);

            var lastMessages = await _context.Messages
                .Where(m => m.ChannelId == channelId && !m.IsDeleted)
                .OrderBy(m => m.Timestamp)
                .Take(100)
                .ToListAsync();

            return lastMessages
                .Select(message =>
                {
                    var rawPayload = !string.IsNullOrWhiteSpace(message.EncryptedContent)
                        ? _crypto.Decrypt(message.EncryptedContent)
                        : (message.Content ?? string.Empty);

                    return ToMessageDto(message, DeserializePayload(rawPayload));
                })
                .ToList();
        }

        public async Task LeaveChannel(string channelId)
        {
            if (string.IsNullOrWhiteSpace(channelId))
                return;

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, channelId);
        }

        public async Task DeleteMessage(int messageId)
        {
            var msg = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId);
            if (msg == null)
                return;

            msg.IsDeleted = true;
            await _context.SaveChangesAsync();

            await Clients.Group(msg.ChannelId).SendAsync("MessageDeleted", messageId);
        }

        private static MessageDto ToMessageDto(Message message, ChatMessagePayload payload)
        {
            return new MessageDto
            {
                Id = message.Id,
                Username = message.Username,
                Message = payload.Message,
                PhotoUrl = message.PhotoUrl,
                AttachmentUrl = payload.AttachmentUrl,
                AttachmentName = payload.AttachmentName,
                AttachmentSize = payload.AttachmentSize,
                AttachmentContentType = payload.AttachmentContentType,
                Timestamp = message.Timestamp
            };
        }

        private static string SerializePayload(ChatMessagePayload payload)
        {
            return $"{MessagePayloadPrefix}{JsonSerializer.Serialize(payload)}";
        }

        private static ChatMessagePayload DeserializePayload(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return new ChatMessagePayload();
            }

            if (!raw.StartsWith(MessagePayloadPrefix, StringComparison.Ordinal))
            {
                return new ChatMessagePayload { Message = raw };
            }

            try
            {
                return JsonSerializer.Deserialize<ChatMessagePayload>(raw[MessagePayloadPrefix.Length..]) ?? new ChatMessagePayload();
            }
            catch
            {
                return new ChatMessagePayload { Message = raw };
            }
        }
    }

    public class MessageDto
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? PhotoUrl { get; set; }
        public string? AttachmentUrl { get; set; }
        public string? AttachmentName { get; set; }
        public long? AttachmentSize { get; set; }
        public string? AttachmentContentType { get; set; }
        public DateTime Timestamp { get; set; }
    }

    public class ChatMessagePayload
    {
        public string Message { get; set; } = string.Empty;
        public string? AttachmentUrl { get; set; }
        public string? AttachmentName { get; set; }
        public long? AttachmentSize { get; set; }
        public string? AttachmentContentType { get; set; }
    }
}
