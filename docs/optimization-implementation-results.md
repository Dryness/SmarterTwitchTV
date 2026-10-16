# Optimization implementation results

Implemented October 16, 2026 against `aac56c84db8d79229a7f7aabbfa4f6eb4afa50af`, using Node v26.11.1. The supplied plan remains unchanged. No commit, tag, upload, publication, or deployment was performed.

**Completed work**

| Package | Implementation and review anchors |
| --- | --- |
| 0 | Re-ran all four baselines: lint passed, 384 phone checks, 19 update checks, 11 collector checks. Added deterministic workloads and this results record. |
| 1 | `release/scripts/maker.js`: skip per-file minification only in lint mode. All three lint paths, source ordering, minifier settings, full-build behavior and exit codes remain intact. |
| 2 | `ChatLive.js`: `ChatLive_LineAddDelay`, `ChatLive_DelayArm`, `ChatLive_DelayClear`. One heap and timer per slot; absolute captured deadlines and stable tie sequence; earlier arrivals rearm as needed. Clear, initialization including SkipClear, switching and reentrant cleanup release queues. Generation IDs now increase even when initialization happens within one millisecond. Existing paused buffer path and cap remain intact. |
| 3 | `ChatLive.js`: `ChatLive_CacheTouch`, `ChatLive_CacheTrim`, `ChatLive_CacheSetPins`, `ChatLive_CacheRelease`. One LRU index across all listed providers, badges, cheers and profile images. Maximum 20 inactive IDs plus both active channels and up to 100 current participants per slot. Current shared responses rebuild pins and departed participants cannot refill profile/badge data. Failed/incomplete channel loads remain retryable; empty successful loads can be reused. VOD cleanup also releases pins and active emotes. |
| 4A | `app/index.html`: replace expanding max-height animation with a 180 ms fade and 0.15 em vertical motion. Final layout height is occupied immediately. The existing animation setting still controls the wrapper class. Removed persistent will-change. |
| 4B | `app/PhoneChat/main.js`: timestamp tail fast path, synchronous replay insertion with try/finally maintenance batching, one live frame flush with timer fallback. Background pages use timers because RAF can be suspended. Session/channel reset and pagehide cancel pending maintenance; stale callbacks carry a generation guard. Scroll handling preserves current user intent and ignores a delayed event from the last automatic scroll. |
| 5A | `RequestDispatcher.java` and `PlayerActivity.java`: activity-owned dispatcher closes before partial-initialization return in onDestroy. Queued work and results are released; posted wrappers lose their Activity callback/payload references on close. Guard callbacks before posting and at execution, including WebView and APK update/installer paths. Ordinary stop/resume does not close requests. |
| 5B | 12 workers, 128 waiting requests, explicit rejection. Bridge errors retain the existing callback shape and string argument types, using safely serialized inline failure values when no slot is available. All four submission sites are covered; update rejection releases the busy state. Up to 500 synchronized result reservations remain owned until consumption, page navigation, or Activity teardown. Unique result IDs prevent a stale completion/getter from addressing a new reservation. All getter call sites are generated Java callback expressions; there are no app JS consumers that require repeated reads. |
| 6 | Prepared APK 391 / WebTag 750, dated October 16, 2026; matching APK URL and changelogs. Regenerated web/phone artifacts and built the debug APK. Updated AGENTS.md with the focused harness commands. |

**Conditional work deferred**

Package 4C (TV DocumentFragment batching) was deliberately skipped. No representative TV trace establishes a remaining TV append bottleneck after the scheduler/animation changes. Phone measurements do not establish a TV bottleneck. Existing synchronous TV insertion, moderation ordering and reverse-prepend history remain unchanged. This avoids introducing an unmeasured change to those paths.

**Automated verification**

| Command, from repository root | Final result |
| --- | --- |
| `node release/scripts/maker.js jsh` | Passed all three lint bundles |
| `node release/scripts/phonechat-tests.js` | 396 passed, 0 failed (baseline 384) |
| `node release/scripts/update-tests.js` | 19 passed |
| `node release/scripts/phonechat-collector-tests.js` | 11 passed |
| `node release/scripts/chat-optimization-tests.js` | 773 passed |
| `node release/scripts/request-dispatcher-tests.js` | 5,185 passed |
| `node release/scripts/maker.js` | Passed; TV, Extrapage, phone, version/changelog generation completed |
| `node release/scripts/phonechat-tests.js --built` | 396 passed, 0 failed |
| `node release/scripts/phonechat-server-tests.js` | 37 native phone/debug-server checks passed |
| `git diff --check` | Passed |

Java checks used `JAVA_HOME=/Users/yofardev/Library/Java/JavaVirtualMachines/corretto-17.0.10/Contents/Home`. The server harness found platform 35 under `/Users/yofardev/Library/Android/sdk`.

The final APK command, run in `apk/`, is:

