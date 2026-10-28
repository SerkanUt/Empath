import { describe, expect, it } from 'vitest'
import { collectViewerLabels, nextViewerLabel } from './viewerLabels.js'

describe('nextViewerLabel', () => {
  it('starts at User 1', () => {
    expect(nextViewerLabel([])).toBe('User 1')
    expect(nextViewerLabel()).toBe('User 1')
  })
  it('continues after the highest number, ignoring other labels', () => {
    expect(nextViewerLabel(['User 1', 'user 3', 'Alice', null])).toBe('User 4')
  })
})

describe('collectViewerLabels', () => {
  it('flattens lists and drops empty labels', () => {
    expect(
      collectViewerLabels([{ viewer_label: 'User 1' }, { viewer_label: null }], undefined, [{ viewer_label: 'User 2' }])
    ).toEqual(['User 1', 'User 2'])
  })
})
