import MenuMobileShell from "../../components/MenuMobileShell";
import useMenuMobileNavigation from "../../hooks/useMenuMobileNavigation";
import {
  getChannelDisplayName,
  getDisplayName,
} from "../../utils/menuMainModel";

export default function MenuMainMobileLayout({
  mobileSection,
  setMobileSection,
  workspaceMode,
  currentDirectFriend,
  currentConversationTarget,
  setActiveDirectFriendId,
  setActiveConversationId,
  setFriendsPageSection,
  isLocalSharePreviewVisible,
  setIsLocalSharePreviewVisible,
  currentVoiceChannel,
  setMobileServersPane,
  selectedStreamUserId,
  setSelectedStreamUserId,
  mobileServersPane,
  user,
  totalDirectUnreadCount,
  totalServerUnreadCount,
  directUnreadCounts,
  currentDirectChannelId,
  friendsPageSection,
  friends,
  incomingFriendRequestCount,
  totalFriendsAttentionCount,
  hasLocalSharePreview,
  localSharePreview,
  activeServerUnreadCount,
  activeServer,
  selectedStreamParticipant,
  currentVoiceChannelName,
  currentVoiceParticipants,
  currentTextChannel,
  openSettingsPanel,
  openServersWorkspace,
  openFriendsWorkspace,
  renderMobileProfileScreen,
  renderMobileDirectChat,
  renderFriendsMain,
  renderMobileServerStrip,
  renderMobileVoiceRoom,
  renderServerMain,
  renderServersSidebar,
}) {
  const { handleMobileBack, mobileHeader } = useMenuMobileNavigation({
    mobileSection,
    setMobileSection,
    workspaceMode,
    currentDirectFriend,
    currentConversationTarget,
    setActiveDirectFriendId,
    setActiveConversationId,
    setFriendsPageSection,
    isLocalSharePreviewVisible,
    setIsLocalSharePreviewVisible,
    currentVoiceChannel,
    setMobileServersPane,
    selectedStreamUserId,
    setSelectedStreamUserId,
    mobileServersPane,
    getDisplayName,
    user,
    totalDirectUnreadCount,
    totalServerUnreadCount,
    directUnreadCounts,
    currentDirectChannelId,
    friendsPageSection,
    friends,
    incomingFriendRequestCount,
    totalFriendsAttentionCount,
    hasLocalSharePreview,
    localSharePreview,
    activeServerUnreadCount,
    activeServer,
    selectedStreamParticipant,
    currentVoiceChannelName,
    currentVoiceParticipants,
    currentTextChannel,
    getChannelDisplayName,
    openSettingsPanel,
  });

  return (
    <MenuMobileShell
      header={mobileHeader}
      mobileSection={mobileSection}
      mobileServersPane={mobileServersPane}
      currentDirectFriend={currentDirectFriend}
      currentConversationTarget={currentConversationTarget}
      totalServerUnreadCount={totalServerUnreadCount}
      totalFriendsAttentionCount={totalFriendsAttentionCount}
      onBack={handleMobileBack}
      onOpenServersWorkspace={openServersWorkspace}
      onOpenFriendsWorkspace={openFriendsWorkspace}
      onOpenProfile={() => setMobileSection("profile")}
      renderMobileProfileScreen={renderMobileProfileScreen}
      renderMobileDirectChat={renderMobileDirectChat}
      renderFriendsMain={renderFriendsMain}
      renderMobileServerStrip={renderMobileServerStrip}
      renderMobileVoiceRoom={renderMobileVoiceRoom}
      renderServerMain={renderServerMain}
      renderServersSidebar={renderServersSidebar}
    />
  );
}
