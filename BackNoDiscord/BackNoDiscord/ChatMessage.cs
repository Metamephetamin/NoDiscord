namespace YourApp.Models
{
    public class ChatMessage
    {
        public int Id { get; set; }
        public string ChannelId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string PhotoUrl { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }
}
