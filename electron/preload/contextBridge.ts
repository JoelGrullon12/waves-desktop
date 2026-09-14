import { contextBridge, ipcRenderer } from "electron";

// Typed in src/types/global.d.ts. This is the only bridge to the main process:
// every renderer call goes through an ipcRenderer.invoke() over the preload.
contextBridge.exposeInMainWorld("api", {
  login: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  isAuthenticated: () => ipcRenderer.invoke("auth:is-authenticated"),
  getSessionCredentials: () => ipcRenderer.invoke("auth:get-session-credentials"),
  getAccessToken: () => ipcRenderer.invoke("auth:get-access-token"),

  searchTracks: (query: string) => ipcRenderer.invoke("catalog:search-tracks", query),
  getAlbumTracks: (albumId: string) =>
    ipcRenderer.invoke("catalog:get-album-tracks", albumId),
  getPlaylistTracks: (playlistId: string) =>
    ipcRenderer.invoke("catalog:get-playlist-tracks", playlistId),
});
