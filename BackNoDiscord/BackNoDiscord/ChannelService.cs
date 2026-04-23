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
                var mergedParticipant = MergeWithExistingState(participant);
                _participantsByUserId[mergedParticipant.UserId] = CloneParticipant(mergedParticipant);

                if (_userIdToConnection.TryGetValue(mergedParticipant.UserId, out var previousConnectionId) &&
                    !string.Equals(previousConnectionId, connectionId, StringComparison.Ordinal))
                {
                    _connectionToUserId.TryRemove(previousConnectionId, out _);
                }

                _connectionToUserId[connectionId] = mergedParticipant.UserId;
                _userIdToConnection[mergedParticipant.UserId] = connectionId;

                if (_userChannels.TryGetValue(mergedParticipant.UserId, out var existingChannelName))
                {
                    if (!_channels.ContainsKey(existingChannelName))
                    {
                        _channels[existingChannelName] = new List<Participant>();
                    }

                    _channels[existingChannelName].RemoveAll(user => user.UserId == mergedParticipant.UserId);
                    _channels[existingChannelName].Add(CloneParticipant(mergedParticipant));
                }
            }
        }

        public void SetUserChannel(string channelName, Participant participant, string? connectionId = null)
        {
            lock (_syncRoot)
            {
                var mergedParticipant = MergeWithExistingState(participant);

                if (connectionId is not null)
                {
                    RegisterConnection(connectionId, mergedParticipant);
                }

                foreach (var channel in _channels.Values)
                {
                    channel.RemoveAll(user => user.UserId == mergedParticipant.UserId);
                }

                if (!_channels.ContainsKey(channelName))
                {
                    _channels[channelName] = new List<Participant>();
                }

                _channels[channelName].Add(CloneParticipant(mergedParticipant));
                _participantsByUserId[mergedParticipant.UserId] = CloneParticipant(mergedParticipant);
                _userChannels[mergedParticipant.UserId] = channelName;
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

        public Participant? SetVoiceState(
            string userId,
            bool? isMicMuted = null,
            bool? isDeafened = null,
            bool applyForceLocks = false,
            bool respectForceLocks = false)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            lock (_syncRoot)
            {
                if (!_participantsByUserId.TryGetValue(userId, out var participant))
                {
                    return null;
                }

                if (isMicMuted.HasValue)
                {
                    var canUnmute = !respectForceLocks || !participant.IsMicForced || isMicMuted.Value;
                    if (canUnmute)
                    {
                        participant.IsMicMuted = isMicMuted.Value;
                    }

                    if (applyForceLocks)
                    {
                        participant.IsMicForced = isMicMuted.Value;
                    }
                    else if (!participant.IsMicMuted)
                    {
                        participant.IsMicForced = false;
                    }
                }

                if (isDeafened.HasValue)
                {
                    var canUndeafen = !respectForceLocks || !participant.IsDeafenedForced || isDeafened.Value;
                    if (canUndeafen)
                    {
                        participant.IsDeafened = isDeafened.Value;
                    }

                    if (applyForceLocks)
                    {
                        participant.IsDeafenedForced = isDeafened.Value;
                    }
                    else if (!participant.IsDeafened)
                    {
                        participant.IsDeafenedForced = false;
                    }
                }

                _participantsByUserId[userId] = CloneParticipant(participant);

                foreach (var channel in _channels.Values)
                {
                    var existing = channel.FirstOrDefault(item => item.UserId == userId);
                    if (existing is null)
                    {
                        continue;
                    }

                    if (isMicMuted.HasValue)
                    {
                        existing.IsMicMuted = participant.IsMicMuted;
                        existing.IsMicForced = participant.IsMicForced;
                    }

                    if (isDeafened.HasValue)
                    {
                        existing.IsDeafened = participant.IsDeafened;
                        existing.IsDeafenedForced = participant.IsDeafenedForced;
                    }
                }

                return CloneParticipant(participant);
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

        public RemoveUserResult LeaveChannel(string userId)
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

                return new RemoveUserResult
                {
                    ChannelName = removedFromChannel,
                    Participant = _participantsByUserId.TryGetValue(userId, out var participant)
                        ? CloneParticipant(participant)
                        : null,
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
                IsScreenSharing = participant.IsScreenSharing,
                IsMicMuted = participant.IsMicMuted,
                IsDeafened = participant.IsDeafened,
                IsMicForced = participant.IsMicForced,
                IsDeafenedForced = participant.IsDeafenedForced,
            };
        }

        private Participant MergeWithExistingState(Participant participant)
        {
            if (!_participantsByUserId.TryGetValue(participant.UserId, out var existing))
            {
                return CloneParticipant(participant);
            }

            return new Participant
            {
                UserId = participant.UserId,
                Name = string.IsNullOrWhiteSpace(participant.Name) ? existing.Name : participant.Name,
                Avatar = string.IsNullOrWhiteSpace(participant.Avatar) ? existing.Avatar : participant.Avatar,
                IsScreenSharing = participant.IsScreenSharing || existing.IsScreenSharing,
                IsMicMuted = participant.IsMicMuted || existing.IsMicMuted,
                IsDeafened = participant.IsDeafened || existing.IsDeafened,
                IsMicForced = participant.IsMicForced || existing.IsMicForced,
                IsDeafenedForced = participant.IsDeafenedForced || existing.IsDeafenedForced,
            };
        }
    }

    public class RemoveUserResult
    {
        public string? ChannelName { get; set; }
        public Participant? Participant { get; set; }
    }
}
