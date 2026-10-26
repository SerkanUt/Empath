"""
Per-session Action Unit intensity time series for DTW scoring.

Raw AU intensities (0–5) vary with lighting and camera setup, so normalization
is applied across all face-detected samples in one capture session, not globally.
"""

import math
import re
from typing import Optional

from emotion_detector import compute_focus_intensity_from_intensities

AU_INTENSITY_SUFFIX = "_r"
AU_PRESENCE_SUFFIX = "_c"
AU_CODE_PATTERN = re.compile(r"^AU\d{2}$")

DEFAULT_STEP = 0.5
DEFAULT_SMOOTH_WINDOW = 5
PRESENCE_GATE_THRESHOLD = 0.5  # on 0–5 scale; used when gating intensity by _c


def _safe_float(value, default=0.0) -> float:
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def read_intensities_from_sample(sample: dict, au_codes: list) -> dict:
    """Read per-AU intensities from a stored sample (structured or legacy flat action_units)."""
    intensities = {}
    structured = sample.get("au_intensities")
    if isinstance(structured, dict):
        for au in au_codes:
            intensities[au] = _safe_float(structured.get(au))
        return intensities

    legacy = sample.get("action_units") or {}
    for au in au_codes:
        if au in legacy:
            intensities[au] = _safe_float(legacy.get(au))
        else:
            intensities[au] = 0.0
    return intensities


def read_presence_from_sample(sample: dict, au_codes: list) -> dict:
    """Read per-AU presence flags (_c) when stored on the sample."""
    presence = {}
    structured = sample.get("au_presence")
    if isinstance(structured, dict):
        for au in au_codes:
            presence[au] = _safe_float(structured.get(au))
        return presence

    legacy = sample.get("action_units") or {}
    for au in au_codes:
        c_key = f"{au}{AU_PRESENCE_SUFFIX}"
        if c_key in legacy:
            presence[au] = _safe_float(legacy.get(c_key))
    return presence


def collect_au_codes(samples: list) -> list:
    """Union of AU codes seen across samples (prefers explicit schema on first sample)."""
    for sample in samples:
        schema = sample.get("au_schema")
        if schema and schema.get("au_codes"):
            return list(schema["au_codes"])
    codes = set()
    for sample in samples:
        for key in (sample.get("au_intensities") or sample.get("action_units") or {}):
            if AU_CODE_PATTERN.match(key):
                codes.add(key)
    return sorted(codes)


def channel_stats(values: list, normalization: str):
    if not values or normalization == "none":
        return None
    if normalization == "minmax":
        lo, hi = min(values), max(values)
        span = hi - lo
        return ("minmax", lo, span if span > 1e-6 else None)
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / len(values)
    std = math.sqrt(var)
    return ("zscore", mean, std if std > 1e-6 else None)


def apply_norm(raw: float, stats) -> float:
    if stats is None:
        return raw
    kind, a, b = stats
    if b is None:
        return 0.0
    if kind == "minmax":
        return (raw - a) / b
    return (raw - a) / b


def smooth_values(values: list, method: Optional[str] = None, window: int = DEFAULT_SMOOTH_WINDOW) -> list:
    """
    Optional temporal smoothing before DTW.

    method: None | 'sma' | 'savgol'
    """
    if not method or not values or len(values) < 2:
        return list(values)

    window = max(1, int(window))
    if window <= 1:
        return list(values)

    if method == "sma":
        half = window // 2
        out = []
        for i in range(len(values)):
            lo = max(0, i - half)
            hi = min(len(values), i + half + 1)
            chunk = values[lo:hi]
            out.append(sum(chunk) / len(chunk))
        return out

    if method == "savgol":
        try:
            from scipy.signal import savgol_filter
        except ImportError:
            return smooth_values(values, method="sma", window=window)

        win = window if window % 2 == 1 else window + 1
        win = min(win, len(values) if len(values) % 2 == 1 else len(values) - 1)
        if win < 3:
            return smooth_values(values, method="sma", window=window)
        poly = min(2, win - 1)
        return list(savgol_filter(values, window_length=win, polyorder=poly))

    raise ValueError(f"Unknown smooth method: {method}")


def _focus_from_intensities(intensities: dict, sample: dict) -> float:
    if sample.get("focus_intensity") is not None:
        return _safe_float(sample.get("focus_intensity"))
    return compute_focus_intensity_from_intensities(intensities)


