namespace YourApp.Models
{
    public class Participant
    {
        public string UserId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Avatar { get; set; } = string.Empty;
        public bool IsScreenSharing { get; set; }
    }
}
