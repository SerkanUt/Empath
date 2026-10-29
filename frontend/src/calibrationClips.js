
const PLACEHOLDER_ID = 'jNQXAC9IVRw'


export const DUAL_CALIBRATION = {
  emotions: ['happy', 'sad'],
  youtubeId: 'EHoHhdbEq1Y',
  title: 'Happy & sad reference clip',
  note: 'Watch once — we track your peak happy and peak sad reactions separately.',
}

export const CALIBRATION_CLIPS = {
  angry: {
    youtubeId: PLACEHOLDER_ID,
    title: 'Anger reference clip',
    note: 'Edit calibrationClips.js — set your objectively angry YouTube video.',
  },
  disgust: {
    youtubeId: PLACEHOLDER_ID,
    title: 'Disgust reference clip',
    note: 'Edit calibrationClips.js — set your objectively disgusting YouTube video.',
  },
  fear: {
    youtubeId: PLACEHOLDER_ID,
    title: 'Fear reference clip',
    note: 'Edit calibrationClips.js — set your objectively scary YouTube video.',
  },
  happy: {
    youtubeId: DUAL_CALIBRATION.youtubeId,
    title: 'Happy reference clip',
    note: 'Edit calibrationClips.js — set your objectively happy YouTube video.',
  },
  sad: {
    youtubeId: DUAL_CALIBRATION.youtubeId,
    title: 'Sad reference clip',
    note: 'Edit calibrationClips.js — set your objectively sad YouTube video.',
  },
  surprise: {
    youtubeId: PLACEHOLDER_ID,
    title: 'Surprise reference clip',
    note: 'Edit calibrationClips.js — set your objectively surprising YouTube video.',
  },
  neutral: {
    youtubeId: PLACEHOLDER_ID,
    title: 'Neutral reference clip',
    note: 'Edit calibrationClips.js — set a calm / low-arousal YouTube video.',
  },
}


export function intensityFromPeak(peak) {
  if (peak == null || Number.isNaN(peak)) return 1
  const intensity = Math.round(1 + Math.min(1, Math.max(0, peak)) * 4)
  return Math.min(5, Math.max(1, intensity))
}

// Mean of the strongest few frames: robust to a single-frame detector spike,
// but still catches a short genuine reaction (a percentile over a mostly quiet
// clip would miss it).
const PEAK_TOP_FRAMES = 3

export function peaksFromSamples(samples, emotions) {
  const peaks = {}
  for (const e of emotions) {
    const top = samples
      .map((s) => s.emotion_probabilities?.[e] ?? 0)
      .sort((a, b) => b - a)
      .slice(0, PEAK_TOP_FRAMES)
    peaks[e] = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0
  }
  return peaks
}

export function intensitiesFromPeaks(peaks) {
  return Object.fromEntries(Object.entries(peaks).map(([e, p]) => [e, intensityFromPeak(p)]))
}
