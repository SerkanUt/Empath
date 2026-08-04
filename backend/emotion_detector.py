import base64
import io

import numpy as np
from PIL import Image

_haar_detector = None
_mtcnn_detector = None

FER_EMOTIONS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]
EMOTIONS = FER_EMOTIONS + ["distracted"]


def _get_haar_detector():
    global _haar_detector
    if _haar_detector is None:
        from fer import FER

        _haar_detector = FER(mtcnn=False)
    return _haar_detector


def _get_mtcnn_detector():
    global _mtcnn_detector
    if _mtcnn_detector is None:
        from fer import FER

        _mtcnn_detector = FER(mtcnn=True)
    return _mtcnn_detector


def _detect_faces(image: np.ndarray):
    """Try fast Haar first; fall back to MTCNN when no face is found."""
    results = _get_haar_detector().detect_emotions(image)
    if not results:
        results = _get_mtcnn_detector().detect_emotions(image)
    return results


def _resolve_dominant_emotion(probs: dict) -> str:
    """
    Pick the dominant FER label, with tweaks for known model blind spots.

    FER-7 often labels subtle sadness as neutral because both are low-arousal
    and the winning margin can be tiny (e.g. neutral 0.19 vs sad 0.16).
    """
    dominant = max(FER_EMOTIONS, key=lambda e: probs[e])
    top = probs[dominant]

    if dominant == "neutral":
        sad = probs["sad"]
        # Prefer sad when it's close to neutral and above a minimal floor.
        if sad >= top - 0.07 and sad >= 0.10:
            return "sad"

    fear = probs["fear"]
    if fear >= 0.22:
        return "fear"

    return dominant


def decode_base64_image(image_base64: str) -> np.ndarray:
    """Accepts a data URL or raw base64 string, returns an RGB numpy array."""
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]
    raw = base64.b64decode(image_base64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)


def _empty_probs():
    return {e: 0.0 for e in EMOTIONS}


def detect_emotion_from_array(image: np.ndarray) -> dict:
    """
    Returns:
        {
          "face_detected": bool,
          "dominant_emotion": str | None,
          "emotion_probabilities": {emotion: float, ...} | None
        }
    """
    results = _detect_faces(image)

    if not results:
        probs = _empty_probs()
        probs["distracted"] = 1.0
        return {
            "face_detected": False,
            "dominant_emotion": "distracted",
            "emotion_probabilities": probs,
        }

    def box_area(r):
        _, _, w, h = r["box"]
        return w * h

    best = max(results, key=box_area)
    fer_probs = best["emotions"]
    probs = _empty_probs()
    for e in FER_EMOTIONS:
        probs[e] = float(fer_probs.get(e, 0.0))
    dominant = _resolve_dominant_emotion(probs)

    return {
        "face_detected": True,
        "dominant_emotion": dominant,
        "emotion_probabilities": probs,
        "multiple_faces": len(results) > 1,
    }


def detect_emotion_from_base64(image_base64: str) -> dict:
    image = decode_base64_image(image_base64)
    return detect_emotion_from_array(image)
