using System.Collections.Concurrent;
using YourApp.Models;

namespace BackNoDiscord
{
    public class ChannelService
    {
        private readonly ConcurrentDictionary<string, List<Participant>> _channels;
        private readonly ConcurrentDictionary<string, Participant> _participantsByUserId = new();
        private readonly ConcurrentDictionary<string, string> _connectionToUserId = new();
        private readonly ConcurrentDictionary<string, string> _userIdToConnection = new();
        private readonly ConcurrentDictionary<string, string> _userChannels = new();
        private readonly ConcurrentDictionary<string, bool> _screenSharingUsers = new();
        private readonly object _syncRoot = new();

        public ChannelService()
        {
            _channels = new ConcurrentDictionary<string, List<Participant>>();
            _channels.TryAdd("general_voice", new List<Participant>());
            _channels.TryAdd("gaming", new List<Participant>());
            _channels.TryAdd("music-chat", new List<Participant>());
            _channels.TryAdd("off-topic", new List<Participant>());
        }

        public Dictionary<string, List<Participant>> GetAllChannels()
        {
            lock (_syncRoot)
            {
                return _channels.ToDictionary(
                    kv => kv.Key,
                    kv => kv.Value.Select(CloneParticipant).ToList());
            }
        }

        public List<Participant> GetParticipantsInChannel(string channelName)
        {
            lock (_syncRoot)
            {
                if (!_channels.TryGetValue(channelName, out var participants))
                {
                    return new List<Participant>();
                }

                return participants.Select(CloneParticipant).ToList();
            }
        }

        public void RegisterConnection(string connectionId, Participant participant)
        {
            lock (_syncRoot)
            {
                _participantsByUserId[participant.UserId] = CloneParticipant(participant);

                if (_userIdToConnection.TryGetValue(participant.UserId, out var previousConnectionId) &&
                    !string.Equals(previousConnectionId, connectionId, StringComparison.Ordinal))
                {
                    _connectionToUserId.TryRemove(previousConnectionId, out _);
                }

                _connectionToUserId[connectionId] = participant.UserId;
                _userIdToConnection[participant.UserId] = connectionId;
            }
        }

        public void SetUserChannel(string channelName, Participant participant, string? connectionId = null)
        {
            lock (_syncRoot)
            {
                if (connectionId is not null)
                {
                    RegisterConnection(connectionId, participant);
                }

                foreach (var channel in _channels.Values)
                {
                    channel.RemoveAll(user => user.UserId == participant.UserId);
                }

                if (!_channels.ContainsKey(channelName))
                {
                    _channels[channelName] = new List<Participant>();
                }

                _channels[channelName].Add(CloneParticipant(participant));
                _participantsByUserId[participant.UserId] = CloneParticipant(participant);
                _userChannels[participant.UserId] = channelName;
            }
        }

        public string? GetChannelForUser(string userId)
        {
            return _userChannels.TryGetValue(userId, out var channelName)
                ? channelName
                : null;
        }

        public bool TryGetConnectionId(string userId, out string connectionId)
        {
            return _userIdToConnection.TryGetValue(userId, out connectionId!);
        }

        public bool TryGetUserId(string connectionId, out string userId)
        {
            return _connectionToUserId.TryGetValue(connectionId, out userId!);
        }

        public bool TryGetParticipantByConnectionId(string connectionId, out Participant participant)
        {
            participant = new Participant();

            return TryGetUserId(connectionId, out var userId)
                   && TryGetParticipant(userId, out participant);
        }

        public bool TryGetParticipant(string userId, out Participant participant)
        {
            participant = new Participant();

            if (!_participantsByUserId.TryGetValue(userId, out var existing))
            {
                return false;
            }

            participant = CloneParticipant(existing);
            return true;
        }

        public void SetScreenShareState(string userId, bool isSharing)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return;
            }

            lock (_syncRoot)
            {
                if (_participantsByUserId.TryGetValue(userId, out var participant))
                {
                    participant.IsScreenSharing = isSharing;
                    _participantsByUserId[userId] = CloneParticipant(participant);
                }

                foreach (var channel in _channels.Values)
                {
                    var existing = channel.FirstOrDefault(item => item.UserId == userId);
                    if (existing is not null)
                    {
                        existing.IsScreenSharing = isSharing;
                    }
                }
            }

            if (isSharing)
            {
                _screenSharingUsers[userId] = true;
            }
            else
            {
                _screenSharingUsers.TryRemove(userId, out _);
            }
        }

        public List<string> GetScreenSharingUserIds()
        {
            return _screenSharingUsers.Keys.ToList();
        }

        public RemoveUserResult RemoveUser(string userId)
        {
            lock (_syncRoot)
            {
                var removedFromChannel = _userChannels.TryRemove(userId, out var channelName)
                    ? channelName
                    : null;

                foreach (var channel in _channels.Values)
                {
                    channel.RemoveAll(user => user.UserId == userId);
                }

                _screenSharingUsers.TryRemove(userId, out _);
                _participantsByUserId.TryRemove(userId, out var participant);

                if (_userIdToConnection.TryRemove(userId, out var connectionId))
                {
                    _connectionToUserId.TryRemove(connectionId, out _);
                }

                return new RemoveUserResult
                {
                    ChannelName = removedFromChannel,
                    Participant = participant is null ? null : CloneParticipant(participant),
                };
            }
        }

        public RemoveUserResult RemoveConnection(string connectionId)
        {
            if (!TryGetUserId(connectionId, out var userId))
            {
                return new RemoveUserResult();
            }

            return RemoveUser(userId);
        }

        private static Participant CloneParticipant(Participant participant)
        {
            return new Participant
            {
                UserId = participant.UserId,
                Name = participant.Name,
                Avatar = participant.Avatar,
                IsScreenSharing = participant.IsScreenSharing
            };
        }
    }

    public class RemoveUserResult
    {
        public string? ChannelName { get; set; }
        public Participant? Participant { get; set; }
    }
}
