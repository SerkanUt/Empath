---
name: ReelReaction
description: A dark room where colour is the emotion, every colour carries a shape and a word, and one playhead runs through what you meant and what they felt.
colors:
  ground: "#0d0d12"
  panel: "#15151d"
  panel-raised: "#1d1d28"
  border: "#2c2c3a"
  border-strong: "#4a4a5e"
  text: "#f2f1f7"
  text-dim: "#b4b3c2"
  ink: "#14141c"
  danger: "#ff9a8a"
  emotion-angry: "#ff6b4a"
  emotion-disgust: "#8fc16a"
  emotion-fear: "#a78bfa"
  emotion-happy: "#ffd23f"
  emotion-sad: "#5aa2ff"
  emotion-surprise: "#ff7eb6"
  emotion-neutral: "#9a99a8"
  emotion-focus: "#4fd1c5"
  emotion-distracted: "#c9b27c"
typography:
  display:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "clamp(64px, 8vw, 104px)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "clamp(28px, 3vw, 40px)"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 900
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  subtitle:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.5
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  lede:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "0.06em"
rounded:
  md: "12px"
  card: "16px"
  lg: "20px"
  video: "24px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "28px"
  xl: "56px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "13px 26px"
  button-primary-hover:
    backgroundColor: "#ffffff"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "11px 24px"
  nav-tab:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  nav-tab-active:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "28px"
  input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  emotion-card:
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px 14px"
    height: "92px"
  emotion-button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
---

# Design System: ReelReaction

## Overview

**Creative North Star: "The Colour Verdict"**

The build is a near-black room (ground `#0d0d12`) in which the only saturated things are emotions. Chrome, type and controls are white and soft grey; every saturated field on screen is data. A viewer reads the page by colour first, then confirms by shape and word. The Results screen is the system's centre of gravity: the video sits at left, and at right two rows of flat emotion cards ("What you meant", "What they felt") share one time axis and one white playhead, with a Landed / Missed strip between them.

The voice is casual and plain (Figtree at weight 900 for headings, "Did it land?", "Wanted surprise, got neutral"), but the surface is disciplined: flat colour fields, ink-dark text on them, soft real shadows, no gradients in the authored CSS. Fun lives in the colours and the wording, never in decoration that competes with reading the result.

Colour is data encoding. Each emotion has one hex, one fixed shape, and a text label, and the three travel together everywhere an emotion appears.

**Key Characteristics:**
- Dark ground, light chrome, saturated emotion fields as the only colour.
- Pill-shaped controls, rounded rectangles for content, a large radius on video.
- Flat fills with one soft shadow; depth by tonal layering of three dark surfaces.
- Tabular numerals globally; huge heavy score numeral as the single display moment.
- Every emotion mark = colour + shape + label.

## Colors

A monochrome cool-ink interface carrying a nine-colour emotion palette that is the only chromatic voice.

