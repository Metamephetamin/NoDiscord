using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using BackNoDiscord.Services;

namespace BackNoDiscord
{
    public class ChatHub : Hub
    {
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

        public async Task SendMessage(string channelId, string username, string message, string photoUrl)
        {
            if (string.IsNullOrWhiteSpace(channelId))
                throw new HubException("channelId is required");

            if (string.IsNullOrWhiteSpace(username))
                throw new HubException("username is required");

            if (string.IsNullOrWhiteSpace(message))
                throw new HubException("message is required");

            var encrypted = _crypto.Encrypt(message);

            var msg = new Message
            {
                ChannelId = channelId,
                Username = username,
                Content = message,
                EncryptedContent = encrypted,
                PhotoUrl = photoUrl,
                Timestamp = DateTime.UtcNow,
                IsDeleted = false
            };

            _context.Messages.Add(msg);
            await _context.SaveChangesAsync();

            await Clients.Group(channelId).SendAsync("ReceiveMessage", new
            {
                Id = msg.Id,
                Username = msg.Username,
                Message = message,
                PhotoUrl = msg.PhotoUrl,
                Timestamp = msg.Timestamp
            });
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

            return lastMessages.Select(m => new MessageDto
            {
                Id = m.Id,
                Username = m.Username,
                Message = !string.IsNullOrWhiteSpace(m.EncryptedContent)
                    ? _crypto.Decrypt(m.EncryptedContent)
                    : (m.Content ?? string.Empty),
                PhotoUrl = m.PhotoUrl,
                Timestamp = m.Timestamp
            }).ToList();
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
    }

    public class MessageDto
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? PhotoUrl { get; set; }
        public DateTime Timestamp { get; set; }
    }
}