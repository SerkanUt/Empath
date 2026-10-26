import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { colorFor, emotionLabel } from '../emotions.js'
import VideoFrame from './VideoFrame.jsx'
import { collectViewerLabels, nextViewerLabel } from '../viewerLabels.js'

const SAMPLE_INTERVAL_MS = 500
const NO_CALIBRATION = 'none'

export default function TestMode({ scene, calibrationSessions, testSessions, onSaved }) {
  const videoRef = useRef(null)
  const webcamVideoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const samplesRef = useRef([])
  const pauseEventsRef = useRef([])
  const intervalRef = useRef(null)
  const streamRef = useRef(null)

  const [selectedCalibrationId, setSelectedCalibrationId] = useState(NO_CALIBRATION)
  const [webcamReady, setWebcamReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastEmotion, setLastEmotion] = useState(null)
  const [sampleCount, setSampleCount] = useState(0)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const useCalibration = selectedCalibrationId !== NO_CALIBRATION
  const selectedCalibration = useCalibration
    ? calibrationSessions.find((c) => c.id === selectedCalibrationId)
    : null
  const calibration = selectedCalibration?.calibration
  const viewerLabel = useCalibration
    ? selectedCalibration?.viewer_label
    : nextViewerLabel(collectViewerLabels(calibrationSessions, testSessions))

  useEffect(() => {
    return () => stopWebcam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedCalibrationId === NO_CALIBRATION) return
    const stillValid = calibrationSessions.some((c) => c.id === selectedCalibrationId)
    if (!stillValid) {
      setSelectedCalibrationId(NO_CALIBRATION)
    }
  }, [calibrationSessions, selectedCalibrationId])

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
        ...(typeof result.focus_intensity === 'number'
          ? { focus_intensity: result.focus_intensity }
          : {}),
        ...(result.au_intensities ? { au_intensities: result.au_intensities } : {}),
        ...(result.au_presence && Object.keys(result.au_presence).length
          ? { au_presence: result.au_presence }
          : {}),
        ...(result.au_schema ? { au_schema: result.au_schema } : {}),
        ...(result.action_units ? { action_units: result.action_units } : {}),
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
      setError('Start the webcam before playing the video.')
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
      setError('No samples captured yet. Play the video with the webcam running first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const session = await api.createTestSession(scene.id, {
        samples: samplesRef.current,
        pause_events: pauseEventsRef.current,
        viewer_label: viewerLabel,
        ...(calibration ? { calibration } : {}),
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
    <div className="split-layout">
      <VideoFrame
        ref={videoRef}
        src={scene.video_url}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeeking={handleSeeking}
        onEnded={handleEnded}
      />

      <section className="split-main">
        <h1>Let a viewer watch</h1>
        <p className="lede">
          Start the webcam, then play the video straight through. We read their face{` every ${SAMPLE_INTERVAL_MS / 1000}s`} while it plays.
          Frames stay on this computer.
        </p>

        {error && <div className="error-box">{error}</div>}

        <div className="webcam-preview">
          {running && (
            <div className="live-dot">
              <span className="dot" /> Recording
            </div>
          )}
          <video ref={webcamVideoRef} autoPlay muted playsInline />
          {!webcamReady && (
            <button className="secondary webcam-start" onClick={startWebcam}>
              Start webcam
            </button>
          )}
        </div>

        <label htmlFor="cal-pick">Warm-up (optional)</label>
        <select
          id="cal-pick"
          value={selectedCalibrationId}
          onChange={(e) => {
            const v = e.target.value
            setSelectedCalibrationId(v === NO_CALIBRATION ? NO_CALIBRATION : parseInt(v, 10))
          }}
        >
          <option value={NO_CALIBRATION}>None, use raw emotion scores</option>
          {calibrationSessions.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.id} · {c.viewer_label} · {calibrationSummary(c.calibration)}
            </option>
          ))}
        </select>

        {!useCalibration && (
          <p className="status-line">
            Saved as <strong>{viewerLabel}</strong> without intensity normalization.
            {calibrationSessions.length === 0 && (
              <>
                {' '}
                You can add a warm-up first from the <strong>Warm-up</strong> step.
              </>
            )}
          </p>
        )}

        {calibration && (
          <div className="calibration-badge">
            Viewer: <strong>{viewerLabel}</strong>
            {' · '}
            {calibration.mode === 'dual' && calibration.peaks ? (
              <>
                Warmed up on <strong>happy + sad</strong>
                {' · '}
                happy peak {(calibration.peaks.happy * 100).toFixed(0)}% →{' '}
                <strong>{calibration.intensities?.happy ?? calibration.intensity}</strong>/5
                {' · '}
                sad peak {(calibration.peaks.sad * 100).toFixed(0)}% →{' '}
                <strong>{calibration.intensities?.sad ?? calibration.intensity}</strong>/5
              </>
            ) : (
              <>
                Warmed up on{' '}
                <strong style={{ color: colorFor(calibration.emotion) }}>{emotionLabel(calibration.emotion)}</strong>
                {' · '}peak {(calibration.peak_probability * 100).toFixed(0)}%
                {' · '}intensity <strong>{calibration.intensity}</strong>/5
              </>
            )}
          </div>
        )}

        <div className="status-line">
          Samples captured: {sampleCount}
          {lastEmotion && (
            <>
              {' · Last read: '}
              <strong style={{ color: colorFor(lastEmotion) }}>{emotionLabel(lastEmotion)}</strong>
            </>
          )}
        </div>

        <div className="action-row">
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : `Save ${viewerLabel}'s watch`}
          </button>
        </div>
      </section>
    </div>
  )
}
