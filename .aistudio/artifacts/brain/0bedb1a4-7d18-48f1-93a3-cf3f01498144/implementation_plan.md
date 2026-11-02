# Fix Plan: Resolving Gemini Audio Processing & WebSocket Errors

## Why This Error Is Happening
1. **Unary TTS Free-Tier Quota Cascade (`429 RESOURCE_EXHAUSTED`)**:
   - Gemini's Free Tier allows only **10 requests/day** on `gemini-3.8-flash-tts`. Once that daily limit is reached, the server was still trying `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts` on *every single dialogue line* before falling back to `gemini-3.8-live`.
2. **WebSocket Connection Drops on Multi-Line Scenes (`gemini-3.8-live`)**:
   - `gemini-3.8-live` communicates over **WebSockets** (`ai.live.connect`). Previously, a scene with 6–15 dialogue lines opened 6–15 separate WebSocket connections in a single request. Opening many concurrent/rapid WebSockets triggers WebSocket rate limits, connection resets, or request timeouts.
3. **Vite HMR WebSocket Error in the Browser**:
   - `server.ts` mounted Vite middleware without `hmr: false`, causing the browser to attempt a WebSocket connection that fails inside the preview environment.

---

## Architectural Fixes We Will Implement

### 1. Instant Quota Circuit-Breaker for Unary TTS
- Track `429 RESOURCE_EXHAUSTED` state in server memory (`ttsModelCooldownUntil`).
- As soon as a unary TTS model reports quota exhaustion, bypass it immediately on subsequent segments instead of repeating failed HTTP calls on every line.
- Also include `gemini-2.5-flash-preview-tts` in the unary TTS pool before falling back to `gemini-3.8-live`.

### 2. Reused Single-Connection WebSocket Pool (`gemini-3.8-live`)
- Instead of opening a new `ai.live.connect()` WebSocket for every line of dialogue, create **one WebSocket session per unique voice** (at most 1 session for Single mode, 2 for Dual mode) and send turns sequentially over that open connection with proper turn-completion handling.
- Add clean WebSocket lifecycle management (`onclose`, `onerror`, and automatic reconnect if a socket closes mid-scene).

### 3. Chunked Client-Driven Audio Synthesis with Live Progress
- Break multi-line or long 2–10 minute scripts into small, reliable synthesis batches from the studio UI with a live progress status (e.g., *"Synthesizing voice segment 2 of 5..."*) so individual requests stay fast (~4–8 seconds each) and never hit gateway timeouts.
- Stitch all synthesized PCM segments into the final master **MP3** and **WAV** for pre-download playback.

### 4. Disable Vite HMR WebSocket (`hmr: false`)
- Update `createViteServer` in `server.ts` with `server: { middlewareMode: true, hmr: false }` and `vite.config.ts` so no stray WebSocket errors appear in the browser.
