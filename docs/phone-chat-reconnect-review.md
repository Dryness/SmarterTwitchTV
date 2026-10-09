# Phone chat: latest repair verification

Reviewed October 9, 2026 against the latest working tree and pasted completion report.

## Resolution (October 9, 2026)

Both findings below are now fixed. The remainder of this document records the
pre-fix review for reference.

- The bounded feed store and local echo tracking are initialized for a fresh
  chat session and preserved across socket replacement. Explicit disconnect
  clears them with the feed.
- Join and timeout-expiry UI restoration uses the current moderation state;
  offline/background socket closure also disables the composer immediately.
- Lifecycle regressions invoke offline/online and pagehide/pageshow and join
  replacement sockets. They cover ordinary IDs, deleted IDs, out-of-order
  tombstones, local echo matching, timeout/ban explanations, and expiry offline.
- The documented HypeLol fixture and setup description are corrected.
- Source harness and generated-bundle app flows both pass **259/259**. Lint,
  full build and whitespace checks pass. The independent review reproduction
  now retains the timeout explanation and suppresses the deleted replay after
  reconnect.

Release files were regenerated through the maker. These fixes remain part of
the unreleased WebTag 742 change (HEAD is 741). Live Twitch/device verification
still requires the owner setup listed in `phone-chat-setup.md`.

## Verdict

The five fixes from the previous review are effective for the transitions their tests exercise. Twitch URLs now respect format/theme/scale metadata, timeout timers are replaced and guarded, self-targeted cleanup includes local echoes, deletion tombstones work within one store, and slow-mode baselines update. Submitted wording, ownership classification and badge generation checks are also present.

Two gaps remain on the actual network/browser reconnect path. The moderation regression test repeats JOIN on the existing socket instead of replacing the connection. It therefore misses the state reset and banner behavior described below.

## Checks

- Harness: **223 passed, 0 failed**.
- Lint-only maker: exit 0.
- Full maker: exit 0; generated assets regenerated through the build.
- `git diff --check`: clean.
- Independent app-level reproduction: loads main.js and its dependencies using the harness infrastructure, registers actual online/offline listeners, then drives the handshake on a second WebSocket. Dummy credentials and mock network only.
- With the documented HypeLol entry (`id: 304420818`, `format: ['static']`, decimal scale strings), the adapter now emits the correct decimal CDN URLs and valid density descriptors. HEAD `/static/dark/2.0` returns **200**, while `/static/dark/2` returns **404**.

Implementation source was not edited by this review. Live Twitch login, sending, provider CORS and physical/mobile checks remain pending owner setup.

## Scores

| Dimension | Assessment | Notes |
| --- | --- | --- |
| Structure | Good | Separate phone bundle and focused source files. |
| HTML | Good | Entry page dependencies were repaired in the previous pass. |
| CSS | Good | Previous hidden-state fix remains intact; no layout changes in this pass. |
| JavaScript | Needs work | Reconnect resets history inconsistently and loses restriction explanations. |
| Verification/scalability | Needs work | Bounded state and controllable timers improved; real socket replacement still absent from regression coverage. |

## Remaining findings

### 1. [P2] Preserve the bounded dedup/deletion history when keeping the feed on reconnect

**Location:** `app/PhoneChat/main.js:540–545`, reached through `goOnline()` at `1427`.

startTransport creates a new store every time it replaces the socket. It leaves the existing feed DOM intact. After online/pageshow resumes the connection, visible rows and their deleted IDs are therefore no longer represented in the store. A duplicate ID can create a second row, and a deleted message can reappear, despite the tombstone fix in render.js.

**Independent reproduction:**

1. Join the first socket.
2. Receive PRIVMSG id `deleted-1`, followed by CLEARMSG for that ID.
3. Replay PRIVMSG on the same socket: correctly suppressed.
4. Dispatch offline then online; open/join the newly created second socket.
5. Feed the same PRIVMSG ID on the replacement socket.

Result: the original removed text is visible again and two DOM rows have `data-id="deleted-1"` (the deleted placeholder and recreated message).

**Fix:** Keep one bounded store for the lifetime of the displayed channel feed, independent of socket creation. Initialize it on fresh chat setup and reset it only when the corresponding feed/session is deliberately reset. If a fresh store on reconnect is intentional, the visible feed must be reset consistently instead. Preserve the existing bounded eviction behavior.

**Regression:** Use actual online/offline or pagehide/pageshow handlers and drive a second WebSocket. Assert that ordinary duplicate IDs and deleted IDs remain suppressed while their original feed/history window is retained. Also test an out-of-order tombstone across reconnect.

### 2. [P2] Restore the active moderation explanation after a real reconnect

**Location:** `app/PhoneChat/main.js:563–566` and `1412–1427`.

The new composer guard correctly preserves a timeout/ban and keeps sending disabled. However, offline replaces the restriction banner with an offline message, online hides it unconditionally, and joined merely avoids hiding it again. Nothing restores the timeout/ban copy. The account appears Connected with a disabled composer and no explanation.

**Independent reproduction:** Receive a 60-second self timeout, dispatch offline then online, and complete the second socket's join before expiry. After joining, input.disabled is true, banner.hidden is true, and the connection line says Connected myuser. The retained banner text is the offline copy, not the restriction explanation.

**Fix:** Derive the joined UI from moderation state as well as composer eligibility. When blocked, explicitly show the timeout/ban explanation (and appropriate connection status); otherwise show ordinary connected state. Ensure online/connecting transitions cannot erase the explanation permanently. Keep the guarded timeout timer behavior.

**Regression:** Actual socket replacement during both timeout and permanent ban; timeout expiry while offline followed by reconnect; normal unrestricted reconnect. Inspect both the disabled state and the visible explanatory text.

## Documentation/fixture correction

The completion report refers to a nonexistent HypeLol UUID as the review's example. The review's CDN probe used **304420818**, which is the current documented HypeLol ID and still returns 200 with decimal scales. The UUID came from the implementation's fixture. This does not undermine the corrected URL adapter, but the fixture/setup description should not claim that UUID is the documented example. See [Get User Emotes](https://dev.twitch.tv/docs/api/reference/#get-user-emotes).

The fixture also still uses bare scale strings, although the real contract supplies decimals. Add an unmodified documented entry alongside any compatibility fixture so the real shape remains directly tested.

## Next pass

1. Separate feed/store lifetime from socket lifetime.
2. Restore restriction copy from moderation state on join.
3. Extend the harness to capture browser lifecycle listeners and exercise a second socket, rather than only injecting another JOIN on the first one.
4. Rerun the existing lint/build/harness gates and then perform the already documented owner/live-device verification.

Preserve the five functional repairs from the previous pass; these findings concern the reconnect path around them.