def build_au_timeseries(
    samples: list,
    duration: float,
    step: float = DEFAULT_STEP,
    normalization: str = "zscore",
    smooth: Optional[str] = None,
    smooth_window: int = DEFAULT_SMOOTH_WINDOW,
    gate_by_presence: bool = False,
    presence_threshold: float = PRESENCE_GATE_THRESHOLD,
) -> dict:
    """
    Resample per-frame AU intensities to a fixed time grid (one row per STEP).

    Returns DTW-ready rows plus column metadata. Normalization stats are computed
    on all face-detected raw samples in the session, then applied to the resampled
    grid. Derived focus intensity uses the same normalization pass.
    """
    au_codes = collect_au_codes(samples)
    n_steps = max(1, int(math.ceil(duration / step)))
    if not au_codes:
        return {
            "step": step,
            "au_codes": [],
            "normalization": normalization,
            "smooth": smooth,
            "rows": [
                {"time": i * step, "intensities": {}, "presence": {}, "focus": 0.0}
                for i in range(n_steps)
            ],
        }

    face_samples = [
        s
        for s in sorted(samples, key=lambda x: x["timestamp"])
        if s.get("face_detected") and s.get("dominant_emotion") != "distracted"
    ]

    raw_by_au = {au: [] for au in au_codes}
    raw_focus = []
    for sample in face_samples:
        intensities = read_intensities_from_sample(sample, au_codes)
        presence = read_presence_from_sample(sample, au_codes)
        for au in au_codes:
            val = intensities.get(au, 0.0)
            if gate_by_presence and presence and presence.get(au, 1.0) < presence_threshold:
                val = 0.0
            raw_by_au[au].append(val)
        raw_focus.append(_focus_from_intensities(intensities, sample))

    au_channel_stats = {au: channel_stats(raw_by_au[au], normalization) for au in au_codes}
    focus_stats = channel_stats(raw_focus, normalization)

    sorted_all = sorted(samples, key=lambda s: s["timestamp"])
    idx = 0
    last_intensities = {au: 0.0 for au in au_codes}
    last_presence = {}
    last_focus = 0.0
    raw_rows = []

    for i in range(n_steps):
        t = i * step
        while idx < len(sorted_all) and sorted_all[idx]["timestamp"] <= t:
            s = sorted_all[idx]
            if s.get("face_detected") and s.get("dominant_emotion") != "distracted":
                last_intensities = read_intensities_from_sample(s, au_codes)
                last_presence = read_presence_from_sample(s, au_codes)
                last_focus = _focus_from_intensities(last_intensities, s)
                if gate_by_presence and last_presence:
                    for au in au_codes:
                        if last_presence.get(au, 1.0) < presence_threshold:
                            last_intensities[au] = 0.0
            elif not s.get("face_detected") or s.get("dominant_emotion") == "distracted":
                last_intensities = {au: 0.0 for au in au_codes}
                last_presence = {}
                last_focus = 0.0
            idx += 1

        raw_rows.append(
            {
                "time": t,
                "intensities": dict(last_intensities),
                "presence": dict(last_presence),
                "focus_raw": last_focus,
            }
        )

    if smooth:
        for au in au_codes:
            series = [row["intensities"].get(au, 0.0) for row in raw_rows]
            smoothed = smooth_values(series, method=smooth, window=smooth_window)
            for row, val in zip(raw_rows, smoothed):
                row["intensities"][au] = val
        focus_series = [row["focus_raw"] for row in raw_rows]
        smoothed_focus = smooth_values(focus_series, method=smooth, window=smooth_window)
        for row, val in zip(raw_rows, smoothed_focus):
            row["focus_raw"] = val

    rows = []
    for row in raw_rows:
        norm_intensities = {
            au: apply_norm(row["intensities"].get(au, 0.0), au_channel_stats.get(au))
            for au in au_codes
        }
        rows.append(
            {
                "time": row["time"],
                "intensities": norm_intensities,
                "intensities_raw": dict(row["intensities"]),
                "presence": dict(row["presence"]),
                "focus": apply_norm(row["focus_raw"], focus_stats),
                "focus_raw": row["focus_raw"],
            }
        )

    return {
        "step": step,
        "au_codes": au_codes,
        "normalization": normalization,
        "smooth": smooth,
        "smooth_window": smooth_window if smooth else None,
        "gate_by_presence": gate_by_presence,
        "rows": rows,
        "session_stats": {
            "face_sample_count": len(face_samples),
            "focus_stats": focus_stats,
            "au_stats": {au: au_channel_stats.get(au) for au in au_codes},
        },
    }


def au_vector_from_row(row: dict, au_codes: list, include_focus: bool = True) -> dict:
    """Single DTW feature vector from one resampled AU row."""
    vec = {au: row["intensities"].get(au, 0.0) for au in au_codes}
    if include_focus:
        vec["focus"] = row.get("focus", 0.0)
    return vec


def build_au_dtw_curve(timeseries: dict, include_focus: bool = True) -> list:
    """List of feature dicts suitable for scoring.dtw_align on AU channels."""
    au_codes = timeseries.get("au_codes") or []
    return [
        au_vector_from_row(row, au_codes, include_focus=include_focus)
        for row in timeseries.get("rows", [])
    ]


def vector_distance_au(a: dict, b: dict, keys: list) -> float:
    return math.sqrt(sum((a.get(k, 0.0) - b.get(k, 0.0)) ** 2 for k in keys))
