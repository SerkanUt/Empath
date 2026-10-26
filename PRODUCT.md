# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Influencers and creators, first and foremost, who want to test a Reel, Short, TikTok or similar short-form video before posting it. Film researchers, editors, and marketing teams are a secondary audience for longer videos and scenes. Two roles in one session: the creator (or whoever sets up the test) tags the emotions the video is meant to evoke, and "test" viewers' faces are recorded while they watch.

Open: who the test viewers typically are (friends, a small panel, the creator alone) is not yet decided.

## Product Purpose

ReelReaction compares the emotions a video is meant to evoke with the facial reactions of real viewers. For a creator, success means knowing before posting whether the hook, the joke, or the emotional beat lands where intended, and where it falls flat. The same comparison scales to longer videos and film scenes.

## Positioning

Intended-versus-actual comparison on a shared timeline, built on calibrated facial Action Unit (AU) signals rather than bare emotion labels: the tagged emotion, intensity and time ranges are aligned to the viewer's reaction with Dynamic Time Warping (tolerating natural reaction lag), after per-viewer baseline calibration. Real reactions from real faces, not guesses or vanity metrics.

## Operating Context

- Control mode: scrub the video, tag intended emotion, intensity, and time range.
- Test mode: webcam frame every 0.5s while the video plays, logged against the video's timestamp, not wall-clock time; pre-test calibration of the viewer.
- Results: DTW-aligned accuracy score, windowed segment-match score, color-coded timelines, segment match/mismatch table, intensity comparison, AU time series.
- Content: short-form vertical clips (Reels, Shorts, TikToks) first; longer videos and scenes also supported. Videos are uploaded or served from the backend media folder or a URL (YouTube player supported).
- Runs locally: React/Vite frontend, FastAPI backend, py-feat detector, SQLite.

## Capabilities and Constraints

- Local-only: webcam frames go only to the user's own backend; no cloud deployment assumed.
- Data model is scenes (videos) to many test sessions; multi-viewer aggregation, PDF/CSV export, head-pose/attention tracking, and custom emotion taxonomies are out of scope for now.
- English UI only; no i18n requirement.
- Layouts adapt to each video's own aspect ratio (vertical 9:16, square, or landscape); no single orientation is assumed.
- Terminology: the codebase says "scene"; creator-facing wording (e.g. "video", "clip") is an open decision.

## Brand Commitments

Fun and casual in voice and feel, built for creators rather than researchers. Approachable, not clinical. Playful and colourful (confirmed by the user). Fun must never get in the way of reading the results.

## Product Principles

- Creators first: language and flow assume someone with a phone-shot clip and ten minutes, not a lab protocol; depth for researchers stays available, not in the way.
- Intended versus actual is the unit of meaning; every view should make the comparison legible.
- Results must say what to do: where the video lost or surprised people, in plain words.
- The viewer must not be distracted from the video; test-mode UI stays unobtrusive.
- Emotion colors are data encoding: keep them consistent and colorblind-safe across all timelines and results.
- Privacy by locality: never design flows that imply sending faces off the machine.

## Accessibility & Inclusion

Emotion palette must remain distinguishable for colorblind users (data legibility constraint).
