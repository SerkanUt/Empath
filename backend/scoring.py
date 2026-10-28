"""
Compares a control session's intended-emotion tags against a test session's
observed emotion samples, and produces an accuracy score + moment-by-moment
breakdown.

Why DTW (Dynamic Time Warping) instead of a straight frame-by-frame diff:
a viewer's facial reaction to a moment on screen is naturally offset by
anywhere from a few hundred milliseconds to a couple of seconds. A simple
diff would penalize a viewer for reacting "late" even if their reaction
was otherwise exactly right. DTW finds the best alignment between the two
curves (within reason) before scoring the difference, so timing lag isn't
mistaken for a wrong reaction.

AU intensity curves (from py-feat AU##_r columns or scaled plain AUs) can be
scored alongside or instead of categorical emotion probabilities. Session-level
normalization (z-score or min-max) is applied in au_timeseries before DTW.
"""

import math

import au_timeseries

EMOTIONS = [
    "angry", "disgust", "fear", "happy", "sad", "surprise", "neutral",
    "focus",  # derived from AUs — heuristic, lower confidence than native 7
    "distracted",
]
STEP = 0.5  # seconds; resampling resolution for curve comparison

DEFAULT_AU_CONFIG = {
    "enabled": True,
    "signal_mode": "emotion",  # 'emotion' | 'au' | 'combined'
    "normalization": "zscore",  # 'none' | 'zscore' | 'minmax'
    "smooth": None,  # None | 'sma' | 'savgol'
    "smooth_window": 5,
    "gate_by_presence": False,
    "include_focus_in_au_vector": True,
}


def _empty_vector():
    return {e: 0.0 for e in EMOTIONS}


def _label_to_vector(label: str, intensity: float = 1.0) -> dict:
    v = _empty_vector()
    if label in v:
        v[label] = intensity / 5.0  # intensity is 1-5, normalize to 0-1
    return v


def _vector_distance(a: dict, b: dict) -> float:
    return math.sqrt(sum((a[e] - b.get(e, 0.0)) ** 2 for e in EMOTIONS))


def _dict_distance(a: dict, b: dict, keys: list) -> float:
    return math.sqrt(sum((a.get(k, 0.0) - b.get(k, 0.0)) ** 2 for k in keys))


def _calibrated_prob(prob: float, emotion: str, calibration: dict = None) -> float:
    if calibration is None:
        return prob
    peaks = calibration.get("peaks")
    if peaks and emotion in peaks:
        return min(1.0, prob / max(float(peaks[emotion]), 0.05))
    peak = calibration.get("peak_probability")
    if peak is not None:
        return min(1.0, prob / max(float(peak), 0.05))
    return prob


def _prob_to_intensity(prob: float) -> float:
    return min(5.0, max(0.0, prob * 5.0))


def _emotion_prob(sample: dict, emotion: str) -> float:
    if emotion == "focus" and sample.get("focus_intensity") is not None:
        return min(1.0, float(sample["focus_intensity"]) / 5.0)
    probs = sample.get("emotion_probabilities") or {}
    return float(probs.get(emotion, 0.0))


def _sample_intensity_for_emotion(sample: dict, emotion: str, calibration: dict = None):
    if emotion == "distracted":
        if not sample.get("face_detected"):
            return 4.0
    elif not sample.get("face_detected"):
        return None
    prob = _emotion_prob(sample, emotion)
    scaled = _calibrated_prob(prob, emotion, calibration)
    return round(_prob_to_intensity(scaled), 1)


def _dominant_intensity(vec: dict) -> float:
    if not vec:
        return 0.0
    dominant = max(vec, key=vec.get)
    return round(_prob_to_intensity(vec[dominant]), 1)


def _mean_observed_intensity(samples: list, emotion: str, start: float, end: float, calibration: dict = None):
    window = [s for s in samples if start <= s["timestamp"] <= end]
    values = [
        v for s in window
        if (v := _sample_intensity_for_emotion(s, emotion, calibration)) is not None
    ]
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def build_control_curve(tags: list, duration: float) -> list:
    """
    tags: [{start_time, end_time, emotion, intensity}]
    Returns a list of emotion-probability-vectors, one per STEP, covering
    [0, duration). Time ranges with no tag default to 'neutral' at low
    intensity (i.e. no strong intended emotion).
    """
    n_steps = max(1, int(math.ceil(duration / STEP)))
    curve = []
    for i in range(n_steps):
        t = i * STEP
        active = [tag for tag in tags if tag["start_time"] <= t < tag["end_time"]]
        if not active:
            curve.append(_label_to_vector("neutral", intensity=2))
            continue
        # If multiple tags overlap, blend them.
        blended = _empty_vector()
        for tag in active:
            v = _label_to_vector(tag["emotion"], tag.get("intensity", 3))
            for e in EMOTIONS:
                blended[e] += v[e] / len(active)
        curve.append(blended)
    return curve


