"""Unit tests for AU time series normalization and DTW curve building."""

import au_timeseries
import scoring
from emotion_detector import discover_au_schema


def _sample(ts, aus, focus=None, face=True):
    return {
        "timestamp": ts,
        "face_detected": face,
        "dominant_emotion": "neutral" if face else "distracted",
        "au_intensities": dict(aus),
        "focus_intensity": focus,
    }


def test_discover_au_schema_regression_columns():
    cols = ["AU06_r", "AU12_r", "AU06_c", "AU12_c", "Happy"]
    schema = discover_au_schema(cols)
    assert schema["au_codes"] == ["AU06", "AU12"]
    assert schema["uses_regression_columns"] is True
    assert schema["presence_columns"]["AU06"] == "AU06_c"


def test_discover_au_schema_plain_detectorv2_columns():
    cols = ["AU04", "AU07", "AU14", "Happy"]
    schema = discover_au_schema(cols)
    assert schema["au_codes"] == ["AU04", "AU07", "AU14"]
    assert schema["uses_regression_columns"] is False


def test_session_zscore_normalization():
    samples = [
        _sample(0.0, {"AU06": 1.0, "AU12": 2.0}, focus=1.5),
        _sample(0.5, {"AU06": 3.0, "AU12": 4.0}, focus=3.5),
        _sample(1.0, {"AU06": 5.0, "AU12": 6.0}, focus=5.5),
    ]
    ts = au_timeseries.build_au_timeseries(samples, duration=1.5, normalization="zscore")
    au06 = [row["intensities"]["AU06"] for row in ts["rows"]]
    assert abs(sum(au06) / len(au06)) < 0.01
    focus_vals = [row["focus"] for row in ts["rows"]]
    assert max(focus_vals) > min(focus_vals)


def test_presence_gating():
    samples = [
        {
            "timestamp": 0.0,
            "face_detected": True,
            "dominant_emotion": "neutral",
            "au_intensities": {"AU06": 4.0},
            "au_presence": {"AU06": 0.0},
        }
    ]
    ts = au_timeseries.build_au_timeseries(
        samples, duration=1.0, normalization="none", gate_by_presence=True
    )
    assert ts["rows"][0]["intensities_raw"]["AU06"] == 0.0


def test_combined_dtw_score_includes_au_curves():
    tags = [{"start_time": 0.0, "end_time": 2.0, "emotion": "focus", "intensity": 4}]
    samples = [
        _sample(0.0, {"AU04": 2.0, "AU07": 2.0, "AU14": 1.0}, focus=2.0),
        _sample(0.5, {"AU04": 3.0, "AU07": 3.0, "AU14": 2.0}, focus=3.0),
        _sample(1.0, {"AU04": 4.0, "AU07": 4.0, "AU14": 2.5}, focus=4.0),
    ]
    for s in samples:
        s["au_schema"] = {"au_codes": ["AU04", "AU07", "AU14"]}
        s["emotion_probabilities"] = {"neutral": 0.8, "focus": s["focus_intensity"] / 5.0}

    result = scoring.compute_score(tags, samples, duration=2.0, au_config={"signal_mode": "combined"})
    assert result["dtw_signal"] == "combined_emotion_au"
    assert "au_timeseries" in result
    assert "focus_dtw" in result


def test_segment_intensity_scores():
    tags = [
        {"start_time": 0.0, "end_time": 2.0, "emotion": "happy", "intensity": 4},
        {"start_time": 2.0, "end_time": 4.0, "emotion": "sad", "intensity": 3},
    ]
    samples = [
        {
            "timestamp": 0.5,
            "face_detected": True,
            "dominant_emotion": "happy",
            "emotion_probabilities": {"happy": 0.6, "neutral": 0.4},
        },
        {
            "timestamp": 1.5,
            "face_detected": True,
            "dominant_emotion": "happy",
            "emotion_probabilities": {"happy": 0.8, "neutral": 0.2},
        },
        {
            "timestamp": 2.5,
            "face_detected": True,
            "dominant_emotion": "sad",
            "emotion_probabilities": {"sad": 0.5, "neutral": 0.5},
        },
    ]
    calibration = {"emotion": "happy", "peak_probability": 0.8, "intensity": 5}

    result = scoring.compute_score(tags, samples, duration=4.0, calibration=calibration)
    segments = result["segment_scores"]
    assert segments[0]["intended_intensity"] == 4
    assert segments[0]["observed_intensity"] == 4.3
    assert segments[0]["intensity_delta"] == 0.3
    assert result["control_curve"][0]["intensity"] == 4.0
    assert result["intensity_alignment_score"] is not None


if __name__ == "__main__":
    test_discover_au_schema_regression_columns()
    test_discover_au_schema_plain_detectorv2_columns()
    test_session_zscore_normalization()
    test_presence_gating()
    test_combined_dtw_score_includes_au_curves()
    test_segment_intensity_scores()
    print("All tests passed.")
