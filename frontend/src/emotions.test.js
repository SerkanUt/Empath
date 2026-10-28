import { describe, expect, it } from 'vitest'
import { EMOTIONS, EMOTION_COLORS, colorFor, emotionLabel } from './emotions.js'

describe('emotions', () => {
  it('has a color for every emotion', () => {
    for (const e of EMOTIONS) expect(EMOTION_COLORS[e], e).toBeTruthy()
  })
  it('has a readable label for every emotion', () => {
    for (const e of EMOTIONS) expect(emotionLabel(e), e).toBeTruthy()
  })
  it('falls back gracefully for unknown emotions', () => {
    expect(() => colorFor('nonsense')).not.toThrow()
    expect(() => emotionLabel('nonsense')).not.toThrow()
  })
})
