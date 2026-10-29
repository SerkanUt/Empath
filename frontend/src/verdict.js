import { emotionLabel } from './emotions.js'

export const HOOK_SECONDS = 3
const LOW_COVERAGE = 0.5
const LOW_FACE_SHARE = 0.6
const MAX_MISSES_LISTED = 2

function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

const pct = (x) => `${Math.round(x * 100)}%`

function whatTheyShowed(segment) {
  return segment.observed_emotion ? emotionLabel(segment.observed_emotion) : 'nothing clear'
}

function adviceForMiss(segment) {
  switch (segment.observed_emotion) {
    case 'distracted':
      return 'They looked away or left the frame, so the moment may not be holding attention.'
    case 'neutral':
      return 'No visible reaction. The beat may need to be stronger or clearer.'
    case null:
    case undefined:
      return 'There were no readings here to judge it by.'
    default:
      return 'They felt something other than what you intended.'
  }
}

// Biggest misses first: stronger intended feelings matter more, then earlier ones.
function rankMisses(segments) {
  return segments
    .filter((s) => !s.match)
    .sort((a, b) => (b.intended_intensity ?? 0) - (a.intended_intensity ?? 0) || a.start_time - b.start_time)
}

/**
 * Plain-language reading of a score result.
 * Returns { headline, notes[] } or null when there is nothing to say.
 */
export function verdictFor(result) {
  const segments = result?.segment_scores
  if (!segments || segments.length === 0) return null

  const notes = []
  const coverage = result.coverage
  if (coverage) {
    if (coverage.coverage < LOW_COVERAGE) {
      notes.push(
        `Only ${pct(coverage.coverage)} of the expected readings were captured, so treat this score with caution.`
      )
    }
    if (coverage.usable_samples > 0 && coverage.face_share < LOW_FACE_SHARE) {
      notes.push(
        `Their face was visible in only ${pct(coverage.face_share)} of readings. Check lighting and camera angle.`
      )
    }
  }

  const landed = segments.filter((s) => s.match).length
  const headline =
    landed === segments.length
      ? 'Every moment landed. Nice work.'
      : `${landed} of ${segments.length} moments landed.`

  for (const miss of rankMisses(segments).slice(0, MAX_MISSES_LISTED)) {
    notes.push(
      `At ${mmss(miss.start_time)} you wanted ${emotionLabel(miss.intended_emotion)}, and they showed ${whatTheyShowed(miss)}. ${adviceForMiss(miss)}`
    )
  }

  const opening = segments.filter((s) => s.start_time < HOOK_SECONDS)
  if (opening.length > 0) {
    const hookLanded = opening.every((s) => s.match)
    notes.push(
      hookLanded
        ? `The opening landed: they reacted as intended in the first ${HOOK_SECONDS} seconds.`
        : `The opening missed: they did not react as intended in the first ${HOOK_SECONDS} seconds, which is where viewers decide whether to keep watching.`
    )
  }

  return { headline, notes }
}
