import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database
import scoring
from emotion_detector import detect_emotion_from_base64

MEDIA_DIR = Path(__file__).parent / "media"
MEDIA_DIR.mkdir(exist_ok=True)

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov", ".m4v"}

app = FastAPI(title="Emotion Film Tester API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

database.init_db()

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


def _check_detector_dependencies():
    """Fail fast with a clear message if py-feat is missing from this Python."""
    try:
        import feat  # noqa: F401
    except ImportError as e:
        raise RuntimeError(
            "py-feat is not installed for the Python running this server. "
            "Stop uvicorn, run `conda activate emotion-film`, then "
            "`python -m pip install -r requirements.txt`, and start with "
            "`python -m uvicorn main:app --reload --port 8000` (or `./run.sh`)."
        ) from e


@app.on_event("startup")
def verify_dependencies():
    _check_detector_dependencies()


def get_video_duration(path: Path) -> Optional[float]:
    try:
        from moviepy.editor import VideoFileClip

        with VideoFileClip(str(path)) as clip:
            return round(clip.duration, 2)
    except Exception:
        return None


# Request response models
class SceneCreate(BaseModel):
    title: str
    video_url: str
    duration: float


class ControlTag(BaseModel):
    start_time: float
    end_time: float
    emotion: str
    intensity: int = 3


class ControlSessionCreate(BaseModel):
    tags: List[ControlTag]
    created_by: Optional[str] = None


class EmotionSample(BaseModel):
    timestamp: float
    dominant_emotion: Optional[str] = None
    emotion_probabilities: Optional[dict] = None
    face_detected: bool = False


class PauseEvent(BaseModel):
    timestamp: float
    action: str


class CalibrationResult(BaseModel):
    emotion: str
    peak_probability: float
    intensity: int
    youtube_id: Optional[str] = None
    sample_count: Optional[int] = None
    mode: Optional[str] = None
    emotions: Optional[List[str]] = None
    peaks: Optional[dict] = None
    intensities: Optional[dict] = None


class TestSessionCreate(BaseModel):
    samples: List[EmotionSample]
    pause_events: Optional[List[PauseEvent]] = []
    viewer_label: Optional[str] = None
    calibration: Optional[CalibrationResult] = None


class DetectRequest(BaseModel):
    image_base64: str


class CalibrationSessionCreate(BaseModel):
    viewer_label: str
    calibration: CalibrationResult


class ScoreRequest(BaseModel):
    test_session_id: int
    control_session_id: int


# scenes

@app.post("/scenes/upload")
async def upload_scene_video(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        supported = ", ".join(sorted(ext.lstrip(".") for ext in ALLOWED_VIDEO_EXTENSIONS))
        raise HTTPException(400, f"Unsupported video format. Supported: {supported}")

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = MEDIA_DIR / safe_name

    try:
        with dest.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        await file.close()

    duration = get_video_duration(dest)

    return {
        "video_url": f"/api/media/{safe_name}",
        "duration": duration,
        "filename": file.filename,
    }


@app.post("/scenes")
def create_scene(scene: SceneCreate):
    scene_id = database.create_scene(scene.title, scene.video_url, scene.duration)
    return database.get_scene(scene_id)


@app.get("/scenes")
def list_scenes():
    return database.list_scenes()


@app.get("/scenes/{scene_id}")
def get_scene(scene_id: int):
    scene = database.get_scene(scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return scene


# control sessions

@app.post("/scenes/{scene_id}/control-sessions")
def create_control_session(scene_id: int, body: ControlSessionCreate):
    if not database.get_scene(scene_id):
        raise HTTPException(404, "Scene not found")
    tags = [t.dict() for t in body.tags]
    session_id = database.create_control_session(scene_id, tags, body.created_by)
    return database.get_control_session(session_id)


@app.get("/scenes/{scene_id}/control-sessions")
def list_control_sessions(scene_id: int):
    return database.list_control_sessions(scene_id)


@app.get("/control-sessions/{session_id}")
def get_control_session(session_id: int):
    session = database.get_control_session(session_id)
    if not session:
        raise HTTPException(404, "Control session not found")
    return session


#calibration sessions

@app.post("/scenes/{scene_id}/calibration-sessions")
def create_calibration_session(scene_id: int, body: CalibrationSessionCreate):
    if not database.get_scene(scene_id):
        raise HTTPException(404, "Scene not found")
    calibration = body.calibration.dict()
    session_id = database.create_calibration_session(scene_id, body.viewer_label, calibration)
    return database.get_calibration_session(session_id)


@app.get("/scenes/{scene_id}/calibration-sessions")
def list_calibration_sessions(scene_id: int):
    return database.list_calibration_sessions(scene_id)


@app.get("/calibration-sessions/{session_id}")
def get_calibration_session(session_id: int):
    session = database.get_calibration_session(session_id)
    if not session:
        raise HTTPException(404, "Calibration session not found")
    return session


# test sessions

@app.post("/scenes/{scene_id}/test-sessions")
def create_test_session(scene_id: int, body: TestSessionCreate):
    if not database.get_scene(scene_id):
        raise HTTPException(404, "Scene not found")
    samples = [s.dict() for s in body.samples]
    pause_events = [p.dict() for p in (body.pause_events or [])]
    calibration = body.calibration.dict() if body.calibration else None
    session_id = database.create_test_session(
        scene_id, samples, pause_events, body.viewer_label, calibration
    )
    return database.get_test_session(session_id)


@app.get("/scenes/{scene_id}/test-sessions")
def list_test_sessions(scene_id: int):
    return database.list_test_sessions(scene_id)


@app.get("/test-sessions/{session_id}")
def get_test_session(session_id: int):
    session = database.get_test_session(session_id)
    if not session:
        raise HTTPException(404, "Test session not found")
    return session


# live emotion detection

@app.post("/detect-emotion")
def detect_emotion(body: DetectRequest):
    try:
        return detect_emotion_from_base64(body.image_base64)
    except Exception as e:
        raise HTTPException(400, f"Could not process frame: {e}")


# scoring

@app.post("/score")
def score(body: ScoreRequest):
    test_session = database.get_test_session(body.test_session_id)
    control_session = database.get_control_session(body.control_session_id)
    if not test_session:
        raise HTTPException(404, "Test session not found")
    if not control_session:
        raise HTTPException(404, "Control session not found")

    scene = database.get_scene(test_session["scene_id"])
    duration = scene["duration"]

    result = scoring.compute_score(
        control_session["tags"],
        test_session["samples"],
        duration,
        calibration=test_session.get("calibration"),
    )
    result_id = database.save_score_result(body.test_session_id, body.control_session_id, result)
    result["id"] = result_id
    result["scene"] = scene
    return result


@app.get("/")
def health():
    return {"status": "ok"}
