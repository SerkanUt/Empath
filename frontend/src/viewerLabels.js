
export function nextViewerLabel(existingLabels = []) {
  const nums = existingLabels
    .map((label) => {
      const match = /^user\s*(\d+)$/i.exec(String(label || '').trim())
      return match ? parseInt(match[1], 10) : null
    })
    .filter((n) => n != null)
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `User ${next}`
}

export function collectViewerLabels(...sessionLists) {
  return sessionLists.flatMap((list) => (list || []).map((s) => s.viewer_label).filter(Boolean))
}
