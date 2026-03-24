namespace YourApp.Models
{
    public class ChatMessage
    {
        public int Id { get; set; }
        public string ChannelId { get; set; }
        public string Username { get; set; }
        public string Message { get; set; }
        public string PhotoUrl { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
