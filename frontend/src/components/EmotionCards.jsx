import React from 'react'
import { colorFor, emotionLabel } from '../emotions.js'
import EmotionMark from './EmotionMark.jsx'
import { formatTime } from './Timeline.jsx'

// Collapse a per-step curve into runs of one emotion with a start and end time.
export function curveToRuns(curve, duration) {
  if (!curve || curve.length === 0) return []
  const runs = []
  curve.forEach((step, i) => {
    const last = runs[runs.length - 1]
    if (last && last.emotion === step.dominant) return
    runs.push({ emotion: step.dominant, start: step.time })
  })
  return runs.map((run, i) => ({
    ...run,
    end: i + 1 < runs.length ? runs[i + 1].start : duration,
  }))
}

function Lane({ label, runs, duration, onSeek }) {
  return (
    <div className="card-lane">
      <div className="lane-label">{label}</div>
      <div className="card-row">
        {runs.map((run, i) => {
          const left = (run.start / duration) * 100
          const width = ((run.end - run.start) / duration) * 100
          return (
            <button
              key={i}
              type="button"
              className={`emotion-card ${width < 9 ? 'is-narrow' : ''} ${width >= 28 ? 'is-wide' : ''}`}
              style={{ left: `${left}%`, width: `calc(${width}% - 4px)`, background: colorFor(run.emotion), animationDelay: `${i * 45}ms` }}
              onClick={() => onSeek?.(run.start)}
              title={`${emotionLabel(run.emotion)} · ${formatTime(run.start)}–${formatTime(run.end)}`}
              aria-label={`${emotionLabel(run.emotion)} from ${formatTime(run.start)} to ${formatTime(run.end)}. Jump to this moment.`}
            >
              <EmotionMark emotion={run.emotion} size={18} ink />
              <span className="card-name">{emotionLabel(run.emotion)}</span>
              <span className="card-time">{formatTime(run.start)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function EmotionCards({ result, duration, currentTime = 0, onSeek }) {
  const intended = curveToRuns(result.control_curve, duration)
  const observed = curveToRuns(result.observed_curve, duration)
  const segments = result.segment_scores || []
  const playhead = Math.min(100, Math.max(0, (currentTime / duration) * 100))

  return (
    <div className="emotion-graph">
      <div className="graph-body">
        <Lane label="What you meant" runs={intended} duration={duration} onSeek={onSeek} />
        <div className="match-strip" aria-label="Which intended moments landed">
          {segments.map((s, i) => (
            <div
              key={i}
              className={`match-cell ${s.match ? 'is-landed' : 'is-missed'}`}
              style={{
                left: `${(s.start_time / duration) * 100}%`,
                width: `calc(${((s.end_time - s.start_time) / duration) * 100}% - 4px)`,
              }}
            >
              {s.match ? 'Landed' : 'Missed'}
            </div>
          ))}
        </div>
        <Lane label="What they felt" runs={observed} duration={duration} onSeek={onSeek} />
        {currentTime > 0 && <div className="playhead" style={{ left: `${playhead}%` }} aria-hidden="true" />}
      </div>
    </div>
  )
}
