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


def test_do_nothing_viewer_scores_zero_and_beats_nothing_else():
    blank = [_sample(t * 0.5, "neutral", 0.8) for t in range(int(DURATION / 0.5))]
    r = scoring.compute_score(TAGS, blank, DURATION)
    assert r["dtw_accuracy_score"] == 0.0
    assert r["dtw_baseline_distance"] >= scoring.MIN_BASELINE_DISTANCE
    assert scoring.compute_score(TAGS, _viewer(), DURATION)["dtw_accuracy_score"] > 0


def test_dtw_accuracy_is_relative_to_baseline():
    assert scoring.dtw_accuracy(0.0, 0.8) == 100.0
    assert scoring.dtw_accuracy(0.4, 0.8) == 50.0
    assert scoring.dtw_accuracy(2.0, 0.8) == 0.0


def test_stale_reaction_does_not_fill_long_gaps():
    # One happy sample at t=1, then nothing: it must expire after MAX_HOLD_SECONDS.
    curve = scoring.build_observed_curve([_sample(1.0, "happy")], DURATION)
    assert curve[3]["happy"] > 0.5  # t=1.5, fresh
    assert curve[int(10 / scoring.STEP)]["happy"] == 0.0  # t=10, long gone


def test_samples_after_seek_are_excluded():
    samples = [_sample(5.0, "happy"), _sample(5.5, "happy"), _sample(8.0, "happy")]
    kept = scoring.filter_samples(samples, [{"timestamp": 5.0, "action": "seek"}])
    assert [s["timestamp"] for s in kept] == [8.0]
    # pause/resume events do not exclude anything
    assert len(scoring.filter_samples(samples, [{"timestamp": 5.0, "action": "pause"}])) == 3


def test_compute_score_honours_pause_events():
    samples = _viewer()
    seeks = [{"timestamp": 2.0, "action": "seek"}]
    r = scoring.compute_score(TAGS, samples, DURATION, pause_events=seeks)
    first = r["segment_scores"][0]
    assert first["samples_in_window"] < scoring.compute_score(TAGS, samples, DURATION)["segment_scores"][0]["samples_in_window"]


def test_segment_tie_is_resolved_deterministically_by_mean_probability():
    tag = [{"emotion": "happy", "intensity": 3, "start_time": 0.0, "end_time": 2.0}]
    # one sad (weak), one happy (strong): equal label counts, happy has higher mean prob.
    samples = [_sample(0.5, "sad", 0.3), _sample(1.0, "happy", 0.9)]
    for ordering in (samples, samples[::-1]):
        seg = scoring.windowed_segment_scores(tag, ordering)[0]
        assert seg["observed_emotion"] == "happy"
        assert seg["match"] is True


def test_segment_reports_match_share():
    tag = [{"emotion": "happy", "intensity": 3, "start_time": 0.0, "end_time": 2.0}]
    samples = [_sample(0.5, "happy"), _sample(1.0, "happy"), _sample(1.5, "neutral", 0.8), _sample(1.8, "sad")]
    seg = scoring.windowed_segment_scores(tag, samples)[0]
    assert seg["match_share"] == 0.5


def test_coverage_reports_sparse_sessions():
    sparse = [_sample(0.0, "happy"), _sample(1.0, "happy")]
    c = scoring.compute_score(TAGS, sparse, DURATION)["coverage"]
    assert c["usable_samples"] == 2
    assert c["coverage"] < 0.1
    full = scoring.compute_score(TAGS, _viewer(), DURATION)["coverage"]
    assert full["coverage"] == 1.0
    assert full["face_share"] == 1.0


def test_coverage_counts_errors_and_no_face():
    samples = _viewer()
    samples[0] = {"timestamp": 0.0, "face_detected": False, "error": True}
    samples[1] = _sample(0.5, "neutral", face=False)
    c = scoring.compute_score(TAGS, samples, DURATION)["coverage"]
    assert c["error_samples"] == 1
    assert c["usable_samples"] == len(samples) - 1
    assert c["face_share"] < 1.0
