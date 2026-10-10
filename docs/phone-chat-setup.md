# Chat on phone — local TV hosting

The Android TV app hosts the phone chat webpage on its own Wi-Fi/Ethernet address.
APK **386** and web build **744** introduce this mode. No public hosting or per-TV
OAuth callback is needed for the phone page.

## Use it

1. Install the APK containing the local server and phone assets.
2. Connect the phone and TV to the same local network. An Ethernet-connected TV
   is supported when the phone's Wi-Fi reaches that network. Guest networks with
   client isolation cannot connect the devices.
3. Play a primary live stream and press **6** on the remote, or choose
   **Chat on phone** in the player controls. Press **6** again or **Back** to close
   the QR. This shortcut is available from web build **745** with APK **386**.
4. Scan the QR. It opens an address like `http://192.168.1.42:8978/chat/`.
5. Select **Connect** on the phone. Authorize in the Twitch tab and return to chat.
   The page also provides the activation link and user code if the browser blocks
   automatic tab opening. Login completes automatically after authorization.

The phone follows changes to the primary live channel without rescanning. When
playback ends, or the TV moves to VOD, clips or multistream, sending stops and the
page waits for a live stream. Each channel gets its own cleared history, emote
catalog, draft and moderation state. The phone's Twitch account remains signed in.
The TV QR control remains limited to primary live and picture-in-picture playback.

If SPTV closes, the phone loses its TV connection. Reopening the QR after a TV
restart or address change creates a new pairing; scan it again. A phone-page
reload retains pairing and login in the same tab. Closing the tab removes them.
A session that expires requires signing in again; refresh tokens aren't stored.

## Chat views (APK 388)

Partner messages have the same subtle purple background as TV chat. **All chat**
shows everyone; **Partners, VIPs & Mods** shows only messages carrying Twitch's
Partner/verified, VIP or moderator badge. Badge artwork does not need to load for
classification to work. Both tabs use the same bounded recent history; switching
views preserves message deletions and timeouts. Your own submitted messages use
Twitch's current USERSTATE badges.

The filtered tab excludes exact, case-insensitive logins `nightbot`,
`streamelements`, `wizebot`, `wisebot`, `moobot` and `fossabot`. Bots remain visible
in All chat. Custom bot names are not detected automatically; extend the exact
login list in `app/PhoneChat/render.js` if needed. System notices remain in All
chat; connection and account warnings continue to appear above both views.

These changes require APK 388 because the local phone page is bundled in the
APK. After updating the TV, scan its QR again and reload the phone page.

## Owner setup: one public Twitch client ID

1. Register an application owned by this project in the
   [Twitch developer console](https://dev.twitch.tv/console).
2. Choose the **Public** client type. Twitch supports
   [Device Code Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow)
   for public clients without a client secret. For the console's required HTTPS
   redirect field, enter
   `https://yofardev.github.io/SmarterTwitchTV/release/phonechat.html` and click
   **Add**. Device authorization does not use this redirect; the phone page stays
   on the TV's LAN address. Do not register every TV's LAN address.
3. Set `PhoneChatConfig.clientId` in `app/general/PhoneChatConfig.js`.
4. Run `node release/scripts/maker.js`, then build the APK so its bundled phone
   configuration includes that ID. Deploy the regenerated web app for TV controls.

Required scopes remain `chat:read chat:edit user:read:emotes`. The owner's public
client ID is configured, and Twitch's device endpoint accepts it and these scopes.
Real account authorization and live chat still require the device checks below.
Do not reuse a client ID owned by upstream and never embed a client secret. If the
public ID is removed, the local page and TV channel following still work, but
sign-in shows a configuration message.

The optional hosted page remains available for browser development. It also uses
Device Code Flow by default. Legacy implicit callbacks are retained for existing
callback links/tests; a Public client cannot initiate implicit authorization.

## Data and lifecycle

- The QR contains a random 256-bit pairing capability in its URL fragment. The
  phone scrubs the fragment and retains the capability in tab session storage.
- Pairing authorizes only the current public channel state. No TV Twitch token,
  password, phone OAuth token, debug log, or arbitrary file is served.
- The server binds to a private IPv4 address on Wi-Fi/Ethernet, port **8978**. It
  starts when the QR is first opened and closes on Android activity destruction.
  No router port forwarding is needed. IPv6-only networks aren't supported yet.
- The phone polls `/chat/state` every two seconds with `X-SPTV-Pairing`. The APK
  receives the TV's current channel through `SetPhoneChatChannel`; a ten-second
  missing heartbeat makes the channel inactive. A stopped publisher cannot leave
  sending enabled indefinitely.
- Only the exact page/JS/CSS routes and authenticated read-only state are exposed.
  Foreign Host/Origin requests, traversal, writes and invalid pairing are rejected.
  Requests have size/time limits and a bounded worker pool. One bad client does
  not stop the listener. Pairing rotates after a restart or address change.
- Local page/state delivery uses HTTP on the trusted home network. Twitch device
  authorization, validation, APIs, IRC and emote-provider requests go directly
  from the phone to HTTPS/WSS services. Twitch credentials never cross the LAN
  connection to the TV. The phone page isn't an offline Twitch service.
- Phone login remains separate from TV login. Tokens stay in phone memory and
  tab session storage and are validated against client ID, identity and scopes.

## Build and verify

```sh
node release/scripts/maker.js jsh
node release/scripts/maker.js
node release/scripts/phonechat-tests.js
node release/scripts/phonechat-tests.js --built
node release/scripts/phonechat-server-tests.js
```

The Node maker generates `release/phonechat-assets/phonechat/{index.html,
PhoneChat.js,phonechat.min.css}`. Gradle includes that directory as an asset source
and checks all three files before building. Do not hand-edit generated assets.
The local APK's phone bundle is updated by rebuilding the APK; TV web controls
continue to ship through the existing hosted web app. Asset-mode TV development
(`up_assets`) does not remove this separate Gradle asset source.

The Java integration checks require JDK 17+ and Android SDK platform 35; set
`JAVA_HOME` and `ANDROID_HOME` if necessary. They exercise the production server
on loopback with the generated assets, without an Android device or Twitch token.
Use a JDK supported by the repository's Gradle version for the APK build.

## Verification limits

Automated checks cover existing chat behavior plus local pairing, following
streams during/after authorization, unavailable TVs, playback exit, revoked
pairing, canceled authorization, malformed activation URLs, and native HTTP
routing/lifecycle. Twitch device/token CORS preflight permits local HTTP origins.

A physical TV/phone check still needs to verify QR scanning, the router's device
connectivity, mobile browser tab/background handling, actual Twitch authorization
and sending, and live Twitch/BTTV/FFZ/7TV emotes. Tests use mock OAuth responses;
they do not substitute for those account/device checks.
