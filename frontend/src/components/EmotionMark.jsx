import React from 'react'
import { colorFor, shapeFor } from '../emotions.js'

// The emotion's fixed shape in its fixed colour. Pass `ink` to draw it in the card ink instead.
export default function EmotionMark({ emotion, size = 16, ink = false, className = '' }) {
  return (
    <svg
      className={`emotion-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={shapeFor(emotion)} fill={ink ? 'currentColor' : colorFor(emotion)} />
    </svg>
  )
}
