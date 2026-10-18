# Remote behavior and migration matrix

October 16, 2026. Production handlers now integrate the approved shell and player adapter through
UIFocus. Existing per-mode actions remain authoritative. Device checks remain pending. See the
validation document for exact source/generated fixture and browser evidence.

**Web 752 update:** the stale DOM-focus handoff, card Actions targets, retained search sessions,
contextual hints, state-matched recovery and the optional Direct browsing mode are implemented and
browser-verified; see [the implementation results](tv-remote-ux-implementation-results.md) for the
new evidence table and the remaining device-only rows. Browsing grids additionally carry the card
subtarget (`body`/`actions`): Right enters the card's Actions button, a further Right moves to the
next card body in the same row (no row wrap), and Back from Actions returns to its body.

| Context | Existing owner | Existing behavior / sensitive inputs | Target behavior | Verification |
| --- | --- | --- | --- | --- |
| Browsing grids | `Screens_handleKeyDown/Up` | Enter release activates; held Enter refreshes; Left release moves/opens side panel; held Left opens thumbnail options; Page Up/Down route shortcuts | Tabs/rail consume only their input; preserve content actions and held options | Real Browse grid/tabs/rail checked; native holds pending |
| Public/user menu | `Sidepannel_handleKeyDownMain` | Up/Down selection; OK activation; Left/3 followed feed; Right/Back content; 6 Settings; 7 About; 8 controls; 9 Exit | Stable destinations; utilities remain discoverable; preserve feed and shortcuts | Production rail and Settings/Search checked |
| Side-panel followed feed | `Sidepannel_handleKeyDown` | Selected item, previews, manual refresh and native overlay bounds | Separate from navigation presentation; cancel previews on ownership change | Native geometry pending |
| Live, overlays closed | `Play_handleKeyDown`, `Play_KeyReturn` | Left/Right may control seek, chat, PiP placement or audio, multistream selection; Up feed; Down mode-dependent chat; OK panel; Back policy | New bar only on ordinary OK; switcher on eligible Up; legacy handler for other keys | Requires actual mode/bridge tests |
| Live, controls visible | `Play_handleKeyDown`, `PlayVod_PanelY` | Arrow region transitions, quality/value adjustments; Enter key-up/held action; pause/media keys | Compact bar and named drawers; no double actions | Production Chat/More/Playback and parent focus checked |
| VOD | `PlayVod_handleKeyDown/Up` | Progress seeking, held keys, configured increments, chapters, pause and resume position | Retain timeline and all seek semantics; overlay takes ownership only while open | Adapter wired; native playback checks pending |
| Clips | `PlayClip_handleKeyDown` | Next/previous clips, autoplay, seek, open associated VOD/live | Explicit content/playback actions; preserve shortcuts | Adapter wired; native playback checks pending |
| Full-screen chat | Live/VOD handlers, `ChatLiveControls` | Chat placement/size, writing, visibility and shared-chat settings | Chat drawer with live values; mode handlers remain authoritative | Pending |
| Side-by-side chat | `PlayExtra`, live/VOD handlers | Layout-specific left/right behavior and chat focus | Layout drawer changes presentation through existing actions | Pending |
| PiP | `PlayExtra`, `Play_controlsQualityMini`, audio controls | Position, size, audible stream, quality/restart, 50/50 layout; slot-specific bridge calls | Explicit slot labels and Layout/Audio controls | Requires real TV |
| Multistream | `PlayMulti`, `Play_controlsQualityMulti` | Up to four slots, selection, per-slot quality, enabled audio/volume, chat restrictions, capacity checks | Existing slot add/replace dialog and validation; audible stream identified | Requires real TV |
| Followed-channel switcher | `UserLiveFeed*` | Featured/public/followed/history/VOD sections, preview, refresh/held Up, key 2 | Followed Live default with other sections retained explicitly; Back leaves playback unchanged | Existing production feed wired; authenticated/native check pending |
| End-of-stream | `Play_End*`, `Play_Stay*`, `Play_KeyReturn` | Next/live/VOD choices, countdown, stay dialog and mode-specific shortcuts | Close invalid drawers before existing end flow; no accidental replay or exit | Pending |
| Phone pairing | `PhoneChat_Show/Hide/HandleKeyDown` | Live-only eligible control; key 6 shortcut; removes live key handler and restores panel focus; server/QR lifecycle | First Chat row; suspend new owner for existing QR; restore exact Chat row | 396 fixtures; actual pairing dialog → Chat row checked |
| Legacy modal | `Main_*Dialog*`, `Users_*Dialog*`, `Settings_Dialog*` | Own key handler, confirmation focus and callbacks | Suspend new owner; resume once dialog closes | Focus helper suspension tested; callback integration pending |
| Media keys | Per-mode handler | Play/Pause/Stop/previous/next/rewind/fast-forward differ by mode | Preserve exact mode behavior when no overlay owns input | Pending native remote |
| Number keys | Per-mode handler | 0–9 and numpad actions differ across browsing, playback and menus; 6 phone pairing during Live | Preserve current mode mapping; document explicit alternatives | Static cases inspected; exhaustive execution pending |
| Background/resume | `Main_CheckStop`, existing player lifecycle | Timers, playback restoration, Android intent precedence and Back policies | Clear overlays and their timers; invalidate async presentation work | Lifecycle cleanup wired; saved playback restore observed |

## Ownership rules implemented in the foundation

`UIFocus_Dispatch` is called by an existing input owner; it installs no listener. One top owner sees a
handled press. The same physical key's repeats and release are consumed even if that owner closes.
Closing an owner executes timer cleanup once and optionally restores its return target. Suspension
lets an existing dialog receive input; account changes invalidate presentation request tickets.

Existing listener registration is wrapped by UIFocus_Listener; there is no competing global listener.
The numeric screen IDs, saved preferences and native action implementations remain unchanged. New
owners close/suspend before yielding to legacy operations; the helper does not infer legacy timers.

## Required device runs

For each Live/VOD/clip/PiP/multistream mode: tap and hold all four arrows and OK; close an overlay
while a key is held; release after Back; exercise media and number keys; background with a drawer
open; resume after a channel ended. Check bridge target slots, remote Back policy and measured native
preview bounds. The desktop fixture does not replace these runs.
