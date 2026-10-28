"""
Wraps a pretrained facial expression recognition model.

Uses py-feat Detectorv2 (RetinaFace + multitask expression model) for face
detection, 7-class emotions, head pose, and gaze. The return shape is what the
rest of the app depends on, not the underlying library.
"""

import base64
import io
import math
import os
import threading
import re
import tempfile

import numpy as np
from PIL import Image

_detector = None
_au_schema_cache = None

FER_EMOTIONS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]
DERIVED_EMOTIONS = ["focus"]
EMOTIONS = FER_EMOTIONS + DERIVED_EMOTIONS + ["distracted"]

# --- focus (derived) from Action Units ---------------------------------
# Heuristic score — not a validated py-feat emotion. Tune weights after reviewing
# real footage; each weight controls that AU's contribution to the 0–5 intensity.
FOCUS_AU_WEIGHTS = {
    "AU04": 0.45,  # brow lowerer
    "AU07": 0.35,  # lid tightener
    "AU14": 0.20,  # dimpler / asymmetric lip pull
}
AU_INTENSITY_SUFFIX = "_r"
AU_PRESENCE_SUFFIX = "_c"
AU_CODE_PATTERN = re.compile(r"^AU\d{2}$")
FOCUS_INTENSITY_SCALE = 5.0
FOCUS_TRACKED_AUS = tuple(FOCUS_AU_WEIGHTS.keys())

# py-feat column names → app labels
PYFEAT_EMOTION_MAP = {
    "Anger": "angry",
    "Disgust": "disgust",
    "Fear": "fear",
    "Happy": "happy",
    "Sad": "sad",
    "Surprise": "surprise",
    "Neutral": "neutral",
}

# Head pose / gaze thresholds (radians) for "looking away" → distracted.
HEAD_YAW_THRESHOLD = 0.45
HEAD_PITCH_THRESHOLD = 0.40
GAZE_YAW_THRESHOLD = 0.50
GAZE_PITCH_THRESHOLD = 0.50

# py-feat often over-reads subtle smiles; compress happy probabilities.
HAPPY_DAMPEN_EXPONENT = 1.5
HAPPY_DAMPEN_SCALE = 0.85
HAPPY_DISPLAY_CAP = 0.85


_detector_lock = threading.RLock()
_detect_lock = threading.Lock()


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
    with _detector_lock:
        if _detector is None:
            from feat import Detectorv2

            # Skip identity embeddings — faster load, one less non-commercial branch.
            _detector = Detectorv2(device=_pick_device(), identity_model=None)
    return _detector


def discover_au_schema(columns) -> dict:
    """
    Infer intensity and presence columns from py-feat output at runtime.

    Prefers OpenFace-style AU##_r (0–5) when present; otherwise plain AU## (0–1)
    from Detectorv2. Presence AU##_c columns are tracked separately when exported.
    """
    col_list = list(columns)
    intensity_cols = {}
    presence_cols = {}

    for col in col_list:
        if col.endswith(AU_INTENSITY_SUFFIX):
            au = col[: -len(AU_INTENSITY_SUFFIX)]
            if AU_CODE_PATTERN.match(au):
                intensity_cols[au] = col
        elif col.endswith(AU_PRESENCE_SUFFIX):
            au = col[: -len(AU_PRESENCE_SUFFIX)]
            if AU_CODE_PATTERN.match(au):
                presence_cols[au] = col

    if not intensity_cols:
        for col in col_list:
            if AU_CODE_PATTERN.match(col):
                intensity_cols[col] = col

    au_codes = sorted(intensity_cols.keys())
    return {
        "au_codes": au_codes,
        "intensity_columns": intensity_cols,
        "presence_columns": presence_cols,
        "intensity_scale": FOCUS_INTENSITY_SCALE,
        "uses_regression_columns": any(
            c.endswith(AU_INTENSITY_SUFFIX) for c in intensity_cols.values()
        ),
    }


def _get_au_schema(columns):
    global _au_schema_cache
    if _au_schema_cache is None:
        _au_schema_cache = discover_au_schema(columns)
    return _au_schema_cache


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


def _row_has(row, column: str) -> bool:
    try:
        return column in row.index
    except AttributeError:
        return column in row