def build_control_au_curve(
    tags: list,
    duration: float,
    au_codes: list,
    normalization: str = "none",
) -> list:
    """
    Control-side AU intensity target curve for DTW.

    Only the derived focus channel is populated from control tags (when emotion
    is 'focus'); other AU columns stay at 0 (neutral baseline). Values are on
    the 0–5 scale before optional session normalization.
    """
    n_steps = max(1, int(math.ceil(duration / STEP)))
    raw_rows = []
    for i in range(n_steps):
        t = i * STEP
        active = [tag for tag in tags if tag["start_time"] <= t < tag["end_time"]]
        focus_raw = 0.0
        if active:
            focus_tags = [tag for tag in active if tag.get("emotion") == "focus"]
            if focus_tags:
                focus_raw = sum(tag.get("intensity", 3) for tag in focus_tags) / len(focus_tags)
        intensities = {au: 0.0 for au in au_codes}
        raw_rows.append({"focus_raw": focus_raw, "intensities": intensities})

    focus_stats = au_timeseries.channel_stats(
        [row["focus_raw"] for row in raw_rows], normalization
    )
    curve = []
    for row in raw_rows:
        vec = {au: 0.0 for au in au_codes}
        vec["focus"] = au_timeseries.apply_norm(row["focus_raw"], focus_stats)
        curve.append(vec)
    return curve


def build_observed_curve(samples: list, duration: float, calibration: dict = None) -> list:
    """
    samples: [{timestamp, dominant_emotion, emotion_probabilities, face_detected}]
    Returns a list of emotion-probability-vectors, one per STEP, using the
    nearest sample at or before each time step (holds last known value
    across gaps, e.g. brief face-not-detected moments).

    If calibration is provided (from the pre-test YouTube clip), observed
    probabilities are scaled relative to that viewer's peak reactivity so a
    muted reactor and a highly expressive one land on a comparable intensity
    scale.
    """
    peak = None
    peaks = None
    if calibration:
        if calibration.get("peaks"):
            peaks = {
                e: max(float(calibration["peaks"].get(e, 0.05)), 0.05)
                for e in EMOTIONS
                if e in calibration["peaks"]
            }
        elif calibration.get("peak_probability"):
            peak = max(float(calibration["peak_probability"]), 0.05)

    n_steps = max(1, int(math.ceil(duration / STEP)))
    samples = [s for s in samples if not s.get("error")]
    sorted_samples = sorted(samples, key=lambda s: s["timestamp"])
    curve = []
    idx = 0
    last_vec = _label_to_vector("neutral", intensity=2)
    for i in range(n_steps):
        t = i * STEP
        while idx < len(sorted_samples) and sorted_samples[idx]["timestamp"] <= t:
            s = sorted_samples[idx]
            if s.get("emotion_probabilities"):
                last_vec = {e: s["emotion_probabilities"].get(e, 0.0) for e in EMOTIONS}
                if peaks is not None:
                    last_vec = {
                        e: min(1.0, last_vec[e] / peaks[e]) if e in peaks else last_vec[e]
                        for e in EMOTIONS
                    }
                elif peak is not None:
                    last_vec = {e: min(1.0, v / peak) for e, v in last_vec.items()}
            elif not s.get("face_detected") or s.get("dominant_emotion") == "distracted":
                # No face in frame (looking away / off-screen) counts as distracted.
                last_vec = _label_to_vector("distracted", intensity=4)
            idx += 1
        curve.append(dict(last_vec))
    return curve


def _merge_feature_vectors(emotion_vec: dict, au_vec: dict, emotion_keys: list, au_keys: list) -> dict:
    merged = {}
    for k in emotion_keys:
        merged[f"emo:{k}"] = emotion_vec.get(k, 0.0)
    for k in au_keys:
        merged[f"au:{k}"] = au_vec.get(k, 0.0)
    return merged


