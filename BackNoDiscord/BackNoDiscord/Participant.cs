namespace YourApp.Models
{
    public class Participant
    {
        public string UserId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Avatar { get; set; } = string.Empty;
        public bool IsScreenSharing { get; set; }
        public bool IsMicMuted { get; set; }
        public bool IsDeafened { get; set; }
        public bool IsMicForced { get; set; }
        public bool IsDeafenedForced { get; set; }
    }
}
