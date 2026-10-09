# Phone chat repair review

Reviewed October 9, 2026 against the current working tree and the pasted repair report. This is a follow-up to `phone-chat-review.md`, not a replacement of its historical findings.

## Verdict

The two login blockers are corrected, and the test harness now exercises main.js. The repair is substantially better, but it is not ready to approve: the Twitch emote adapter still generates broken image URLs, and moderation/reconnect state has several reproducible defects. The claim that all nine findings and all additional issues are fixed is too broad.

Implementation source was left unchanged during this review. The full build regenerated output through the maker.

## Independently verified

- `node release/scripts/phonechat-tests.js`: **188 passed, 0 failed**.
- `node release/scripts/maker.js jsh`: passes, exit 0.
- `node release/scripts/maker.js`: passes, exit 0.
- `git diff --check`: clean.
- WebTag remains 742; the TV bundle contains QR integration and excludes the phone runtime.
- Real browser, local HTTP: the generated picker is hidden with computed display none; the visible configuration banner displays correctly. The source page loads its sibling CSS, applies the charcoal theme, and hides the picker.
- Independent app-level reproductions reuse the harness's mock DOM, load all phone files including main.js, and drive real transport event handlers with dummy credentials. No real Twitch login or messages were performed.
- Read-only HTTP HEAD probes: the documented HypeLol CDN path ending `/static/dark/2` returns **404**; the same path ending `/static/dark/2.0` returns **200**.

## Status of the previous nine findings

| Previous finding | Repair status |
| --- | --- |
| OAuth return before missing-channel rejection | Corrected; full boot fixture covers the original trigger. |
| GET token validation | Corrected; request method/header asserted. |
| Actual Get User Emotes response | **Incomplete**; template supported, but format and scale metadata still parsed incorrectly. |
| Hidden picker/banner CSS | Corrected; explicit hidden rule, browser checked. |
| Zero-width overlays | Resolver and segment attachment corrected; stacking/orphans tested. Physical rendering on mobile still pending. |
| Unbounded ID map | Eviction corrected; deleted-message handling has a separate defect below. |
| Source TV script dependencies | Corrected; all three references present. |
| Source phone stylesheet | Corrected; source page checked in browser. |
| Untagged IRC authentication failure | Corrected; documented notice reaches the authentication error path. |

## Scores

| Dimension | Assessment | Notes |
| --- | --- | --- |
| File and folder structure | Good | Separate phone runtime, shared public configuration, source-owned assets. |
| HTML | Good | Both entry pages now reference their dependencies. |
| CSS | Good | Hidden-state regression corrected; overlay layout needs physical/mobile verification. |
| JavaScript correctness | Needs work | Remaining emote contract and moderation state defects. |
| Debuggability and scalability | Needs work | App boot coverage is useful, but fixtures still invent Twitch fields and moderation transitions are absent. |

ES5 and global scripts remain appropriate under AGENTS.md.

## Remaining findings

### 1. [P2] Use the real Twitch format and scale values when substituting the template

**Location:** `app/PhoneChat/emotes.js:138–144`; affected fixtures at `release/scripts/phonechat-tests.js:582` and `1000`.

