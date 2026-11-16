// JavaScript that runs inside TIDAL's own web player (tidal.com), loaded in a
// hidden window by tidalWebPlayer.ts. Everything that depends on the internals
// of that page lives in this file: when TIDAL changes its web player, this is
// the only place to fix.
//
// The page is a React + Redux app. The script finds its Redux store through the
// React root and drives playback by dispatching the same actions the page's own
// buttons dispatch. Verified on 2026-11-15:
//   - FETCH_AND_PLAY_MEDIA_ITEM replaces the page's queue with one track and
//     plays it (about 400 ms).
//   - LOAD_SINGLE_MEDIA_ITEM + ADD_NEXT queue exactly one track after the
//     current one; the page then moves on to it without a gap.
//   - With autoplay on, the page appends a 100-track radio when its queue ends,
//     so autoplay is switched off: Waves owns the queue.
//
// It is a string (not a function serialized with toString()) so the bundler
// can never inject helpers that do not exist inside the page.

const WEB_PLAYER_ACTIONS = {
  fetchAndPlay: "content/FETCH_AND_PLAY_MEDIA_ITEM",
  loadMediaItem: "content/LOAD_SINGLE_MEDIA_ITEM",
  addNext: "playQueue/ADD_NEXT",
  clearUpcoming: "playQueue/CLEAR_UPCOMING",
  play: "playbackControls/PLAY",
  pause: "playbackControls/PAUSE",
  seek: "playbackControls/SEEK",
  setVolume: "playbackControls/SET_VOLUME",
  setAutoplay: "settings/SET_AUTOPLAY",
} as const;

const PLAY_TIMEOUT_MS = 20_000;
// A track that TIDAL no longer has never shows up in the page's catalog cache.
const MEDIA_ITEM_LOAD_TIMEOUT_MS = 6_000;
// How long the page gets to start a loaded track by itself before it is told to.
const STAYED_PAUSED_GRACE_MS = 600;
const FORCED_PLAY_RETRY_MS = 1_500;
const SEEK_SETTLE_TIMEOUT_MS = 1_500;
const SEEK_SETTLE_TOLERANCE_SECONDS = 2;

export const ENGINE_GLOBAL = "__wavesEngine";

