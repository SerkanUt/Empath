"""Regression tests for scoring.compute_score and its helpers."""

import scoring

DURATION = 20.0
TAGS = [
    {"emotion": "happy", "intensity": 4, "start_time": 2.0, "end_time": 8.0},
    {"emotion": "sad", "intensity": 4, "start_time": 10.0, "end_time": 16.0},
]


def _sample(ts, emotion, p=0.9, face=True, **extra):
    probs = {e: 0.0 for e in scoring.EMOTIONS}
    probs[emotion] = p
    return {
        "timestamp": ts,
        "face_detected": face,
        "dominant_emotion": emotion,
        "emotion_probabilities": probs,
        **extra,
    }


def _viewer(lag=0.0, wrong=False):
    """A viewer who reacts to TAGS, optionally late, or with the opposite emotions."""
    out = []
    t = 0.0
    while t < DURATION:
        shifted = t - lag
        if 2.0 <= shifted <= 8.0:
            out.append(_sample(t, "sad" if wrong else "happy"))
        elif 10.0 <= shifted <= 16.0:
            out.append(_sample(t, "happy" if wrong else "sad"))
        else:
            out.append(_sample(t, "neutral", 0.8))
        t += 0.5
    return out


def test_matching_viewer_scores_high():
    r = scoring.compute_score(TAGS, _viewer(), DURATION)
    assert r["dtw_accuracy_score"] >= 70
    assert r["windowed_accuracy_score"] == 100.0


def test_opposite_viewer_scores_low():
    good = scoring.compute_score(TAGS, _viewer(), DURATION)
    bad = scoring.compute_score(TAGS, _viewer(wrong=True), DURATION)
    assert bad["dtw_accuracy_score"] < good["dtw_accuracy_score"] - 30
    assert bad["windowed_accuracy_score"] == 0.0


def test_small_reaction_lag_is_tolerated():
    r = scoring.compute_score(TAGS, _viewer(lag=1.5), DURATION)
    assert r["windowed_accuracy_score"] == 100.0
    assert r["dtw_accuracy_score"] >= 60


def test_error_samples_are_ignored():
    samples = _viewer()
    # Network failures sprinkled through the happy segment must not look like distraction.
    for i in range(4, 12):
        samples[i] = {
            "timestamp": samples[i]["timestamp"],
            "face_detected": False,
            "dominant_emotion": None,
            "emotion_probabilities": None,
            "error": True,
        }
    curve = scoring.build_observed_curve(samples, DURATION)
    assert all(v.get("distracted", 0) == 0 for v in curve[4:12])


def test_no_face_counts_as_distracted_not_error():
    samples = [_sample(t * 0.5, "neutral", face=False) for t in range(40)]
    seg = scoring.windowed_segment_scores(TAGS, samples)
    assert [s["match"] for s in seg] == [False, False]


def test_empty_samples_do_not_crash():
    r = scoring.compute_score(TAGS, [], DURATION)
    assert 0 <= r["dtw_accuracy_score"] <= 100


def test_single_sample_does_not_crash():
    r = scoring.compute_score(TAGS, [_sample(0.0, "happy")], DURATION)
    assert 0 <= r["dtw_accuracy_score"] <= 100


def test_no_tags_does_not_crash():
    r = scoring.compute_score([], _viewer(), DURATION)
    assert r["windowed_accuracy_score"] is None


def test_calibration_caps_scaled_probability():
    cal = {"peaks": {"happy": 0.4}}
    assert scoring._calibrated_prob(0.4, "happy", cal) <= 1.0
    assert scoring._calibrated_prob(0.2, "happy", cal) < scoring._calibrated_prob(0.4, "happy", cal)
