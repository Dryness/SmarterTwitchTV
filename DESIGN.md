# Smarter Purple TV — redesign direction

Status: purple/charcoal direction selected by the user on October 16, 2026.
The user approved the concrete layout and production integration. The shell and player presentation
are integrated in `app/`; `dev/ui-redesign/` remains the isolated reference fixture. Hardware acceptance
is tracked in `docs/ui-ux-redesign-validation.md`.

The surface serves viewers operating a television from a distance with a basic directional remote.
Content and remote focus carry the hierarchy. Keep the bundled Roboto family and existing icon library.
No new font download, framework, blur, focus scaling, or native bridge capability is needed.

## Selected visual roles

- Canvas: quiet charcoal (`#141219` in the default fixture).
- Rail and drawers: one elevated charcoal surface (`#1e1b25`).
- Text: near-white (`#f5f1fa`); secondary text a readable violet neutral (`#c1b8cd`).
- Remote focus: pale violet outline (`#bca0ff`) plus a darker filled surface (`#30253f`).
- Active destination/tab: purple text or an underline, separate from the remote focus outline.
- Live state: labeled badge, never color alone.

These are default design roles, not replacements for saved user theme values. Production integration
generates role CSS through `SettingsColor.js` using saved dark/light/custom colors. Fixture theme
examples illustrate intent; the device theme matrix still needs validation.

## Approved composition

A fixed narrow rail opens over content without moving its grid or previews. Following has Live now,
Videos, Channels and Categories. The grid has three columns and fixed 16:9 image geometry. It scrolls
inside the available area; the focused title and channel-details action stay in a reserved bottom area.
Large text may show fewer rows, while keeping those controls reachable. Three columns remains a TV
validation hypothesis. No card grows on focus.

The player uses a compact bar with Play/Pause, Chat, Quality, Layout, More, and explicit Channels.
Drawers use one vertical selection column. Chat on phone is the first Chat action. Nested Back returns
to its originating row; the switcher cancels without changing playback. Preserve mode-specific
shortcuts through the legacy handler whenever the new layer does not own the event.

## Geometry and interaction rules

Keep at least 4.5–5% safe margins around primary content. At the 1080p reference, labels are roughly
28px, secondary metadata 22px, and headings 57px in the fixture; final reading-distance approval remains
pending. Limit title lines with ellipsis and retain full identity in accessible labels. Never wrap
Left/Right into another grid row. On refresh resolve identity before numerical position. Delay timers,
network responses, and preview completion must not delay focus feedback.

Card interaction (Web 752): each real card has a primary body and a trailing Actions button in its
metadata corner. The body keeps the single-press primary action; the Actions button opens the item's
options menu and never inherits the body's hold timers. Spatial order per row is body, Actions, next
body; vertical moves keep the subtarget column; row ends clamp. The selected element, visible focus
treatment, DOM focus and input owner must agree after every handoff: the departing owner releases
DOM focus, the restored owner takes it, and Back never activates the newly exposed target. Footer
hints describe the focused target's actual controls and may wrap to two lines instead of shrinking.

Use no required CSS variables in production: older TV WebViews and the existing theme generator are
constraints. The isolated browser fixture may use modern layout features; they must be replaced or
verified against supported TV engines before adopting its CSS into `app/index.html`.

The rail opens immediately; focus feedback never waits for an animation. Any production motion
must honor the saved app-animation preference and reduced motion. Back closes only the top layer. Drawers suspend
bar hiding; a new delay begins when the bar resumes. Held keys and their release belong to the owner
that consumed their initial press.
