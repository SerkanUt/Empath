
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

/** Map peak probability (0–1) of the target emotion to intensity 1–5. */
export function intensityFromPeak(peak) {
  if (peak == null || Number.isNaN(peak)) return 1
  const intensity = Math.round(1 + Math.min(1, Math.max(0, peak)) * 4)
  return Math.min(5, Math.max(1, intensity))
}

export function peaksFromSamples(samples, emotions) {
  const peaks = {}
  for (const e of emotions) {
    peaks[e] = 0
    for (const s of samples) {
      const p = s.emotion_probabilities?.[e] ?? 0
      if (p > peaks[e]) peaks[e] = p
    }
  }
  return peaks
}

export function intensitiesFromPeaks(peaks) {
  return Object.fromEntries(Object.entries(peaks).map(([e, p]) => [e, intensityFromPeak(p)]))
}