const ENGINE_INSTALL_SOURCE = `
(() => {
  if (window.${ENGINE_GLOBAL}) return;
  const ACTIONS = ${JSON.stringify(WEB_PLAYER_ACTIONS)};
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  let store = null;
  let playGeneration = 0;
  let nextGeneration = 0;

  // The store is not exposed globally; it is handed to react-redux's Provider,
  // so it can be read from the props of a fiber near the React root.
  const findStore = () => {
    const isStore = (candidate) =>
      candidate && typeof candidate.dispatch === "function" && typeof candidate.getState === "function";
    for (const element of document.querySelectorAll("body > div")) {
      const fiberKey = Object.keys(element).find(
        (key) => key.startsWith("__reactContainer") || key.startsWith("__reactFiber"),
      );
      if (!fiberKey) continue;
      const pending = [element[fiberKey]];
      let visited = 0;
      while (pending.length > 0 && visited < 5000) {
        const fiber = pending.pop();
        visited += 1;
        if (!fiber) continue;
        const candidate =
          fiber.memoizedProps?.store ?? fiber.pendingProps?.store ?? fiber.memoizedProps?.value?.store;
        if (isStore(candidate)) return candidate;
        if (fiber.child) pending.push(fiber.child);
        if (fiber.sibling) pending.push(fiber.sibling);
      }
    }
    return null;
  };

  const getStore = () => {
    if (!store) {
      store = findStore();
      if (store && store.getState().settings?.autoPlay) {
        store.dispatch({ type: ACTIONS.setAutoplay, payload: false });
      }
    }
    return store;
  };
  const getState = () => getStore()?.getState() ?? null;
  const dispatch = (type, payload) => {
    const target = getStore();
    if (!target) throw new Error("TIDAL web player store not found.");
    target.dispatch(payload === undefined ? { type } : { type, payload });
  };

  const mediaItem = (trackId) => {
    const items = getState()?.content?.mediaItems;
    if (!items) return null;
    const entry = typeof items.get === "function" ? items.get(trackId) ?? items.get(Number(trackId)) : items[trackId];
    return entry?.item ?? null;
  };
  const upcomingTrackIds = (state) => {
    const queue = state.playQueue;
    if (!queue || !Array.isArray(queue.elements)) return [];
    return queue.elements.slice(queue.currentIndex + 1).map((element) => String(element.mediaItemId));
  };
  const latestNotice = (state) => {
    const notices = state.notifications?.notifications;
    if (!Array.isArray(notices) || notices.length === 0) return null;
    return notices[notices.length - 1];
  };

  const snapshot = () => {
    const state = getState();
    if (!state || !state.playbackControls) return { ready: false };
    const controls = state.playbackControls;
    const context = controls.playbackContext ?? {};
    const product = controls.mediaProduct ?? null;
    const trackId = product ? String(product.productId) : null;
    // The context describes the track that is actually sounding; while the
    // next one loads it still belongs to the previous track.
    const contextMatches = trackId !== null && String(context.actualProductId) === trackId;
    const durationSeconds = contextMatches ? Number(context.actualDuration) || 0 : 0;
    let positionSeconds = Number(controls.latestCurrentTime) || 0;
    if (controls.playbackState === "PLAYING" && controls.latestCurrentTimeSyncTimestamp) {
      positionSeconds += Math.max(0, Date.now() - controls.latestCurrentTimeSyncTimestamp) / 1000;
    }
    if (durationSeconds > 0) positionSeconds = Math.min(positionSeconds, durationSeconds);
    const notice = latestNotice(state);
    return {
      ready: true,
      loggedIn: state.session?.userId != null,
      trackId,
      playbackId: product?.referenceId ?? null,
      playbackState: controls.playbackState ?? "IDLE",
      positionSeconds,
      durationSeconds,
      volume: Number(controls.volume) || 0,
      upcomingTrackIds: upcomingTrackIds(state),
      audioQuality: contextMatches ? context.actualAudioQuality ?? null : null,
      bitDepth: contextMatches ? context.bitDepth ?? null : null,
      sampleRate: contextMatches ? context.sampleRate ?? null : null,
      codec: contextMatches ? context.codec ?? null : null,
      noticeId: notice?.id ?? null,
      noticeMessage: typeof notice?.message === "string" ? notice.message : null,
    };
  };

  const play = async (trackId) => {
    const generation = ++playGeneration;
    nextGeneration += 1;
    const initial = getState();
    if (!initial) return { ok: false, reason: "engine-unavailable" };
    if (initial.session?.userId == null) return { ok: false, reason: "not-logged-in" };
    const previousPlaybackId = initial.playbackControls.mediaProduct?.referenceId ?? null;
    const previousNoticeId = latestNotice(initial)?.id ?? null;
    const startedAt = Date.now();
    let playWasForced = false;
    let lastForcedPlayAt = 0;
    dispatch(ACTIONS.fetchAndPlay, {
      itemId: trackId,
      itemType: "track",
      sourceContext: { type: "UNKNOWN" },
    });
    while (Date.now() - startedAt < ${PLAY_TIMEOUT_MS}) {
      await wait(100);
      if (generation !== playGeneration) return { ok: false, reason: "superseded" };
      const state = getState();
      const controls = state.playbackControls;
      const product = controls.mediaProduct;
      const isRequestedTrack = product && String(product.productId) === trackId;
      const isNewPlayback = isRequestedTrack && product.referenceId !== previousPlaybackId;
      if (isRequestedTrack && (isNewPlayback || playWasForced) && controls.playbackState === "PLAYING") {
        return { ok: true, playbackId: product.referenceId ?? null };
      }
      // Right after it loads, the page restores the last track of its previous
      // run. Asked for that same track, it only loads it and stays paused, so
      // it is told to play explicitly.
      const elapsedSinceRequest = Date.now() - startedAt;
      if (
        isRequestedTrack &&
        controls.playbackState !== "PLAYING" &&
        controls.desiredPlaybackState !== "PLAYING" &&
        elapsedSinceRequest > ${STAYED_PAUSED_GRACE_MS} &&
        Date.now() - lastForcedPlayAt > ${FORCED_PLAY_RETRY_MS}
      ) {
        playWasForced = true;
        lastForcedPlayAt = Date.now();
        dispatch(ACTIONS.play);
      }
      const item = mediaItem(trackId);
      if (item && (item.allowStreaming === false || item.streamReady === false)) {
        return { ok: false, reason: "unavailable" };
      }
      if (!item) {
        // The page reports a missing track with a message instead of an error.
        const noticeAppeared = (latestNotice(state)?.id ?? null) !== previousNoticeId;
        const elapsed = Date.now() - startedAt;
        if ((noticeAppeared && elapsed > 1000) || elapsed > ${MEDIA_ITEM_LOAD_TIMEOUT_MS}) {
          return { ok: false, reason: "unavailable" };
        }
      }
    }
    return { ok: false, reason: "timeout" };
  };

  // Leaves exactly one track (or none) queued after the current one, so the
  // page moves on to it by itself when the current track ends.
  const setNext = async (trackId) => {
    const generation = ++nextGeneration;
    const state = getState();
    if (!state) return false;
    if (upcomingTrackIds(state).length > 0) dispatch(ACTIONS.clearUpcoming);
    if (trackId === null) return true;
    if (!mediaItem(trackId)) {
      dispatch(ACTIONS.loadMediaItem, { id: trackId, itemType: "track" });
      const startedAt = Date.now();
      while (!mediaItem(trackId)) {
        if (Date.now() - startedAt > ${MEDIA_ITEM_LOAD_TIMEOUT_MS}) return false;
        await wait(100);
        if (generation !== nextGeneration) return false;
      }
    }
    const item = mediaItem(trackId);
    if (item.allowStreaming === false || item.streamReady === false) return false;
    if (upcomingTrackIds(getState()).length > 0) dispatch(ACTIONS.clearUpcoming);
    dispatch(ACTIONS.addNext, { mediaItemIds: [trackId], context: { type: "UNKNOWN" } });
    const upcoming = upcomingTrackIds(getState());
    return upcoming.length === 1 && upcoming[0] === trackId;
  };

  const seek = async (seconds) => {
    dispatch(ACTIONS.seek, seconds);
    const startedAt = Date.now();
    while (Date.now() - startedAt < ${SEEK_SETTLE_TIMEOUT_MS}) {
      await wait(50);
      const position = Number(getState().playbackControls.latestCurrentTime) || 0;
      if (Math.abs(position - seconds) <= ${SEEK_SETTLE_TOLERANCE_SECONDS}) return true;
    }
    return false;
  };

  window.${ENGINE_GLOBAL} = {
    snapshot,
    play,
    setNext,
    seek,
    pause: () => { playGeneration += 1; dispatch(ACTIONS.pause); return true; },
    resume: () => { dispatch(ACTIONS.play); return true; },
    setVolume: (level) => { dispatch(ACTIONS.setVolume, { volume: level }); return true; },
    stop: () => {
      playGeneration += 1;
      nextGeneration += 1;
      dispatch(ACTIONS.pause);
      if (upcomingTrackIds(getState()).length > 0) dispatch(ACTIONS.clearUpcoming);
      return true;
    },
  };
})();
`;

export type EngineMethod =
  | "snapshot"
  | "play"
  | "setNext"
  | "seek"
  | "pause"
  | "resume"
  | "setVolume"
  | "stop";

// Builds the expression evaluated in the page. Arguments are embedded as JSON,
// never concatenated as text, so a value can not turn into code.
export function buildEngineCall(method: EngineMethod, ...methodArguments: unknown[]): string {
  const serializedArguments = methodArguments.map((argument) => JSON.stringify(argument)).join(", ");
  return `${ENGINE_INSTALL_SOURCE}\nwindow.${ENGINE_GLOBAL}.${method}(${serializedArguments});`;
}
