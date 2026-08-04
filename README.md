# ReelReaction — Emotion Testing for Film Scenes

A working v1 of the tool from the spec: a "control" person tags the emotions
a scene is meant to evoke, a "test" viewer's actual facial reaction is
recorded via webcam while they watch, and the two are compared with a
DTW-aligned accuracy score plus a color-coded emotion timeline.

## What's implemented (v1)

- **Control mode**: scrub through a scene, tag intended emotion + intensity + time range.
- **Test mode**: webcam captures a frame every 0.5s while the scene plays, sent to the backend for emotion classification (via the `fer` package — a pretrained model, nothing trained from scratch), logged against the video's own timestamp (not wall-clock time).
- **Scoring**: `backend/scoring.py` resamples both curves and aligns them with Dynamic Time Warping (handles natural reaction lag of a few seconds), producing a DTW-based accuracy score. A separate, more literal "windowed segment match" score is also computed per intended-emotion segment.
- **Visualization**: color-coded horizontal timelines for both curves, plus a segment-by-segment match/mismatch table.
- **Persistence**: SQLite (`backend/emotion_tester.db`, created automatically on first run).

## What's deliberately out of scope for v1

These were flagged as open questions/future work in the original spec — not built yet, but the data model (scenes → many test sessions) is already shaped to support them later:

- Video file upload — for now, point a scene at a video URL or a path served by a static file server (see below).
- Multi-viewer aggregation (heatmap across many test viewers).
- Client-side (in-browser) emotion inference — currently server-side, which is simpler to get running reliably but sends webcam frames to your own backend. Nothing leaves your machine if you run this locally, but see the privacy note below if you ever deploy this beyond localhost.
- Attention/head-pose tracking, PDF/CSV export, custom emotion taxonomies.

## Setup

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # on Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

First install will pull TensorFlow (for the `fer` package's emotion model) — it's a big dependency, this is normal and only needs to happen once.

The API will be live at `http://localhost:8000`. Visit `http://localhost:8000/` — you should see `{"status": "ok"}`.

### 2. Serve your scene video files

Since v1 doesn't have upload handling, put your video files somewhere reachable by URL. Easiest option — serve a local folder:

```bash
cd /path/to/your/video/files
python3 -m http.server 9000
```

Then use `http://localhost:9000/scene1.mp4` as the video URL when creating a scene.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend at `localhost:8000` (see `vite.config.js`) so you don't hit CORS issues locally.

## Using it

1. **Scenes tab** — add a scene (title, video URL, duration in seconds).
2. **Control tab** — play the scene, click an emotion button when the intended feeling should start, click "End tag" when it should end. Repeat for every beat you care about, then save.
3. **Test tab** — start the webcam, play the scene straight through (don't skip around — pauses/seeks are logged but excluded from scoring by default via the windowing logic). Save when done.
4. **Results tab** — pick a control session and a test session, run the comparison, read the accuracy scores and timeline.

## Where to extend this next

- **Video upload**: add a `POST /scenes/upload` endpoint using FastAPI's `UploadFile`, save to a local `media/` folder, serve it via `StaticFiles`, and point `video_url` at that instead of an external URL.
- **Multi-viewer aggregation**: `database.list_test_sessions(scene_id)` already returns every test session for a scene — the aggregation math (average curve, per-viewer agreement %) can build directly on `scoring.build_observed_curve`, just averaged across sessions instead of scored one at a time.
- **Client-side inference**: swap the webcam capture in `TestMode.jsx` to run a JS model (e.g. `face-api.js`) locally in the browser instead of POSTing frames to `/detect-emotion` — better latency and privacy, more setup work.
- **DTW tuning**: `scoring.dtw_align`'s `max_warp_seconds` (currently 3s) controls how much reaction lag is tolerated before it counts as a genuine mismatch — adjust per your test audience/genre.

## Privacy note

Facial emotion data is biometric data. This v1 sends webcam frames to your own local backend for classification and stores only the derived emotion labels + probabilities (not the frames themselves) in the database — frames aren't persisted anywhere. If you ever deploy this beyond your own machine for real test viewers, add an explicit consent step before test mode starts, and a way for viewers to delete their session afterward.
# Empath
