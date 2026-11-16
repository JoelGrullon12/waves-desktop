import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// Typed in src/types/global.d.ts. This is the only bridge to the main process:
// every renderer call goes through an ipcRenderer.invoke() over the preload.
contextBridge.exposeInMainWorld("api", {
  getCredentialsStatus: () => ipcRenderer.invoke("credentials:get-status"),
  saveCredentials: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke("credentials:save", clientId, clientSecret),

  login: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  isAuthenticated: () => ipcRenderer.invoke("auth:is-authenticated"),

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

  getReleasesFeed: () => ipcRenderer.invoke("catalog:get-releases-feed"),
  getArtistDetail: (artistId: string) => ipcRenderer.invoke("library:get-artist-detail", artistId),
  getArtistTracksPage: (artistId: string, cursor: string | null) =>
    ipcRenderer.invoke("library:get-artist-tracks-page", artistId, cursor),
  getArtistAlbumsPage: (artistId: string, cursor: string | null) =>
    ipcRenderer.invoke("library:get-artist-albums-page", artistId, cursor),
  getCollectionAlbumsPage: (cursor: string | null) =>
    ipcRenderer.invoke("library:get-collection-albums-page", cursor),
  getCollectionArtistsPage: (cursor: string | null) =>
    ipcRenderer.invoke("library:get-collection-artists-page", cursor),
  searchCollections: (query: string) =>
    ipcRenderer.invoke("library:search-collections", query),

  addTracksToLikes: (trackIds: string[]) =>
    ipcRenderer.invoke("catalog:add-tracks-to-likes", trackIds),
  removeTracksFromLikes: (trackIds: string[]) =>
    ipcRenderer.invoke("catalog:remove-tracks-from-likes", trackIds),
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) =>
    ipcRenderer.invoke("catalog:add-tracks-to-playlist", playlistId, trackIds),
  createPlaylist: (name: string) => ipcRenderer.invoke("catalog:create-playlist", name),
  deletePlaylist: (playlistId: string) => ipcRenderer.invoke("catalog:delete-playlist", playlistId),

  getPreferences: () => ipcRenderer.invoke("preferences:get-all"),
  setPreference: (key: string, value: string) => ipcRenderer.invoke("preferences:set", key, value),
  saveQueue: (trackIds: string[]) => ipcRenderer.invoke("queue:save", trackIds),
  loadQueue: () => ipcRenderer.invoke("queue:load"),

  incrementPlayCount: (trackId: string) =>
    ipcRenderer.invoke("stats:increment-play-count", trackId),
  getSmartShuffleOrder: (trackIds: string[]) =>
    ipcRenderer.invoke("stats:get-smart-shuffle-order", trackIds),
  getPlayCounts: (trackIds: string[]) => ipcRenderer.invoke("stats:get-play-counts", trackIds),
  getTopPlayed: (limit: number, withinDays: number | null) =>
    ipcRenderer.invoke("stats:get-top-played", limit, withinDays),

  getSyncStatus: () => ipcRenderer.invoke("sync:get-status"),
  runSyncNow: () => ipcRenderer.invoke("sync:run-now"),

  getRemoteControlInfo: () => ipcRenderer.invoke("remote:get-info"),
  setRemoteControlEnabled: (enabled: boolean) => ipcRenderer.invoke("remote:set-enabled", enabled),
  regenerateRemoteControlToken: () => ipcRenderer.invoke("remote:regenerate-token"),
  publishRemoteState: (state: unknown) => ipcRenderer.invoke("remote:publish-state", state),
  onRemoteCommand: (listener: (command: unknown) => void) => {
    const forward = (_event: IpcRendererEvent, command: unknown) => listener(command);
    ipcRenderer.on("remote:command", forward);
    return () => ipcRenderer.removeListener("remote:command", forward);
  },

  getCacheStatus: () => ipcRenderer.invoke("cache:get-status"),
  setCacheEnabled: (isEnabled: boolean) => ipcRenderer.invoke("cache:set-enabled", isEnabled),
  refreshCache: () => ipcRenderer.invoke("cache:refresh"),
  searchCache: (query: string) => ipcRenderer.invoke("cache:search", query),
  getCacheMemberships: (trackIds: string[]) => ipcRenderer.invoke("cache:get-memberships", trackIds),
  onCacheStatus: (listener: (status: unknown) => void) => {
    const forward = (_event: IpcRendererEvent, status: unknown) => listener(status);
    ipcRenderer.on("cache:status", forward);
    return () => ipcRenderer.removeListener("cache:status", forward);
  },

  // Only answered when the app runs with WAVES_DEBUG_API=1 (see tidalApiClient.ts).
  debugApiGet: (path: string) => ipcRenderer.invoke("debug:api-get", path),

  playerPlay: (trackId: string) => ipcRenderer.invoke("player:play", trackId),
  playerSetNext: (trackId: string | null) => ipcRenderer.invoke("player:set-next", trackId),
  playerPause: () => ipcRenderer.invoke("player:pause"),
  playerResume: () => ipcRenderer.invoke("player:resume"),
  playerSeek: (seconds: number) => ipcRenderer.invoke("player:seek", seconds),
  playerSetVolume: (level: number) => ipcRenderer.invoke("player:set-volume", level),
  playerStop: () => ipcRenderer.invoke("player:stop"),
  // Returns the function that stops listening.
  onPlayerState: (listener: (snapshot: unknown) => void) => {
    const forward = (_event: IpcRendererEvent, snapshot: unknown) => listener(snapshot);
    ipcRenderer.on("player:state", forward);
    return () => ipcRenderer.removeListener("player:state", forward);
  },

  onPlayerMediaKey: (listener: (command: unknown) => void) => {
    const forward = (_event: IpcRendererEvent, command: unknown) => listener(command);
    ipcRenderer.on("player:media-key", forward);
    return () => ipcRenderer.removeListener("player:media-key", forward);
  },

  webLogin: () => ipcRenderer.invoke("web-auth:login"),
  webLogout: () => ipcRenderer.invoke("web-auth:logout"),
  isWebSessionConnected: () => ipcRenderer.invoke("web-auth:is-connected"),
});
