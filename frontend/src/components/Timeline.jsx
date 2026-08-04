import React from 'react'
import { colorFor, EMOTIONS } from '../emotions.js'


export default function Timeline({ label, curve, duration }) {
  if (!curve || curve.length === 0) {
    return null
  }
  return (
    <div>
      <div className="timeline-label">
        <span>{label}</span>
        <span>0:00 → {formatTime(duration)}</span>
      </div>
      <div className="timeline">
        {curve.map((step, i) => (
          <div
            key={i}
            className="seg"
            style={{ background: colorFor(step.dominant), width: `${100 / curve.length}%` }}
            title={`${formatTime(step.time)} — ${step.dominant}`}
          />
        ))}
      </div>
    </div>
  )
}

export function Legend() {
  return (
    <div className="legend">
      {EMOTIONS.map((e) => (
        <div className="item" key={e}>
          <span className="swatch" style={{ background: colorFor(e) }} />
          {e}
        </div>
      ))}
    </div>
  )
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}