def _read_au_intensity(row, au_code: str, schema: dict) -> float:
    """
    Read AU intensity on a 0–5 scale.
    Uses AU##_r when the model exports it; otherwise scales plain AU## from 0–1.
    """
    col = schema["intensity_columns"].get(au_code)
    if col and _row_has(row, col):
        raw = _safe_float(row.get(col))
        if col.endswith(AU_INTENSITY_SUFFIX):
            return min(FOCUS_INTENSITY_SCALE, max(0.0, raw))
        return min(FOCUS_INTENSITY_SCALE, max(0.0, raw * FOCUS_INTENSITY_SCALE))

    r_col = f"{au_code}{AU_INTENSITY_SUFFIX}"
    if _row_has(row, r_col):
        return min(FOCUS_INTENSITY_SCALE, max(0.0, _safe_float(row.get(r_col))))
    if _row_has(row, au_code):
        return min(
            FOCUS_INTENSITY_SCALE,
            max(0.0, _safe_float(row.get(au_code)) * FOCUS_INTENSITY_SCALE),
        )
    return 0.0


def _au_frame_from_row(row, schema: dict) -> dict:
    """Per-frame AU intensities (0–5) and optional presence (_c) flags."""
    intensities = {}
    presence = {}
    for au in schema["au_codes"]:
        intensities[au] = _read_au_intensity(row, au, schema)
        p_col = schema["presence_columns"].get(au) or f"{au}{AU_PRESENCE_SUFFIX}"
        if _row_has(row, p_col):
            presence[au] = _safe_float(row.get(p_col))
    return {"intensities": intensities, "presence": presence}


def compute_focus_intensity_from_intensities(intensities: dict) -> float:
    """Weighted AU04/AU07/AU14 combination on the 0–5 scale."""
    total_weight = sum(FOCUS_AU_WEIGHTS.values())
    if total_weight <= 0:
        return 0.0
    weighted = sum(
        weight * _safe_float(intensities.get(au, 0.0))
        for au, weight in FOCUS_AU_WEIGHTS.items()
    )
    return min(FOCUS_INTENSITY_SCALE, max(0.0, weighted / total_weight))


def _compute_focus_intensity(row, schema: dict = None) -> float:
    if schema is None:
        frame = _au_frame_from_row(row, discover_au_schema(row.index))
    else:
        frame = _au_frame_from_row(row, schema)
    return compute_focus_intensity_from_intensities(frame["intensities"])


def _action_units_from_frame(frame: dict) -> dict:
    """Legacy flat dict: AU codes plus AU##_c keys for backwards compatibility."""
    flat = dict(frame.get("intensities") or {})
    for au, flag in (frame.get("presence") or {}).items():
        flat[f"{au}{AU_PRESENCE_SUFFIX}"] = flag
    return flat


def _probs_from_row(row, schema: dict) -> dict:
    probs = _empty_probs()
    for pyfeat_name, app_name in PYFEAT_EMOTION_MAP.items():
        probs[app_name] = _safe_float(row.get(pyfeat_name))
    probs = _adjust_probs(probs)
    focus_intensity = _compute_focus_intensity(row, schema)
    probs["focus"] = focus_intensity / FOCUS_INTENSITY_SCALE
    return probs


def decode_base64_image(image_base64: str) -> np.ndarray:
    """Accepts a data URL or raw base64 string, returns an RGB numpy array."""
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except (ValueError, OSError) as e:
        raise ValueError(f"invalid image data: {e}") from e
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
          "emotion_probabilities": {emotion: float, ...} | None,
          "au_intensities": {AU##: float, ...},      # 0–5 per frame
          "au_presence": {AU##: float, ...},         # _c flags when available
          "au_schema": {...},                          # discovered column mapping
          "focus_intensity": float,                    # derived 0–5
          "action_units": {...},                       # legacy flat shape
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
        with _detect_lock:
            fex = detector.detect(tmp_path, data_type="image")
    finally:
        os.unlink(tmp_path)

    if fex is None or len(fex) == 0:
        return _distracted_result()

    best_idx = _pick_largest_face_index(fex)
    row = fex.iloc[best_idx]
    schema = _get_au_schema(fex.columns)

    if _is_looking_away(row):
        return _distracted_result()

    au_frame = _au_frame_from_row(row, schema)
    probs = _probs_from_row(row, schema)
    if any(isinstance(v, float) and math.isnan(v) for v in probs.values()):
        return _distracted_result()
    dominant = _resolve_dominant_emotion(probs)
    focus_intensity = probs["focus"] * FOCUS_INTENSITY_SCALE

    return {
        "face_detected": True,
        "dominant_emotion": dominant,
        "emotion_probabilities": probs,
        "focus_intensity": focus_intensity,
        "focus_derived": True,
        "au_intensities": au_frame["intensities"],
        "au_presence": au_frame["presence"],
        "au_schema": schema,
        "action_units": _action_units_from_frame(au_frame),
        "multiple_faces": len(fex) > 1,
    }


def detect_emotion_from_base64(image_base64: str) -> dict:
    image = decode_base64_image(image_base64)
    return detect_emotion_from_array(image)