The adapter now receives the top-level template, but reads `emote.emote_format`, which Get User Emotes does not supply. The actual field is `format`, an array. It also hardcodes scales `1` and `2`; the API documents `1.0`, `2.0`, and `3.0`. [Twitch response contract](https://dev.twitch.tv/docs/api/reference/#get-user-emotes).

With the documented HypeLol entry, normalization emits `/static/dark/2` and a srcset containing `/1` and `/2`. HEAD requests confirm `/2` returns 404 and `/2.0` returns 200. Thus the picker has records but their images fail. Received range-tagged Twitch emotes found in the resolver also inherit these broken URLs. Animated entries with `format: ['static', 'animated']` are always normalized as static.

**Fix:** Select supported values from `format`, `scale`, and `theme_mode`, respecting reduced motion where applicable, then substitute those exact values. Derive valid density descriptors separately from the scale strings. Do not introduce an emote_format compatibility field to make the invented fixture pass.

**Regression:** Use an unchanged documented response fixture, including `format` and decimal scale values. Assert the full URL/srcset. Include an animated entry, reduced motion, and restricted variants. The current HypeLol fixture is still not the documented shape.

### 2. [P2] Keep timeout/ban state independent of socket joins and individual timers

**Locations:** `app/PhoneChat/main.js:509–512`, `749–770`, `785–790`.

A join unconditionally enables the composer and dismisses the banner, even if the account is still timed out or banned. The timeout callback also uses only the account flow generation, which does not change on a later moderation action. An earlier timeout timer can therefore re-enable sending after a newer timeout or permanent ban. trySend itself does not check moderation state.

**Reproduced:** Receive a 60-second self timeout, go offline/online, then join the replacement socket: the composer becomes enabled and the timeout banner disappears immediately. Receive a permanent ban, then fire the old timeout callback: sending becomes enabled again and the ban banner disappears. Twitch still enforces its restriction server-side, but the page's state becomes false and rejected attempts can look successful.

**Fix:** Store explicit ban/timeout state (including timeout-until time), replace/cancel the prior expiry timer on every moderation event, and use a moderation generation if needed. Derive composer eligibility from both connection and moderation state. Apply the same guard in trySend. Reconnect must preserve the restriction until it expires or is explicitly updated.

**Regression:** Timeout → reconnect; timeout → longer timeout; timeout → permanent ban; expiry while offline → reconnect; and a send attempt while blocked. Use controllable timers instead of waiting in real time.

### 3. [P2] Clear the signed-in user's previous messages on CLEARCHAT too

**Location:** `app/PhoneChat/main.js:749–779`.

When target-user-id matches the phone's account, onClearChat handles the composer restriction and returns before the deletion loop. Other users' rows are removed, but the signed-in user's moderated messages remain visible. Local echoes also have no data-user-id, so they escape targeted cleanup.

**Reproduced:** Render an own-account PRIVMSG containing `old own message`, then receive a self-targeted CLEARCHAT with ban-duration. The composer disables, but `old own message` remains in the feed.

**Fix:** Perform the common targeted message cleanup before the account-specific restriction handling. Attach user identity to local echoes and clear their bookkeeping consistently.

**Regression:** Same CLEARCHAT behavior for another user and the signed-in user, including local echoes, both timeout and permanent-ban cases.

### 4. [P2] Treat a deleted ID as already seen during its bounded tracking window

**Location:** `app/PhoneChat/render.js:285–290`, `303–310`, together with `main.js:642–643`.

markDeleted sets an indexed ID to false. Both has and append then treat that ID as unseen, so a duplicate PRIVMSG recreates text that was just removed. The bounded eviction fix is useful, but boolean false is not an effective deletion tombstone. Twitch documents that message order is not guaranteed and messages can be delivered more than once. [IRC parsing behavior](https://dev.twitch.tv/docs/chat/irc/#parsing-messages).

**Reproduced in the app:** PRIVMSG → CLEARMSG changes the row to `message deleted`; replaying the same PRIVMSG ID appends the original text again. The pure-store append also returns `{appended: true, duplicate: false}` for the deleted ID. The harness currently asserts has(deletedId) is false and never tests replay.

**Fix:** Separate seen/deleted state, or make the dedup check use key presence while retaining deletion metadata separately. Keep both states bounded and ensure deleting before an out-of-order message arrives can be handled as intended. Reset state only through explicit session/history policy, not by equating deleted with unseen.

**Regression:** PRIVMSG → CLEARMSG → duplicate PRIVMSG; CLEARMSG before PRIVMSG; repeated deletion; and eventual eviction beyond the tracking window.

### 5. [P2] Update the stored slow-mode baseline after every ROOMSTATE change

**Location:** `app/PhoneChat/main.js:545–551`.

The handler updates S.slowMode but never updates S.roomRestrictions.slow after initialization. Later comparisons use the original value forever, repeating unchanged notices and omitting transitions back to the initial value.

**Reproduced:** ROOMSTATE slow values 5 → 10 → 10 → 5 emit two identical 10-second notices and no return-to-5 notice. The actual send throttle changes, but the feed reports the wrong sequence of changes.

**Fix:** Compare the previous stored value, emit on a genuine change, then update the stored baseline. Keep reconnect initialization intentional.

**Regression:** 5 → 10 → 10 → 5 → 0 should produce only the three actual-change notices.

## Additional discrepancies in the completion report

- Local echoes still display **sent**: `Strings.sentMark` is unchanged at `main.js:62`, and used at `847`. The new comment says submitted, but the UI does not. A failed/restricted message remains marked sent after NOTICE. Use submitted wording or an explicit pending/rejected state.
- loadTwitchEmotes labels every emote returned with broadcaster context as channel scope. That parameter adds follower emotes; it does not filter away emotes from other channels. Classify ownership using owner_id and emote metadata if presenting Channel/Global sections.
- The claim that flowGen guards *all* HTTP continuations is overstated: loadBadges has no generation check. Audit the actual lifetime requirements rather than relying on the completion prose.
- Live OAuth, real chat send/receive, provider CORS, physical QR scan, and mobile keyboard/background behavior remain unverified. These are correctly listed as pending in the setup document and are not substitutes for the reproduced code fixes above.

## Recommended next pass

1. Repair Twitch template variants using authoritative fixtures; verify real CDN paths without credentials.
2. Centralize composer eligibility and moderation state; add timer/reconnect transition coverage.
3. Fix self-targeted cleanup and deleted-ID deduplication together; exercise actual app handlers.
4. Fix slow-mode baseline and submitted/rejected copy.
5. Rerun the harness, lint, full build, whitespace check, and source/release browser smoke checks.
6. Complete owner setup and perform the already documented live/device checks before claiming the feature is verified.

The callback boot, GET validation, hidden CSS, source loading and bounded ID eviction repairs are meaningful improvements. Preserve those repairs while addressing the remaining findings.