def dtw_align(seq_a: list, seq_b: list, max_warp_seconds: float = 3.0, keys: list = None, distance_fn=None):
    """
    Standard DTW dynamic-programming alignment with a Sakoe-Chiba band to
    cap how far in time a match can be warped (so a reaction 30 seconds
    later never counts as "aligned" -- that's just a different reaction).
    Returns (total_distance, normalized_distance, path).

    When keys is provided, seq_a/seq_b are lists of feature dicts and
    distance_fn(a, b, keys) is used (defaults to _dict_distance).
    """
    n, m = len(seq_a), len(seq_b)
    band = max(1, int(max_warp_seconds / STEP))
    INF = float("inf")
    dist = distance_fn or (lambda a, b, k: _dict_distance(a, b, k))

    cost = [[INF] * (m + 1) for _ in range(n + 1)]
    cost[0][0] = 0.0

    for i in range(1, n + 1):
        j_lo = max(1, i - band)
        j_hi = min(m, i + band)
        for j in range(j_lo, j_hi + 1):
            if keys is not None:
                d = dist(seq_a[i - 1], seq_b[j - 1], keys)
            else:
                d = _vector_distance(seq_a[i - 1], seq_b[j - 1])
            cost[i][j] = d + min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1])

    total = cost[n][m]
    if math.isinf(total):
        # Band too tight for sequence length mismatch -- fall back to
        # unrestricted DTW (rare, only happens with very short/odd inputs).
        return dtw_align(seq_a, seq_b, max_warp_seconds=10 ** 6, keys=keys, distance_fn=distance_fn)

    normalized = total / max(n, m, 1)
    return total, normalized, cost


def windowed_segment_scores(tags: list, samples: list, lag_tolerance: float = 2.0, calibration: dict = None) -> list:
    """
    For each control-tagged segment, check whether the test viewer's
    dominant emotion anywhere in [start_time, end_time + lag_tolerance]
    matches the intended emotion. This is coarser than DTW but much more
    directly readable: "did segment X land or not."
    """
    results = []
    samples = [s for s in samples if not s.get("error")]
    for tag in tags:
        window_start = tag["start_time"]
        window_end = tag["end_time"] + lag_tolerance
        window_samples = [
            s for s in samples
            if window_start <= s["timestamp"] <= window_end
        ]
        observed_counts = {}
        for s in window_samples:
            if s.get("face_detected") and s.get("dominant_emotion"):
                e = s["dominant_emotion"]
            else:
                # Looking away / no face → distracted
                e = "distracted"
            observed_counts[e] = observed_counts.get(e, 0) + 1

        observed_dominant = (
            max(observed_counts, key=observed_counts.get) if observed_counts else None
        )
        match = observed_dominant == tag["emotion"]
        intended_intensity = tag.get("intensity", 3)
        observed_intensity = _mean_observed_intensity(
            samples,
            tag["emotion"],
            tag["start_time"],
            tag["end_time"],
            calibration=calibration,
        )

        results.append({
            "start_time": tag["start_time"],
            "end_time": tag["end_time"],
            "intended_emotion": tag["emotion"],
            "observed_emotion": observed_dominant,
            "match": match,
            "samples_in_window": len(window_samples),
            "intended_intensity": intended_intensity,
            "observed_intensity": observed_intensity,
            "intensity_delta": (
                round(observed_intensity - intended_intensity, 1)
                if observed_intensity is not None
                else None
            ),
        })
    return results


def _resolve_au_config(au_config: dict = None) -> dict:
    cfg = dict(DEFAULT_AU_CONFIG)
    if au_config:
        cfg.update(au_config)
    return cfg


