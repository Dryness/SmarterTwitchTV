# TV redesign fixture

Run `python3 -m http.server 5178 --bind 127.0.0.1` from the repository root, then open
[the fixture](http://127.0.0.1:5178/dev/ui-redesign/).

This is a synthetic, isolated remote prototype, not a replacement Twitch client. It makes no API,
OAuth, pairing, native player, or account persistence requests. It loads the real `Navigation.js`
and `UIFocus.js` helpers. `screen-ids.js` contains only the current screen constants from `Main.js`.
No fixture assets are referenced by `app/index.html` or the build script.

- Arrows move among cards, tabs, details, and the expanded navigation. OK on a card starts simulated playback.
- In playback, OK reveals the bar; Up opens the switcher; Down previews the chat shortcut; Back returns home.
- Chat → Chat on phone opens a clearly labeled pairing placeholder; Back restores the originating row.
- More contains nested groups. Back closes one layer at a time. The bar hides after five idle seconds,
  with its timer suspended for drawers, the switcher, and dialogs.
- The scenario toolbar covers account/auth/empty/error/loading/stale/missing-image states,
  partial rows, long labels, large text, and light/custom theme examples. It is outside the TV composition.
- Mouse and normal keyboard Tab are supported as development affordances. The TV uses D-pad navigation.

The current prototype presents the shared browsing structure. Videos, channels and categories still
use synthetic stream cards; settings groups and account operations are placeholders. Quality/layout
choices change fixture state only. Advanced player actions explicitly say they require production
adapter integration. This fixture cannot validate feature parity, native layering, old WebViews,
stream seeking, or production refresh safety.

Production integration is implemented separately in `app/` and regenerated into `release/`. The user
approved this fixture's layout. See `docs/ui-ux-redesign-validation.md` for real browser checks,
source/generated fixtures and outstanding device acceptance; the synthetic fixture is not that evidence.
