# AUTH_KEY_DUPLICATED — Root Cause & Fix

## Official Telegram Documentation (core.telegram.org/api/errors)

> AUTH_KEY_DUPLICATED is only emitted if any of the non-media DC detects that an authorized session
> is sending requests in parallel from two separate TCP connections, from the same or different IP addresses.
> 
> If the client receives an AUTH_KEY_DUPLICATED error, the session was already **invalidated by the server**
> and the user must **generate a new auth key and login again**.

## Root Cause on Render

Render uses **zero-downtime deploys**: new instance starts BEFORE old instance stops.
Both instances use the same session string → two TCP connections with same auth_key → Telegram kills the session.

Render deploy sequence:
1. New instance starts, passes health check
2. Traffic switches to new instance  
3. Old instance receives SIGTERM
4. 30-second grace period
5. SIGKILL if still running

The problem: our worker connects to Telegram MTProto immediately on startup (after 30s delay).
The old instance is still connected → **two parallel connections with same auth_key** → 406 AUTH_KEY_DUPLICATED.

## Solution: Graceful Shutdown via SIGTERM

When SIGTERM is received:
1. Call `client.disconnect()` on ALL active GramJS clients
2. Wait for disconnect to complete (max 5 seconds)
3. Then let process exit

This ensures the old instance **cleanly disconnects** from Telegram before the new instance connects.

## Additional Safeguards

1. **Longer startup delay**: increase worker startup delay to 60s to give old instance time to die
2. **AUTH_KEY_DUPLICATED handler**: if we get this error, mark session as `invalidated` in DB, don't retry with same session
3. **Real status display**: show actual connection state (connected/disconnected/error) not just DB field
4. **Telethon approach**: just retry on AUTH_KEY_DUPLICATED without clearing auth_key (works for transient cases)

## GramJS Specific Notes

- `client.disconnect()` should cleanly close TCP connection
- `client.destroy()` calls disconnect internally but may not wait for TCP close
- Issue #733: even with disconnect, rapid connect/disconnect cycles can trigger AUTH_KEY_DUPLICATED
- Issue #616: confirmed fix is to use different sessions for different environments