```sh
JAVA_HOME='/Users/yofardev/Library/Java/JavaVirtualMachines/corretto-17.0.10/Contents/Home' \
ANDROID_HOME='/Users/yofardev/Library/Android/sdk' \
./gradlew :app:assembleDebug --console=plain --quiet
```

It passed. Output: `apk/app/build/outputs/apk/debug/app-debug.apk`, application ID `com.fgl27.twitch.debug`, versionCode 391, versionName 3.0.391, minSdk 21. The sibling custom media checkout and existing commented private-service plugins were already available; no build workaround files were changed. An initial attempt with Android Studio's bundled JDK 25 failed because Gradle 8.13 could not process class-file version 69. JDK 17 and an explicit ANDROID_HOME resolved the environment issues. Existing Android deprecation/SDK-format warnings remain. This is a debug build, not a signed production release or an installation test.

TV tests exercise actual source functions under a fake clock: both slots at 20/100 messages per second, delay off/5/30 seconds, 1,000-message bursts, deadline changes, tie ordering, invalid latency, generation/reentrant cleanup, SkipClear/switch, and the existing paused cap/order. Cache fixtures cover 100 visits, 20 inactive IDs plus a 102-ID pinned union, cross-slot pins, eviction consistency, recency, empty/incomplete responses, stale generations/participants, and code collisions.

Native tests use the production dispatcher with latches, not timing sleeps: 12 stalled workers and 128 queued jobs; explicit rejection without caller-runs; 500 completed results with delayed UI consumption and 600 further reservation attempts; reverse completion/consumption; early/double getters; closure before work, closure with queued/running/completed or already-posted work, simulated download completion after closure, and ten recreated pools. These establish dispatcher behavior, not full Android Activity instrumentation.

**Measured workload results**

Five fresh Node processes per version on the same machine; no OS filesystem-cache purge was attempted. The first sample is reported separately rather than being described as a true cold-I/O measurement.

| Lint time, seconds | Before | After |
| --- | --- | --- |
| Samples | 2.688, 2.622, 2.658, 2.686, 2.749 | 0.755, 0.684, 0.679, 0.677, 0.678 |
| Median, all five | 2.686 | 0.679 |
| Median, later four | 2.672 | 0.678 |

An isolated copied checkout replaced UglifyJS.minify with a throwing function: lint still passed, establishing zero minifier calls. Invalid syntax added only to that temporary fixture produced a nonzero JSHint exit. Two full builds in an isolated copy, with identical runtime sources/dependencies and the original versus modified maker, produced identical hashes for all 18 compared production JS/HTML/CSS files. Runtime bundle differences in this checkout come from the intentional runtime/version changes.

The two-second TV workload has two slots, each receiving the listed rate:

| Rate per slot | Delay | Pending timers before | Pending timers after |
| --- | --- | --- | --- |
| 20/s | off | 0 | 0 |
| 20/s | 5 or 30 s | 80 | 2 |
| 100/s | off | 0 | 0 |
| 100/s | 5 or 30 s | 400 | 2 |

For real desktop browser verification, run `node release/scripts/chat-browser-fixture.js`, then open `http://127.0.0.1:8765/current` and `/baseline`. The local fixture serves public source assets, instruments main.js in memory, disables network initialization, and compares the working tree with `HEAD`. It makes no Twitch requests and uses no credentials. Browser fixture behavior checks passed on both versions: replayed deletion, timestamp-scoped user clear, later messages surviving that clear, stable chronology, priority retention, ordinary pruning, reading position/unread prompt, and reset before a pending flush.

Five alternating runs per version in the Codex embedded desktop Chromium browser gave these synchronous workload medians. They include DOM work and any synchronous layout induced by those operations; they are not a breakdown of layout time or a TV/mobile responsiveness measurement.

| Browser workload | Before | After |
| --- | --- | --- |
| 1,002 replay events: median synchronous time | 1,959.9 ms | 29.4 ms |
| Replay retained rows | 753 | 753 |
| Replay scroll calls | 1,000 | 1 |
| Replay prune calls | 1,001 | 1 |
| 1,000 chronological live messages: median synchronous time | 3,767.0 ms | 33.9 ms |
| Live scroll calls | 1,000 | 1 |
| Live prune calls | 1,000 | 1 |
| Live ordering-loop iterations | 753,000 | 0 |

Raw replay milliseconds: before `[1938.4, 2023.8, 1964.8, 1841.4, 1959.9]`, after `[31.7, 29.4, 32.2, 26.6, 28.2]`. Raw live milliseconds: before `[3775.5, 3934.2, 3713.0, 3557.9, 3767.0]`, after `[33.9, 33.6, 38.2, 34.3, 31.9]`. These are synthetic bursts, not typical Twitch traffic. A final browser rerun after the background-timer safeguard also passed, with one scroll/prune and zero live ordering scans. No FPS, byte-memory reduction, or isolated layout-time percentage is claimed.

**Changed files**

