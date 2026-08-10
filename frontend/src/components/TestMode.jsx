import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { colorFor } from '../emotions.js'

const SAMPLE_INTERVAL_MS = 500

export default function TestMode({ scene, calibrationSessions, onSaved }) {
  const videoRef = useRef(null)
  const webcamVideoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const samplesRef = useRef([])
  const pauseEventsRef = useRef([])
  const intervalRef = useRef(null)
  const streamRef = useRef(null)

  const [selectedCalibrationId, setSelectedCalibrationId] = useState(null)
  const [webcamReady, setWebcamReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastEmotion, setLastEmotion] = useState(null)
  const [sampleCount, setSampleCount] = useState(0)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const selectedCalibration = calibrationSessions.find((c) => c.id === selectedCalibrationId)
  const calibration = selectedCalibration?.calibration
  const viewerLabel = selectedCalibration?.viewer_label

  useEffect(() => {
    return () => stopWebcam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (calibrationSessions.length === 0) {
      setSelectedCalibrationId(null)
      return
    }
    const stillValid = calibrationSessions.some((c) => c.id === selectedCalibrationId)
    if (!stillValid) {
      setSelectedCalibrationId(calibrationSessions[0].id)
    }
  }, [calibrationSessions, selectedCalibrationId])

  if (calibrationSessions.length === 0) {
    return (
      <div className="panel">
        <h2>Test mode — record a viewer's reaction</h2>
        <p className="status-line">
          No calibration sessions saved for this scene yet. Go to the <strong>Calibration</strong> tab first,
          watch the reference clip, and save a calibration session for each viewer (User 1, User 2, …).
        </p>
      </div>
    )
  }

  async function startWebcam() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream
      }
      setWebcamReady(true)
    } catch (err) {
      setError(
        `Could not access the webcam (${err.message}). This app needs webcam permission for test mode — check ` +
        `your browser's site permissions.`
      )
    }
  }

  function stopWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
    streamRef.current = null
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function captureFrameBase64() {
    const webcamVideo = webcamVideoRef.current
    if (!webcamVideo || webcamVideo.readyState < 2) return null
    const canvas = canvasRef.current
    canvas.width = webcamVideo.videoWidth || 320
    canvas.height = webcamVideo.videoHeight || 240
    const ctx = canvas.getContext('2d')
    ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  async function sampleTick() {
    const video = videoRef.current
    if (!video || video.paused) return
    const frame = captureFrameBase64()
    if (!frame) return
    const timestamp = video.currentTime
    try {
      const result = await api.detectEmotion(frame)
      if (!result) return
      const sample = {
        timestamp,
        dominant_emotion: result.dominant_emotion,
        emotion_probabilities: result.emotion_probabilities,
        face_detected: result.face_detected,
      }
      samplesRef.current.push(sample)
      setSampleCount(samplesRef.current.length)
      setLastEmotion(result.dominant_emotion || (result.face_detected ? null : 'distracted'))
    } catch {
      samplesRef.current.push({
        timestamp,
        dominant_emotion: 'distracted',
        emotion_probabilities: { distracted: 1.0 },
        face_detected: false,
      })
    }
  }

  function handlePlay() {
    if (!webcamReady) {
      setError('Start the webcam before playing the scene.')
      videoRef.current?.pause()
      return
    }
    setRunning(true)
    pauseEventsRef.current.push({ timestamp: videoRef.current.currentTime, action: 'resume' })
    if (!intervalRef.current) {
      intervalRef.current = setInterval(sampleTick, SAMPLE_INTERVAL_MS)
    }
  }

  function handlePause() {
    setRunning(false)
    pauseEventsRef.current.push({ timestamp: videoRef.current?.currentTime || 0, action: 'pause' })
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function handleSeeking() {
    pauseEventsRef.current.push({ timestamp: videoRef.current?.currentTime || 0, action: 'seek' })
  }

  async function handleEnded() {
    handlePause()
    await handleSave()
  }

  async function handleSave() {
    if (samplesRef.current.length === 0) {
      setError('No samples captured yet — play the scene with the webcam running first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const session = await api.createTestSession(scene.id, {
        samples: samplesRef.current,
        pause_events: pauseEventsRef.current,
        viewer_label: viewerLabel,
        calibration,
      })
      onSaved(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function calibrationSummary(cal) {
    if (!cal) return '—'
    if (cal.mode === 'dual' && cal.peaks) {
      return `happy+sad · happy ${cal.intensities?.happy ?? '—'}/5 · sad ${cal.intensities?.sad ?? '—'}/5`
    }
    return `${cal.emotion} · intensity ${cal.intensity}/5`
  }

  return (
    <div className="panel">
      <h2>Test mode — record a viewer's reaction</h2>
      <p className="status-line" style={{ marginTop: -8, marginBottom: 16 }}>
        Pick a saved calibration, start the webcam, then play the scene straight through. Emotion samples are
        captured automatically{` every ${SAMPLE_INTERVAL_MS / 1000}s`} while playing.
      </p>

      <label>Calibration session</label>
      <select
        value={selectedCalibrationId || ''}
        onChange={(e) => setSelectedCalibrationId(parseInt(e.target.value, 10))}
      >
        {calibrationSessions.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.id} · {c.viewer_label} · {calibrationSummary(c.calibration)}
          </option>
        ))}
      </select>

      {calibration && (
        <div className="calibration-badge">
          Viewer: <strong>{viewerLabel}</strong>
          {' · '}
          {calibration.mode === 'dual' && calibration.peaks ? (
            <>
              Calibrated on <strong>happy + sad</strong>
              {' · '}
              happy peak {(calibration.peaks.happy * 100).toFixed(0)}% →{' '}
              <strong>{calibration.intensities?.happy ?? calibration.intensity}</strong>/5
              {' · '}
              sad peak {(calibration.peaks.sad * 100).toFixed(0)}% →{' '}
              <strong>{calibration.intensities?.sad ?? calibration.intensity}</strong>/5
            </>
          ) : (
            <>
              Calibrated on{' '}
              <strong style={{ color: colorFor(calibration.emotion) }}>{calibration.emotion}</strong>
              {' · '}peak {(calibration.peak_probability * 100).toFixed(0)}%
              {' · '}intensity <strong>{calibration.intensity}</strong>/5
            </>
          )}
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="video-row">
        <div>
          <video
            ref={videoRef}
            src={scene.video_url}
            controls
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeking={handleSeeking}
            onEnded={handleEnded}
          />
        </div>
        <div className="webcam-preview">
          {running && (
            <div className="live-dot">
              <span className="dot" /> LIVE
            </div>
          )}
          <video ref={webcamVideoRef} autoPlay muted playsInline style={{ width: '100%', display: 'block' }} />
          {!webcamReady && (
            <button className="secondary" style={{ margin: 8 }} onClick={startWebcam}>
              Start webcam
            </button>
          )}
        </div>
      </div>

      <div className="status-line" style={{ marginTop: 16 }}>
        Samples captured: {sampleCount}
        {lastEmotion && (
          <>
            {' · Last read: '}
            <strong style={{ color: colorFor(lastEmotion) }}>{lastEmotion}</strong>
          </>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : `Save test session (${viewerLabel})`}
        </button>
      </div>
    </div>
  )
}
