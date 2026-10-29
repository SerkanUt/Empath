import { describe, expect, it } from 'vitest'
import { verdictFor } from './verdict.js'

const seg = (start, intended, observed, intensity = 3, match = intended === observed) => ({
  start_time: start,
  end_time: start + 4,
  intended_emotion: intended,
  observed_emotion: observed,
  intended_intensity: intensity,
  match,
})
const cov = (coverage, face_share = 1, usable_samples = 20) => ({ coverage, face_share, usable_samples })

describe('verdictFor', () => {
  it('returns null with no segments', () => {
    expect(verdictFor(null)).toBeNull()
    expect(verdictFor({ segment_scores: [] })).toBeNull()
  })

  it('celebrates when everything landed', () => {
    const v = verdictFor({ segment_scores: [seg(5, 'happy', 'happy')], coverage: cov(1) })
    expect(v.headline).toMatch(/Every moment landed/)
    expect(v.notes).toEqual([])
  })

  it('counts landed moments', () => {
    const v = verdictFor({ segment_scores: [seg(5, 'happy', 'happy'), seg(10, 'sad', 'neutral')] })
    expect(v.headline).toBe('1 of 2 moments landed.')
  })

  it('lists the strongest misses first and caps the list', () => {
    const v = verdictFor({
      segment_scores: [
        seg(5, 'happy', 'neutral', 2),
        seg(10, 'sad', 'neutral', 5),
        seg(20, 'fear', 'neutral', 4),
      ],
    })
    expect(v.notes).toHaveLength(2)
    expect(v.notes[0]).toMatch(/0:10 you wanted sad/)
    expect(v.notes[1]).toMatch(/0:20 you wanted fear/)
  })

  it('explains why by what they showed', () => {
    const note = (observed) =>
      verdictFor({ segment_scores: [seg(10, 'sad', observed)] }).notes[0]
    expect(note('distracted')).toMatch(/looked away/)
    expect(note('neutral')).toMatch(/No visible reaction/)
    expect(note('happy')).toMatch(/something other/)
    expect(note(null)).toMatch(/no readings/)
  })

  it('warns when coverage or face visibility is low', () => {
    const v = verdictFor({ segment_scores: [seg(10, 'sad', 'sad')], coverage: cov(0.2, 0.3) })
    expect(v.notes[0]).toMatch(/Only 20% of the expected readings/)
    expect(v.notes[1]).toMatch(/visible in only 30%/)
  })

  it('does not blame the camera when there were no readings at all', () => {
    const v = verdictFor({ segment_scores: [seg(10, 'sad', null)], coverage: cov(0, 0, 0) })
    expect(v.notes.join(' ')).not.toMatch(/Check lighting/)
  })

  it('reports how the opening went', () => {
    const hit = verdictFor({ segment_scores: [seg(0, 'surprise', 'surprise')] })
    expect(hit.notes.at(-1)).toMatch(/opening landed/)
    const miss = verdictFor({ segment_scores: [seg(1, 'surprise', 'neutral')] })
    expect(miss.notes.at(-1)).toMatch(/opening missed/)
    const none = verdictFor({ segment_scores: [seg(10, 'sad', 'sad')] })
    expect(none.notes.join(' ')).not.toMatch(/opening/)
  })
})
