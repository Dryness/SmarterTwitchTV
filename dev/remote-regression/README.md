# Remote regression fixture (real DOM)

Run a static server from the repository root, then open the fixture:

```bash
python3 -m http.server 5179 --bind 127.0.0.1
# http://127.0.0.1:5179/dev/remote-regression/
```

Results render on the page and in `window.__remoteRegression` for automation.

## What is production and what is synthetic

- Production, unmodified: `app/general/TVKeyValue.js`, `app/specific/UIFocus.js`,
  `app/specific/Navigation.js`. These provide the navigation controller, focus ownership
  stack, held-key suppression and the shell button handlers under test.
- The markup duplicates the `navigation-shell` ids from `app/index.html`.
- `harness.js` stubs the `Main_*`/`Sidepannel_*`/`ScreenObj` environment those files call in
  the app, and provides a synthetic content grid that implements the content-side handoff
  contract: apply the focus class, then take DOM focus only when the grid owns it (body or
  one of its own cards is active). A synthetic replacement navigation controller is
  deliberately not used.
- Keys are dispatched untargeted on `document.activeElement` so a stale focused element
  itself must survive the next press. No check clicks or refocuses the expected target.

## Covered cases

- Rail closed with Right and with Back: DOM focus returns to the restored card, the shell
  holds no focus treatment, and the next Down/OK affect the grid instead of reopening
  navigation.
- Tabs closed with Down and with Back: same assertions plus next Right moving the card.
- Held keys: closing the rail while Up/Left are held and releasing afterwards reopens
  nothing, watches nothing, navigates nowhere.
- Enter repeat/release on the rail: one activation only.
- Shell re-render while the rail is open, then close and restore.
- Empty screen return: retry action owns DOM focus and refreshes once.

## Known limits

- Synthetic KeyboardEvent dispatch does not trigger browser default actions, so the
  "default button click on Enter key-up" hazard is verified by the `preventDefault` in
  `UIFocus_Dispatch` plus physical-TV checks, not here.
- Cases for card actions, search sessions, settings and player drawers are added with
  their implementation phases; see `docs/tv-remote-ux-implementation-plan.md` section 5B.
