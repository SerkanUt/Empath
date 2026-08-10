
import base64
import io
import math
import os
import tempfile

import numpy as np
from PIL import Image

_detector = None

FER_EMOTIONS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]
EMOTIONS = FER_EMOTIONS + ["distracted"]


PYFEAT_EMOTION_MAP = {
    "Anger": "angry",
    "Disgust": "disgust",
    "Fear": "fear",
    "Happy": "happy",
    "Sad": "sad",
    "Surprise": "surprise",
    "Neutral": "neutral",
}


HEAD_YAW_THRESHOLD = 0.45
HEAD_PITCH_THRESHOLD = 0.40
GAZE_YAW_THRESHOLD = 0.50
GAZE_PITCH_THRESHOLD = 0.50


HAPPY_DAMPEN_EXPONENT = 1.5
HAPPY_DAMPEN_SCALE = 0.85
HAPPY_DISPLAY_CAP = 0.85


def _pick_device() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def _get_detector():
    global _detector
    if _detector is None:
        from feat import Detectorv2


        _detector = Detectorv2(device=_pick_device(), identity_model=None)
    return _detector


def _adjust_probs(probs: dict) -> dict:
    adjusted = dict(probs)
    happy = adjusted["happy"]
    adjusted["happy"] = min(happy ** HAPPY_DAMPEN_EXPONENT * HAPPY_DAMPEN_SCALE, HAPPY_DISPLAY_CAP)
    return adjusted


def _resolve_dominant_emotion(probs: dict) -> str:
    dominant = max(FER_EMOTIONS, key=lambda e: probs[e])
    top = probs[dominant]

    if dominant == "neutral":
        sad = probs["sad"]
        if sad >= top - 0.07 and sad >= 0.10:
            return "sad"

    if dominant == "happy":
        neutral = probs["neutral"]
        if top < 0.42 or (neutral >= top - 0.06 and neutral >= 0.12):
            return "neutral"

    fear = probs["fear"]
    if fear >= 0.22:
        return "fear"

    return dominant


def _safe_float(value, default=0.0) -> float:
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _is_looking_away(row) -> bool:
    yaw = abs(_safe_float(row.get("Yaw")))
    pitch = abs(_safe_float(row.get("Pitch")))
    if yaw > HEAD_YAW_THRESHOLD or pitch > HEAD_PITCH_THRESHOLD:
        return True

    gaze_yaw = abs(_safe_float(row.get("gaze_yaw")))
    gaze_pitch = abs(_safe_float(row.get("gaze_pitch")))
    if gaze_yaw > GAZE_YAW_THRESHOLD or gaze_pitch > GAZE_PITCH_THRESHOLD:
        return True

    return False


def _pick_largest_face_index(fex) -> int:
    if len(fex) == 1:
        return 0
    areas = (
        fex["FaceRectWidth"].astype(float).to_numpy() * fex["FaceRectHeight"].astype(float).to_numpy()
    )
    return int(np.argmax(areas))


def _probs_from_row(row) -> dict:
    probs = _empty_probs()
    for pyfeat_name, app_name in PYFEAT_EMOTION_MAP.items():
        probs[app_name] = _safe_float(row.get(pyfeat_name))
    return _adjust_probs(probs)


def decode_base64_image(image_base64: str) -> np.ndarray:
    """Accepts a data URL or raw base64 string, returns an RGB numpy array."""
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]
    raw = base64.b64decode(image_base64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)


def _empty_probs():
    return {e: 0.0 for e in EMOTIONS}


def _distracted_result():
    probs = _empty_probs()
    probs["distracted"] = 1.0
    return {
        "face_detected": False,
        "dominant_emotion": "distracted",
        "emotion_probabilities": probs,
    }

def detect_emotion_from_array(image: np.ndarray) -> dict:
    """
    Returns:
        {
          "face_detected": bool,
          "dominant_emotion": str | None,
          "emotion_probabilities": {emotion: float, ...} | None
        }
    """
    if image.dtype != np.uint8:
        image = image.astype(np.uint8)

    detector = _get_detector()

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        Image.fromarray(image).save(tmp.name)
        tmp_path = tmp.name

    try:
        os.environ.setdefault("TQDM_DISABLE", "1")
        fex = detector.detect(tmp_path, data_type="image")
    finally:
        os.unlink(tmp_path)

    if fex is None or len(fex) == 0:
        return _distracted_result()

    best_idx = _pick_largest_face_index(fex)
    row = fex.iloc[best_idx]

    if _is_looking_away(row):
        return _distracted_result()

    probs = _probs_from_row(row)
    dominant = _resolve_dominant_emotion(probs)

    return {
        "face_detected": True,
        "dominant_emotion": dominant,
        "emotion_probabilities": probs,
        "multiple_faces": len(fex) > 1,
    }


def detect_emotion_from_base64(image_base64: str) -> dict:
    image = decode_base64_image(image_base64)
    return detect_emotion_from_array(image)
