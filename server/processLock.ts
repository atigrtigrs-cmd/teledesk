/**
 * processLock.ts
 *
 * Prevents two Node.js processes from holding MTProto sessions simultaneously.
 *
 * Problem: Render zero-downtime deploys keep the old process alive for ~60-120s
 * while the new process starts. Both processes try to use the same MTProto session
 * strings → AUTH_KEY_DUPLICATED.
 *
 * Solution: Write our PID to /tmp/teledesk-tg.lock on startup.
 * Before connecting MTProto, check if another PID is in the lock file and is alive.
 * If yes — wait up to 3 minutes for it to die before proceeding.
 */

import fs from "fs";
import path from "path";

const LOCK_FILE = "/tmp/teledesk-tg.lock";
const MY_PID = process.pid;

/**
 * Write our PID to the lock file.
 * Call this once at server startup (before restoreAllSessions).
 */
export function acquireProcessLock(): void {
  try {
    fs.writeFileSync(LOCK_FILE, String(MY_PID), "utf8");
    console.log(`[ProcessLock] Acquired lock (PID=${MY_PID})`);
  } catch (err) {
    console.error("[ProcessLock] Failed to write lock file:", err);
  }
}

/**
 * Check if another process currently holds the lock.
 * Returns the other PID if it's alive, or null if we're the only process.
 */
function getOtherAlivePid(): number | null {
  try {
    if (!fs.existsSync(LOCK_FILE)) return null;
    const content = fs.readFileSync(LOCK_FILE, "utf8").trim();
    const pid = parseInt(content, 10);
    if (isNaN(pid) || pid === MY_PID) return null;

    // Check if the process is alive by sending signal 0
    try {
      process.kill(pid, 0);
      return pid; // process is alive
    } catch {
      return null; // process is dead
    }
  } catch {
    return null;
  }
}

/**
 * Wait until no other process holds the lock, or until timeout.
 * Call this before starting MTProto connections.
 *
 * @param timeoutMs Max time to wait (default: 3 minutes)
 * @returns true if we're clear to proceed, false if timed out
 */
export async function waitForProcessLock(timeoutMs = 3 * 60 * 1000): Promise<boolean> {
  const otherPid = getOtherAlivePid();
  if (!otherPid) {
    console.log(`[ProcessLock] No other process holding lock — proceeding (PID=${MY_PID})`);
    return true;
  }

  console.log(`[ProcessLock] Another process (PID=${otherPid}) is holding the lock. Waiting up to ${timeoutMs / 1000}s for it to die...`);

  const deadline = Date.now() + timeoutMs;
  let waited = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000)); // check every 5s
    waited += 5;
    const stillAlive = getOtherAlivePid();
    if (!stillAlive) {
      console.log(`[ProcessLock] Other process died after ~${waited}s — acquiring lock and proceeding`);
      // Re-write our PID to the lock file
      acquireProcessLock();
      return true;
    }
    console.log(`[ProcessLock] Still waiting for PID=${otherPid} to die... (${waited}s elapsed)`);
  }

  console.warn(`[ProcessLock] Timed out waiting for PID=${otherPid} — proceeding anyway (risk of AUTH_KEY_DUPLICATED)`);
  acquireProcessLock();
  return false;
}

/**
 * Release the lock on process exit.
 */
export function releaseProcessLock(): void {
  try {
    const content = fs.existsSync(LOCK_FILE) ? fs.readFileSync(LOCK_FILE, "utf8").trim() : "";
    if (content === String(MY_PID)) {
      fs.unlinkSync(LOCK_FILE);
      console.log(`[ProcessLock] Released lock (PID=${MY_PID})`);
    }
  } catch {
    // ignore
  }
}

// Auto-release on process exit
process.on("exit", releaseProcessLock);
process.on("SIGTERM", () => { releaseProcessLock(); process.exit(0); });
process.on("SIGINT", () => { releaseProcessLock(); process.exit(0); });
