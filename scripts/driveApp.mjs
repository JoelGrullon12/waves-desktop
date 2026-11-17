// Development helper: drives a running Waves instance over the Chromium
// DevTools Protocol so a change can be checked in the real app without a
// person clicking through it.
//
// Start the app with a debugging port first:
//   node scripts/runElectron.mjs dev --remote-debugging-port=9222
//
// Then:
//   node scripts/driveApp.mjs targets
//   node scripts/driveApp.mjs eval <url-substring> '<javascript expression>'
//   node scripts/driveApp.mjs screenshot <url-substring> <file.png>
//
// The expression may return a promise; the resolved value is printed as JSON.
import { writeFileSync } from "node:fs";

const DEBUG_PORT = Number(process.env.WAVES_DEBUG_PORT ?? 9222);
const COMMAND_TIMEOUT_MS = Number(process.env.WAVES_DRIVE_TIMEOUT_MS ?? 60_000);

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  return await response.json();
}

async function findTarget(urlFragment) {
  const targets = await listTargets();
  const target = targets.find(
    (candidate) => candidate.type === "page" && candidate.url.includes(urlFragment),
  );
  if (!target) {
    const known = targets.map((candidate) => `${candidate.type} ${candidate.url}`).join("\n  ");
    throw new Error(`No page matches "${urlFragment}". Open targets:\n  ${known}`);
  }
  return target;
}

function sendCommand(webSocketUrl, method, params) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for ${method}.`));
    }, COMMAND_TIMEOUT_MS);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`Could not reach the debugging port ${DEBUG_PORT}.`));
    });
  });
}

async function evaluate(urlFragment, expression) {
  const target = await findTarget(urlFragment);
  const result = await sendCommand(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    // A user gesture changes what a page is allowed to do (e.g. start audio);
    // WAVES_DRIVE_NO_GESTURE=1 observes a page without granting one.
    userGesture: process.env.WAVES_DRIVE_NO_GESTURE !== "1",
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(details.exception?.description ?? details.text);
  }
  return result.result.value;
}

const [command, ...rest] = process.argv.slice(2);

try {
  if (command === "targets") {
    for (const target of await listTargets()) {
      console.log(`${target.type}\t${target.title}\t${target.url}`);
    }
  } else if (command === "eval" && rest.length === 2) {
    console.log(JSON.stringify(await evaluate(rest[0], rest[1]), null, 2));
  } else if (command === "screenshot" && rest.length === 2) {
    const target = await findTarget(rest[0]);
    const result = await sendCommand(target.webSocketDebuggerUrl, "Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(rest[1], Buffer.from(result.data, "base64"));
    console.log(`Saved ${rest[1]}`);
  } else {
    console.error("Usage: driveApp.mjs targets | eval <url> <js> | screenshot <url> <file>");
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
