import { describe, expect, it } from 'vitest'
import { intensityFromPeak, peaksFromSamples } from './calibrationClips.js'

const sample = (happy) => ({ emotion_probabilities: { happy } })

describe('peaksFromSamples', () => {
  it('is zero with no samples', () => {
    expect(peaksFromSamples([], ['happy'])).toEqual({ happy: 0 })
  })
  it('damps a single-frame spike', () => {
    const samples = [sample(1.0), ...Array(10).fill(sample(0.3))]
    const { happy } = peaksFromSamples(samples, ['happy'])
    expect(happy).toBeLessThan(0.6)
    expect(happy).toBeGreaterThan(0.3)
  })
  it('still captures a short sustained reaction', () => {
    const samples = [...Array(30).fill(sample(0.05)), sample(0.8), sample(0.85), sample(0.9)]
    expect(peaksFromSamples(samples, ['happy']).happy).toBeCloseTo(0.85, 2)
  })
  it('handles samples missing probabilities', () => {
    expect(peaksFromSamples([{}, sample(0.6)], ['happy']).happy).toBeCloseTo(0.3, 2)
  })
})

describe('intensityFromPeak', () => {
  it('maps peaks into 1-5', () => {
    expect(intensityFromPeak(0)).toBe(1)
    expect(intensityFromPeak(1)).toBe(5)
    expect(intensityFromPeak(null)).toBe(1)
  })
})
