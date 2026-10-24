# Smarter Purple TV

A Twitch client for Android TV. This is a fork of [SmartTwitchTV](https://github.com/fgl27/SmartTwitchTV) by Felipe de Leon — same app you know, slowly getting a mind of its own.

Same two-part architecture as upstream — a web app (UI and most features) loaded by an Android APK (players and platform glue) — same features, same remote-friendly navigation. The differences are listed below.

## What's different from SmartTwitchTV

- **Ad blocking, no proxy needed.** Ads stitched into live streams are removed directly from the playback playlists, using only Twitch's own servers. Ad breaks that can no longer be hidden freeze the picture on the last live frame until the break is over, and a pre-playback probe checks every stream quality so stitched ads can't slip into playback. On by default, can be turned off in Settings → Player → Block ads. (Requires an APK built from this fork.)
- **Follow raids.** When the watched streamer raids, the player switches to the raided channel automatically (optional, requires login).
- **A new default look.** Purple accent throughout: focused items get a purple outline and glow, the Following hearts are purple, and so are the loading spinners. Same dark base, own identity.

**Chat on phone:** APK 386 can host the phone chat page on your local network. Scan the TV QR, sign in on your phone, and chat follows the live stream playing on TV. See [setup and build instructions](docs/phone-chat-setup.md); Twitch login requires an owner-controlled client ID.

## Everything else

Build instructions, translations, troubleshooting and the full story of the app live in the [upstream README](https://github.com/fgl27/SmartTwitchTV#readme). To build this fork, follow the same steps against this repository.

## Credits and license

SmartTwitchTV is © 2017–present Felipe de Leon, its contributors, and this fork's contributors. Licensed under the [GPL-3.0](LICENSE), as is everything derived from it.
