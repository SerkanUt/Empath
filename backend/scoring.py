

import math

EMOTIONS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral", "distracted"]
STEP = 0.5  


def _empty_vector():
    return {e: 0.0 for e in EMOTIONS}


def _label_to_vector(label: str, intensity: float = 1.0) -> dict:
    v = _empty_vector()
    if label in v:
        v[label] = intensity / 5.0 
    return v


def _vector_distance(a: dict, b: dict) -> float:
    return math.sqrt(sum((a[e] - b.get(e, 0.0)) ** 2 for e in EMOTIONS))


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

        blended = _empty_vector()
        for tag in active:
            v = _label_to_vector(tag["emotion"], tag.get("intensity", 3))
            for e in EMOTIONS:
                blended[e] += v[e] / len(active)
        curve.append(blended)
    return curve


def build_observed_curve(samples: list, duration: float, calibration: dict = None) -> list:

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


def dtw_align(seq_a: list, seq_b: list, max_warp_seconds: float = 3.0):
    """
    Standard DTW dynamic-programming alignment with a Sakoe-Chiba band to
    cap how far in time a match can be warped (so a reaction 30 seconds
    later never counts as "aligned" -- that's just a different reaction).
    Returns (total_distance, normalized_distance, path).
    """
    n, m = len(seq_a), len(seq_b)
    band = max(1, int(max_warp_seconds / STEP))
    INF = float("inf")

    cost = [[INF] * (m + 1) for _ in range(n + 1)]
    cost[0][0] = 0.0

    for i in range(1, n + 1):
        j_lo = max(1, i - band)
        j_hi = min(m, i + band)
        for j in range(j_lo, j_hi + 1):
            d = _vector_distance(seq_a[i - 1], seq_b[j - 1])
            cost[i][j] = d + min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1])

    total = cost[n][m]
    if math.isinf(total):
        return dtw_align(seq_a, seq_b, max_warp_seconds=10 ** 6)

    normalized = total / max(n, m, 1)
    return total, normalized, cost


def windowed_segment_scores(tags: list, samples: list, lag_tolerance: float = 2.0) -> list:

    results = []
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
               
                e = "distracted"
            observed_counts[e] = observed_counts.get(e, 0) + 1

        observed_dominant = (
            max(observed_counts, key=observed_counts.get) if observed_counts else None
        )
        match = observed_dominant == tag["emotion"]

        results.append({
            "start_time": tag["start_time"],
            "end_time": tag["end_time"],
            "intended_emotion": tag["emotion"],
            "observed_emotion": observed_dominant,
            "match": match,
            "samples_in_window": len(window_samples),
        })
    return results


def compute_score(tags: list, samples: list, duration: float, calibration: dict = None) -> dict:
    control_curve = build_control_curve(tags, duration)
    observed_curve = build_observed_curve(samples, duration, calibration=calibration)

    total_dist, normalized_dist, _ = dtw_align(control_curve, observed_curve)


    accuracy_score = max(0.0, 100.0 * (1 - min(normalized_dist / 1.2, 1.0)))

    segments = windowed_segment_scores(tags, samples)
    matched = sum(1 for s in segments if s["match"])
    windowed_accuracy = 100.0 * matched / len(segments) if segments else None

    out = {
        "dtw_total_distance": total_dist,
        "dtw_normalized_distance": normalized_dist,
        "dtw_accuracy_score": round(accuracy_score, 1),
        "windowed_accuracy_score": round(windowed_accuracy, 1) if windowed_accuracy is not None else None,
        "segment_scores": segments,
        "control_curve": [
            {"time": i * STEP, "dominant": max(v, key=v.get)} for i, v in enumerate(control_curve)
        ],
        "observed_curve": [
            {"time": i * STEP, "dominant": max(v, key=v.get)} for i, v in enumerate(observed_curve)
        ],
    }
    if calibration:
        out["calibration"] = calibration
    return out