### Primary
- **Paper White** (`text`, #f2f1f7): body text, the primary button fill, active tab fill, focus ring, playhead, selected borders. The interface's only "accent" is white; it marks action and current position.

### Secondary (emotion encoding; reserved for data)
- **Surprise Pink** (`emotion-surprise`, #ff7eb6), **Happy Yellow** (`emotion-happy`, #ffd23f), **Sad Blue** (`emotion-sad`, #5aa2ff), **Angry Orange-Red** (`emotion-angry`, #ff6b4a), **Fear Violet** (`emotion-fear`, #a78bfa), **Disgust Green** (`emotion-disgust`, #8fc16a), **Neutral Grey** (`emotion-neutral`, #9a99a8). The seven native emotions.
- **Focus Teal** (`emotion-focus`, #4fd1c5) and **Distracted Sand** (`emotion-distracted`, #c9b27c): derived states, labelled "(derived)" where applicable. Same source of truth in `frontend/src/emotions.js` (`EMOTION_COLORS`) and the `--e-*` custom properties in `styles.css`.
- Ink on every emotion fill is **Night Ink** (`ink`, #14141c), which holds contrast on all nine.

### Neutral
- **Night Ground** (`ground`, #0d0d12): page.
- **Panel** (`panel`, #15151d) and **Raised Panel** (`panel-raised`, #1d1d28): the two tonal steps for containers, inputs, tabs and rows.
- **Hairline** (`border`, #2c2c3a) and **Strong Hairline** (`border-strong`, #4a4a5e): dividers, tracks, secondary-button and dropzone outlines.
- **Dim Text** (`text-dim`, #b4b3c2): secondary copy, labels, axes.
- **Miss Coral** (`danger`, #ff9a8a): the "Missed" verdict, errors, destructive outline buttons. Always paired with a dashed rule or the word, never colour alone.

### Named Rules
**The Three-Signal Rule.** An emotion is never colour alone: hex from `EMOTION_COLORS`, path from `EMOTION_SHAPES`, and its name in text. Circle happy, star surprise, drop sad, triangle angry, diamond fear, hexagon disgust, square neutral, ring focus, bar distracted.
**The Saturation Is Data Rule.** Saturated hues on screen mean an emotion. Chrome stays white and grey.
**The Ink-On-Colour Rule.** Text and marks on an emotion fill are `ink`, never white.

## Typography

**Display / Body Font:** Figtree (400-900, loaded from Google Fonts) with system-ui, sans-serif fallback. One family throughout.

**Character:** Friendly geometric sans pushed to its heaviest weight for headings and numerals, with ordinary 400-600 weights for reading. Tabular numerals are on for the whole body so times and scores align.

### Hierarchy
- **Display** (900, clamp(64px, 8vw, 104px), 0.9, -0.04em): the match score only.
- **Headline** (900, clamp(28px, 3vw, 40px), 1.1, -0.02em): page question ("Did it land?"), setup headings.
- **Title** (900, 26px, -0.02em): wordmark and panel headings.
- **Subtitle** (800, 18-22px): section subheads, card names (18px/900), video caption.
- **Body** (400-600, 15-16px, 1.5): UI text; lede 18px capped at 62ch; status lines 14px capped at 70ch.
- **Label** (800, 13px, 0.06em, uppercase): names of the two card lanes; table headers use 12px/700/0.05em uppercase.

### Named Rules
**The Heavy-Or-Plain Rule.** Headings and numerals go to 800-900; everything else stays at 400-700. No middle display weights.
**The Name Beats Size Rule.** In narrow cards the name rotates to vertical text at 13px rather than dropping, so the label never disappears with the colour.

## Layout

Single shell, max-width 1360px, padding 28px 40px (20px 20px under 1000px). Top bar: wordmark left, step tabs right. The Results and split screens use a two-column grid: a video column `minmax(280px, 440px)` and a flexible main column, 56px gap, video sticky at top 24px. Under 1000px it stacks to one column (gap 28px) and tabs become a horizontal scroller; under 720px the live and calibration grids collapse to one column and moment rows drop the status to a second line. Setup flows are single columns capped at 760px (1040px wide variant).

Spacing in use: 8, 12, 16, 20, 28, 56px, with 10 and 14 as in-component fine steps. Cards are positioned absolutely on a percentage time axis inside a 92px-tall row (container-query aware), so width equals duration. The video frame adopts the video's own aspect ratio (tall, square, wide), capped at min(76vh, 820px).

## Elevation & Depth

Hybrid, mostly tonal. Depth is three dark steps (ground, panel, raised panel) plus hairlines. One soft shadow vocabulary exists and is reserved for things that sit above the surface: cards and video.

### Shadow Vocabulary
- **Card shadow** (`box-shadow: 0 6px 18px rgba(0,0,0,0.35)`): emotion cards, tag cards, video.
- **Card lift** (`box-shadow: 0 12px 24px rgba(0,0,0,0.45)` with `translateY(-3px)`): emotion card hover.
- **Playhead halo** (`0 0 0 2px rgba(13,13,18,0.6)`): separates the white playhead from coloured cards.

### Named Rules
**The Soft Shadow Only Rule.** Shadows are blurred and dark; no offset, hard or coloured shadows.
**The Flat Fill Rule.** Emotion fields are single flat colours. No gradients on emotion colours.

## Shapes

Rounded and friendly with a size hierarchy: pills (999px) for every button, tab and chip; 12px for inputs, rows and small blocks; 16px for emotion cards; 20px for panels and webcam; 24px for video frames. Emotion marks are solid 24x24 glyph paths drawn from `EMOTION_SHAPES`, sized 16-18px, filled in the emotion colour or in `ink` on a card. Selection and landed/missed use rules (3px solid white = landed, 3px dashed coral = missed) rather than fills. Dashed 2px borders mark the upload zone only.

## Components

### Buttons
- **Shape:** full pill (999px).
- **Primary:** paper-white fill, ink text, 13px 26px padding, 800 weight, 15px. Hover turns pure white and lifts 1px; disabled is 40% opacity.
- **Secondary:** transparent, 2px strong hairline, white text, 11px 24px, 700. Hover brightens border to white.
- **Danger outline:** small (6px 14px, 13px), coral text; border goes coral on hover.

### Step tabs
Raised-panel pills with dim text; active = white fill with ink text; completed = white text; unavailable = 40% opacity.

### Emotion cards (signature)
Flat emotion-colour rectangle, 16px radius, ink text, 12px 14px padding, card shadow. Contains the shape in ink, the name (18px/900 capitalised) and start time (13px/700, 80% opacity). Narrow cards (<9% of duration) drop the time and rotate the name; on small containers all but wide cards do. Click seeks the video; hover lifts 3px. Entry: 0.6s rise-and-fade staggered 45ms per card.

### Emotion picker buttons
Raised-panel tiles, 12px radius, shape + name. Filled variant takes the emotion colour with ink text; active adds a 3px white outline.

### Inputs / Fields
Raised-panel fill, 2px transparent border (hairline on hover), 12px radius, 12px 14px padding. Focus replaces the outline with a white 2px border. Labels 14px/600 dim, above the field.

### Panels and rows
Panel: 20px radius, 28px padding on `panel`. Rows (tags, scene chips, moments): `panel-raised` or hairline-separated, 12px radius or none.

### Match strip and playhead
A 34px strip between lanes: a 3px rule above each segment with "Landed" (white) or "Missed" (coral, dashed rule). A 3px white playhead with dark halo crosses both lanes and follows video time.

### Intensity charts
SVG on a `panel` card: dashed hairline grid, control line dashed dim grey, observed line solid white 3px, intended bars outlined in white, observed bars in emotion colour.

## Do's and Don'ts

### Do:
- **Do** pair every emotion colour with its fixed shape and a text label.
- **Do** use `ink` (#14141c) for text and marks on emotion fills.
- **Do** keep chrome white and grey so saturated colour always means an emotion.
- **Do** read colours from `EMOTION_COLORS` / `--e-*`; read shapes from `EMOTION_SHAPES`.
- **Do** use pills for buttons and tabs, 16px for emotion cards, 24px for video.
- **Do** make Landed and Missed legible without colour (word plus solid vs dashed rule).
- **Do** keep the webcam preview small (220px) and quiet during Watch.

### Don't:
- **Don't** use an emotion colour for decoration or branding; it reads as data.
- **Don't** use gradients, hard offset shadows, or coloured shadows.
- **Don't** put white text on an emotion fill.
- **Don't** mix a second typeface or intermediate display weights.
- **Don't** build a generic analytics dashboard of stat tiles; the comparison is the two-lane card graph.

## Not canonized (build carries these)

- Wordmark colours "Reaction" with `--e-happy` yellow, spending a data colour on brand.
- Miss Coral (#ff9a8a) sits close to Angry Orange-Red (#ff6b4a).
- Glyph "+" and "–" generated via CSS `content` for the More detail toggle.
- Off-token literals: hover surfaces #2a2a38 and #25253a, placeholder #8f8ea0, `#fff`, `#000`; 10-12px chart text.
- Legacy `.timeline` strip kept in CSS for `Timeline.jsx`; many inline `style={{}}` margins in PreTestCalibration, LiveDetector, ControlMode.
