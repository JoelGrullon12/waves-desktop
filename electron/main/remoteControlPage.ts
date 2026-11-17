// The page a phone opens to control playback. It is served by the app itself
// (remoteControl.ts), so it must be self-contained: no build step, no external
// files. It talks to the app over a WebSocket on the same host and port.
export const REMOTE_CONTROL_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111111">
<title>Waves remote</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; min-height: 100dvh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 20px; padding: 24px; background: #111; color: #f5f5f5;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  #art { width: min(72vw, 320px); aspect-ratio: 1; border-radius: 16px; background: #222; object-fit: cover; }
  #title { font-size: 1.25rem; font-weight: 600; text-align: center; margin: 0; }
  #artist { color: #a3a3a3; text-align: center; margin: 4px 0 0; }
  .row { display: flex; align-items: center; gap: 12px; width: min(100%, 420px); }
  .time { font-variant-numeric: tabular-nums; font-size: 0.8rem; color: #a3a3a3; width: 3em; }
  .time.end { text-align: right; }
  input[type=range] { flex: 1; accent-color: #f5f5f5; height: 28px; }
  .controls { justify-content: center; gap: 28px; }
  button { border: 0; background: none; color: inherit; font-size: 2rem; width: 64px; height: 64px;
    border-radius: 50%; cursor: pointer; }
  button:active { background: #2a2a2a; }
  #toggle { background: #f5f5f5; color: #111; }
  #toggle:active { background: #d4d4d4; }
  #status { font-size: 0.8rem; color: #a3a3a3; min-height: 1.2em; }
</style>
</head>
<body>
  <img id="art" alt="">
  <div>
    <p id="title">Nothing playing</p>
    <p id="artist"></p>
  </div>
  <div class="row">
    <span class="time" id="position">0:00</span>
    <input id="seek" type="range" min="0" max="1" step="1" value="0" aria-label="Seek">
    <span class="time end" id="duration">0:00</span>
  </div>
  <div class="row controls">
    <button id="previous" aria-label="Previous">&#9198;</button>
    <button id="toggle" aria-label="Play">&#9654;</button>
    <button id="next" aria-label="Next">&#9197;</button>
  </div>
  <div class="row">
    <span class="time" aria-hidden="true">&#128264;</span>
    <input id="volume" type="range" min="0" max="100" step="1" value="0" aria-label="Volume">
  </div>
  <p id="status">Connecting…</p>
<script>
(() => {
  const token = new URLSearchParams(location.search).get("token") || "";
  const element = (id) => document.getElementById(id);
  const format = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  };
  let socket = null;
  let state = null;
  let receivedAt = 0;
  // While a slider is being dragged the incoming state must not move it.
  let isSeeking = false;
  let isSettingVolume = false;

  const send = (type, value) => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, value }));
  };
  const currentPosition = () => {
    if (!state) return 0;
    const elapsed = state.isPlaying ? (Date.now() - receivedAt) / 1000 : 0;
    return Math.min(state.durationSeconds || Infinity, state.positionSeconds + elapsed);
  };
  const render = () => {
    if (!state) return;
    element("title").textContent = state.title || "Nothing playing";
    element("artist").textContent = state.artist || "";
    const art = element("art");
    if (state.artworkUrl && art.src !== state.artworkUrl) art.src = state.artworkUrl;
    if (!state.artworkUrl) art.removeAttribute("src");
    element("toggle").innerHTML = state.isPlaying ? "&#9208;" : "&#9654;";
    element("toggle").setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
    element("seek").max = String(Math.max(1, Math.floor(state.durationSeconds)));
    element("duration").textContent = format(state.durationSeconds);
    if (!isSettingVolume) element("volume").value = String(state.volume);
  };
  const tick = () => {
    if (state && !isSeeking) {
      element("seek").value = String(Math.floor(currentPosition()));
      element("position").textContent = format(currentPosition());
    }
  };
  const connect = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + location.host + "/ws?token=" + encodeURIComponent(token));
    socket.onopen = () => { element("status").textContent = "Connected"; };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type !== "state_sync") return;
      state = message.state;
      receivedAt = Date.now();
      render();
      tick();
    };
    socket.onclose = () => {
      element("status").textContent = "Disconnected. Retrying…";
      setTimeout(connect, 2000);
    };
  };

  element("toggle").onclick = () => send(state && state.isPlaying ? "pause" : "play");
  element("next").onclick = () => send("next");
  element("previous").onclick = () => send("previous");
  element("seek").oninput = () => { isSeeking = true; element("position").textContent = format(Number(element("seek").value)); };
  element("seek").onchange = () => { send("seek", Number(element("seek").value)); isSeeking = false; };
  element("volume").oninput = () => { isSettingVolume = true; send("set_volume", Number(element("volume").value)); };
  element("volume").onchange = () => { isSettingVolume = false; };
  setInterval(tick, 500);
  connect();
})();
</script>
</body>
</html>
`;
