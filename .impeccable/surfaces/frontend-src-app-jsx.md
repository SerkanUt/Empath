---
version: 1
slug: "frontend-src-app-jsx"
primary_target: "frontend/src/App.jsx"
related_targets: []
---

# Surface brief: ReelReaction app (whole frontend)

Scope: whole app, Operate mode. Audience: creators testing short-form video before posting; researchers secondary. Task: tag intended emotion, calibrate and record viewers, read whether each moment landed. Constraints: local-only webcam, English UI, test mode stays unobtrusive, colour = emotion with a shape and a text label on every mark, dark ground throughout. Open: "video" used for "scene" in UI copy; emotion shapes proposed one per emotion.

## Direction contract

THESIS: One screen shows the whole answer: the video on the left, and on the right two rows of single-colour emotion cards (what you meant, what they felt) sharing one time axis and one playhead. Refuses the generic analytics dashboard and the tab-per-lab-tool layout.

OWN-WORLD: Near-black ground (#0d0d12), white and soft-grey type in Figtree, tabular numerals. Emotion cards are flat saturated fields: happy yellow, surprise pink, sad blue, angry orange-red, fear violet, disgust green, neutral grey; ink-dark text on them. Each emotion also has a fixed shape mark (circle, star, drop, triangle, diamond, hexagon, square). Rounded 16px cards, no gradients, soft real shadows. Plain-language verdicts: Landed, Missed.

STORY: The creator understands in seconds whether the hook, joke and twist landed, sees exactly where colours disagree, and knows what to fix. Fun and casual voice, never at the cost of legibility.

FIRST VIEWPORT: Results at 1440x900. Left column about 470px: tall adaptive video frame with caption and scrub bar. Right: title and giant score top-right, "What you meant" row of colour cards, a match strip (landed / missed), "What they felt" row, colour key, then a moment list with plain-words verdicts. A white playhead runs through both rows, follows the video and seeks on card click. Primary action (Run comparison) sits top of the right column until a result exists.

FORM: Vertical Feed (catalog challenger, user-pinned over the roll), reimagined with an emotion card graph; seed:91df85e997039d09. Position: user-pinned, not on my ordered list.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
