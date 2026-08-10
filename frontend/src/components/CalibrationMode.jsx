import React, { useState } from 'react'
import { api } from '../api.js'
import PreTestCalibration from './PreTestCalibration.jsx'
import { collectViewerLabels, nextViewerLabel } from '../viewerLabels.js'

export default function CalibrationMode({ scene, calibrationSessions, testSessions, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const viewerLabel = nextViewerLabel(collectViewerLabels(calibrationSessions, testSessions))

  async function handleSave(calData) {
    setSaving(true)
    setError(null)
    try {
      const session = await api.createCalibrationSession(scene.id, {
        viewer_label: viewerLabel,
        calibration: calData,
      })
      onSaved(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PreTestCalibration
      viewerLabel={viewerLabel}
      saving={saving}
      error={error}
      onSave={handleSave}
    />
  )
}