Runtime/tooling source: `app/specific/ChatLive.js`, `app/specific/ChatVod.js`, `app/PhoneChat/main.js`, `app/specific/OSInterface.js`, `app/index.html`, `apk/app/src/main/java/com/fgl27/twitch/PlayerActivity.java`, new `RequestDispatcher.java`, and `release/scripts/maker.js`.

Checks: expanded `release/scripts/phonechat-tests.js`; new `chat-optimization-tests.js`, `request-dispatcher-tests.js`, `java/RequestDispatcherTest.java`, and `chat-browser-fixture.js` under `release/scripts/`.

Metadata/documentation: `app/general/version.js`, `apk/versions.gradle`, `apk/Changelog.md`, `AGENTS.md`, this report, and `.gitattributes`. The attributes only allow preserved CRLF in ChatLive.js/version.js during whitespace checking; they do not normalize file contents. Both files retain CRLF throughout.

Build-generated changed files: `release/githubio/js/main.js`, `main_uncompressed.js`, `PhoneChat.js`; `release/githubio/version/version.json`; `release/index.html`; `release/phonechat-assets/phonechat/PhoneChat.js`. The build also refreshed the ignored `apk/Changelog_Up.md` and temporary maker outputs. Unchanged Extrapage/phone HTML/CSS assets were generated and verified without hand edits.

**Remaining validation and limitations**

- No physical TV/phone or emulator execution was performed. Remote navigation, native preview alignment, live/VOD/PiP/multi-chat playback, actual Twitch login/sending/emotes, phone suspension/pairing, real Activity recreation, installer permissions/handoff/retry, and older WebView behavior still need device acceptance. JVM checks and the APK compile do not establish those passes.
- The deliberate TV animation change still needs visual review for wrapped text, tall emotes, highlights, hidden chat, both slots, VOD and pause/resume. No representative TV layout/heap trace was captured; package 4C remains deferred for that reason.
- One timer per slot bounds timer overhead, not pending message storage. Messages accumulated during a configured delay are still retained until delivery or clear; no new dropping cap was added.
- `userEmote` retains separate account-scoped Twitch copies for the TV composer, reset by the existing account cleanup. Global provider data and accumulated KnowBots names retain their existing semantics. Channel eviction does not bound all chat memory, rendered DOM/image caches, or total bytes. Pins can legitimately make total cache IDs exceed 20.
- Native shutdown requests interruption and releases waiting jobs, results and pending UI callback targets. Active HttpURLConnection/APK-download I/O may remain alive until it completes or its existing connect/read timeout fires; request-owned connection disconnection was not introduced. All obsolete delivery is suppressed. Screen-specific cancellation within a still-live Activity remains deferred because callback keys/checkResult are not unique ownership IDs.
- Limits of 20 inactive channel IDs, 12 native workers and 128 waiting jobs are initial values. Normal startup/shared-session bursts and responsiveness should be measured on target devices before publication. Saturation sends failure callbacks; a stalled Android UI can still accumulate those small failure notifications until it processes them.

**Pre-release review fixes**

The two reported P2 issues are fixed within the prepared APK 391 / WebTag 750 release; no additional version increment was applied to this unreleased work.

- Twitch emote transformation now populates the channel/global cache before applying account-level deduplication. Existing account/active-emote precedence remains intact. Six additional source-function assertions reproduce overlapping responses and channel eviction followed by reload and account switching, including picker restoration.
- Main WebView navigation advances page ownership and clears abandoned results and queued page callbacks. App-initiated reload paths invalidate before loadUrl, and onPageStarted covers reloads/redirects from the WebView. Bridge submissions capture the current page; old queued work skips network execution, running old work cannot publish/deliver, and stale reservations cannot be reused because result IDs increase across navigation. The 500 simultaneous-reservation budget is unchanged. Activity-owned startup/download/installer work keeps its separate lifetime.
- Native-generated callback scripts check page ownership at renderer execution as well as before posting to the UI. They consume current-page results before checking smartTwitchTV availability, releasing the reservation even if the web bundle is not initialized. Old-page script execution cannot consume a new page's result. Added IsRequestPageCurrent bridge support with an old-APK fallback in OSInterface.js; no bridge signature changed.
- New native regressions cover five reloads with all 500 reservations pending or completed-but-unconsumed, old publication/release/getter behavior, blocked UI callbacks, a running request completing after navigation, and successful new-page delivery. The Node runner also executes the exact production-generated scripts for ten renderer scenarios and verifies three bridge compatibility cases.

Final revalidation passed: lint; 773 TV scheduler/cache checks; 396 phone checks against each of source and built output; 5,185 JVM dispatcher checks plus ten callback-script scenarios and three bridge compatibility checks; 19 update, 11 collector, and 37 native server checks; full web generation; debug APK assembly; and git diff --check. Existing deprecation warnings remain. Physical-device reload/account-switch acceptance remains outstanding.