def compute_score(
    tags: list,
    samples: list,
    duration: float,
    calibration: dict = None,
    au_config: dict = None,
) -> dict:
    cfg = _resolve_au_config(au_config)
    control_curve = build_control_curve(tags, duration)
    observed_curve = build_observed_curve(samples, duration, calibration=calibration)

    signal_mode = cfg.get("signal_mode", "emotion")
    au_timeseries_result = None
    au_observed_curve = None
    au_control_curve = None
    au_keys = []

    if cfg.get("enabled", True):
        au_timeseries_result = au_timeseries.build_au_timeseries(
            samples,
            duration,
            step=STEP,
            normalization=cfg.get("normalization", "zscore"),
            smooth=cfg.get("smooth"),
            smooth_window=cfg.get("smooth_window", 5),
            gate_by_presence=cfg.get("gate_by_presence", False),
        )
        au_observed_curve = au_timeseries.build_au_dtw_curve(
            au_timeseries_result,
            include_focus=cfg.get("include_focus_in_au_vector", True),
        )
        au_codes = au_timeseries_result.get("au_codes") or []
        au_keys = list(au_codes)
        if cfg.get("include_focus_in_au_vector", True):
            au_keys.append("focus")
        au_control_curve = build_control_au_curve(
            tags,
            duration,
            au_codes,
            normalization=cfg.get("normalization", "zscore"),
        )

    if signal_mode == "au" and au_observed_curve and au_control_curve and au_keys:
        total_dist, normalized_dist, _ = dtw_align(
            au_control_curve,
            au_observed_curve,
            keys=au_keys,
            distance_fn=au_timeseries.vector_distance_au,
        )
        dtw_label = "au_intensity"
    elif signal_mode == "combined" and au_observed_curve and au_control_curve and au_keys:
        emotion_keys = EMOTIONS
        combined_control = [
            _merge_feature_vectors(control_curve[i], au_control_curve[i], emotion_keys, au_keys)
            for i in range(len(control_curve))
        ]
        combined_observed = [
            _merge_feature_vectors(observed_curve[i], au_observed_curve[i], emotion_keys, au_keys)
            for i in range(len(observed_curve))
        ]
        combined_keys = [f"emo:{k}" for k in emotion_keys] + [f"au:{k}" for k in au_keys]
        total_dist, normalized_dist, _ = dtw_align(
            combined_control,
            combined_observed,
            keys=combined_keys,
        )
        dtw_label = "combined_emotion_au"
    else:
        total_dist, normalized_dist, _ = dtw_align(control_curve, observed_curve)
        dtw_label = "emotion"

    # Convert normalized distance (0 = identical, larger = more different)
    # into a 0-100 "accuracy" score. Max per-step vector distance is
    # sqrt(2) for two unit-ish vectors in disjoint emotions; empirically
    # normalized_dist rarely exceeds ~1.2, so we clip and scale against that.
    accuracy_score = max(0.0, 100.0 * (1 - min(normalized_dist / 1.2, 1.0)))

    segments = windowed_segment_scores(tags, samples, calibration=calibration)
    matched = sum(1 for s in segments if s["match"])
    windowed_accuracy = 100.0 * matched / len(segments) if segments else None

    intensity_deltas = [
        abs(s["intensity_delta"])
        for s in segments
        if s.get("intensity_delta") is not None
    ]
    intensity_alignment = None
    if intensity_deltas:
        mean_abs_delta = sum(intensity_deltas) / len(intensity_deltas)
        intensity_alignment = round(max(0.0, 100.0 * (1 - mean_abs_delta / 5.0)), 1)

    out = {
        "dtw_signal": dtw_label,
        "dtw_total_distance": total_dist,
        "dtw_normalized_distance": normalized_dist,
        "dtw_accuracy_score": round(accuracy_score, 1),
        "windowed_accuracy_score": round(windowed_accuracy, 1) if windowed_accuracy is not None else None,
        "intensity_alignment_score": intensity_alignment,
        "segment_scores": segments,
        "control_curve": [
            {
                "time": i * STEP,
                "dominant": max(v, key=v.get),
                "intensity": _dominant_intensity(v),
            }
            for i, v in enumerate(control_curve)
        ],
        "observed_curve": [
            {
                "time": i * STEP,
                "dominant": max(v, key=v.get),
                "intensity": _dominant_intensity(v),
            }
            for i, v in enumerate(observed_curve)
        ],
    }

    if au_timeseries_result:
        out["au_config"] = cfg
        out["au_timeseries"] = {
            "step": au_timeseries_result["step"],
            "au_codes": au_timeseries_result["au_codes"],
            "normalization": au_timeseries_result["normalization"],
            "smooth": au_timeseries_result.get("smooth"),
            "rows": au_timeseries_result["rows"],
        }
        if au_observed_curve and au_keys:
            out["au_observed_curve"] = [
                {"time": i * STEP, **vec} for i, vec in enumerate(au_observed_curve)
            ]
        if au_control_curve:
            out["au_control_curve"] = [
                {"time": i * STEP, **vec} for i, vec in enumerate(au_control_curve)
            ]
        # Focus-only DTW (derived AU04/AU07/AU14) for control tags marked 'focus'.
        if au_observed_curve and au_control_curve:
            focus_total, focus_norm, _ = dtw_align(
                au_control_curve,
                au_observed_curve,
                keys=["focus"],
                distance_fn=au_timeseries.vector_distance_au,
            )
            out["focus_dtw"] = {
                "total_distance": focus_total,
                "normalized_distance": focus_norm,
                "accuracy_score": round(
                    max(0.0, 100.0 * (1 - min(focus_norm / 1.2, 1.0))), 1
                ),
            }

    if calibration:
        out["calibration"] = calibration
    return out
