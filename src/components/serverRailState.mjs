export function isServerRailItemActive({ workspaceMode, serverId, activeServerId }) {
  const normalizedServerId = String(serverId || "").trim();
  const normalizedActiveServerId = String(activeServerId || "").trim();
  return workspaceMode === "servers" && normalizedServerId && normalizedServerId === normalizedActiveServerId;
}
