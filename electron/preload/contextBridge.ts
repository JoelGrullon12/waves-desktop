import { contextBridge, ipcRenderer } from "electron";

// Typed in src/types/global.d.ts. This is the only bridge to the main process:
// every renderer call goes through an ipcRenderer.invoke() over the preload.
contextBridge.exposeInMainWorld("api", {
  getCredentialsStatus: () => ipcRenderer.invoke("credentials:get-status"),
  saveCredentials: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke("credentials:save", clientId, clientSecret),

  login: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  isAuthenticated: () => ipcRenderer.invoke("auth:is-authenticated"),
  getSessionCredentials: () => ipcRenderer.invoke("auth:get-session-credentials"),
  getAccessToken: () => ipcRenderer.invoke("auth:get-access-token"),

  searchTracks: (query: string) => ipcRenderer.invoke("catalog:search-tracks", query),
  getAlbumTracksPage: (albumId: string, cursor: string | null) =>
    ipcRenderer.invoke("catalog:get-album-tracks-page", albumId, cursor),
  getPlaylistTracksPage: (playlistId: string, cursor: string | null) =>
    ipcRenderer.invoke("catalog:get-playlist-tracks-page", playlistId, cursor),
  getFavoriteTracksPage: (cursor: string | null) =>
    ipcRenderer.invoke("catalog:get-favorite-tracks-page", cursor),
  getLikedTrackIdsPage: (cursor: string | null) =>
    ipcRenderer.invoke("catalog:get-liked-track-ids-page", cursor),
  getTracksByIds: (trackIds: string[]) =>
    ipcRenderer.invoke("catalog:get-tracks-by-ids", trackIds),
  getUserPlaylists: () => ipcRenderer.invoke("catalog:get-user-playlists"),
  getRecentAlbums: () => ipcRenderer.invoke("catalog:get-recent-albums"),
  getMixes: (relationship: "myMixes" | "discoveryMixes") =>
    ipcRenderer.invoke("catalog:get-mixes", relationship),
  getMixTracksPage: (mixType: string, mixId: string, cursor: string | null) =>
    ipcRenderer.invoke("catalog:get-mix-tracks-page", mixType, mixId, cursor),
  getAlbumDetail: (albumId: string) =>
    ipcRenderer.invoke("catalog:get-album-detail", albumId),
  getPlaylistDetail: (playlistId: string) =>
    ipcRenderer.invoke("catalog:get-playlist-detail", playlistId),
  getMixDetail: (mixType: string, mixId: string) =>
    ipcRenderer.invoke("catalog:get-mix-detail", mixType, mixId),

  webLogin: () => ipcRenderer.invoke("web-auth:login"),
  webLogout: () => ipcRenderer.invoke("web-auth:logout"),
  isWebSessionConnected: () => ipcRenderer.invoke("web-auth:is-connected"),
  getWebSessionCredentials: () => ipcRenderer.invoke("web-auth:get-session-credentials"),
  getWebPlaybackStream: (trackId: string) =>
    ipcRenderer.invoke("web-auth:get-playback-stream", trackId),
});
