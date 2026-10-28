import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { EMOTIONS, colorFor } from '../emotions.js'
import EmotionMark from './EmotionMark.jsx'
import {
  CALIBRATION_CLIPS,
  DUAL_CALIBRATION,
  intensityFromPeak,
  intensitiesFromPeaks,
  peaksFromSamples,
} from '../calibrationClips.js'
import YouTubePlayer from './YouTubePlayer.jsx'

const SAMPLE_INTERVAL_MS = 500

const CALIBRATION_MODES = [
  { id: 'happy-sad', label: 'Happy + Sad', dual: true, emotions: DUAL_CALIBRATION.emotions, clip: DUAL_CALIBRATION },
  ...EMOTIONS.filter((e) => e !== 'distracted').map((e) => ({
    id: e,
    label: e,
    dual: false,
    emotions: [e],
    clip: CALIBRATION_CLIPS[e],
  })),
]

export default function PreTestCalibration({ viewerLabel, saving = false, error: externalError, onSave }) {
  const webcamVideoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
  const samplesRef = useRef([])
  const inFlightRef = useRef(false)
  const intervalRef = useRef(null)
  const playingRef = useRef(false)

  const [modeId, setModeId] = useState('happy-sad')
  const [webcamReady, setWebcamReady] = useState(false)
  const [sampling, setSampling] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const [lastEmotion, setLastEmotion] = useState(null)
  const [peakProbs, setPeakProbs] = useState({})
  const [error, setError] = useState(null)
  const [finished, setFinished] = useState(false)

  const mode = CALIBRATION_MODES.find((m) => m.id === modeId) || CALIBRATION_MODES[0]
  const { emotions, clip, dual } = mode

  useEffect(() => {
    return () => {
      stopSampling()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    samplesRef.current = []
    setSampleCount(0)
    setPeakProbs(Object.fromEntries(emotions.map((e) => [e, 0])))
    setLastEmotion(null)
    setFinished(false)
    setError(null)
    stopSampling()
  }, [modeId])

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
      setError(`Could not access the webcam (${err.message}).`)
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
    if (!playingRef.current) return
    if (inFlightRef.current) return
    const frame = captureFrameBase64()
    if (!frame) return
    inFlightRef.current = true
    try {
      const result = await api.detectEmotion(frame)
      if (!result) return
      const sample = {
        timestamp: Date.now(),
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
      setLastEmotion(result.dominant_emotion)
      setPeakProbs(peaksFromSamples(samplesRef.current, emotions))
    } catch {
      samplesRef.current.push({
        timestamp: Date.now(),
        dominant_emotion: 'distracted',
        emotion_probabilities: { distracted: 1.0 },
        face_detected: false,
      })
    } finally {
      inFlightRef.current = false
    }
  }

  function startSampling() {
    if (!webcamReady) {
      setError('Start the webcam before playing the reference clip.')
      return
    }
    playingRef.current = true
    setSampling(true)
    setFinished(false)
    if (!intervalRef.current) {
      intervalRef.current = setInterval(sampleTick, SAMPLE_INTERVAL_MS)
    }
  }

  function stopSampling() {
    playingRef.current = false
    setSampling(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function handleEnded() {
    stopSampling()
    setPeakProbs(peaksFromSamples(samplesRef.current, emotions))
    setFinished(true)
  }

  function buildCalibrationResult() {
    const peaks = peaksFromSamples(samplesRef.current, emotions)
    const intensities = intensitiesFromPeaks(peaks)
    const topPeak = Math.max(...Object.values(peaks), 0)
    const topEmotion = emotions.reduce((best, e) => (peaks[e] >= peaks[best] ? e : best), emotions[0])

    if (dual) {
      return {
        mode: 'dual',
        emotion: 'happy + sad',
        emotions,
        peaks,
        intensities,
        peak_probability: topPeak,
        intensity: intensities[topEmotion],
        youtube_id: clip.youtubeId,
        sample_count: samplesRef.current.length,
      }
    }

    const emotion = emotions[0]
    return {
      mode: 'single',
      emotion,
      peak_probability: peaks[emotion],
      intensity: intensities[emotion],
      youtube_id: clip.youtubeId,
      sample_count: samplesRef.current.length,
    }
  }

  function handleSave() {
    onSave(buildCalibrationResult())
  }

  const saveLabel = dual
    ? `Save calibration (${emotions.map((e) => `${e} ${intensityFromPeak(peakProbs[e] || 0)}/5`).join(', ')})`
    : `Save calibration (intensity ${intensityFromPeak(peakProbs[emotions[0]] || 0)}/5)`

  return (
    <div className="setup-layout setup-layout--wide">
      <h1>Warm-up: set a baseline</h1>
      <p className="status-line" style={{ marginTop: -8, marginBottom: 16 }}>
        {dual
          ? 'Watch one reference clip — we track your peak happy and peak sad reactions separately to set your personal intensity scale.'
          : 'Pick an emotion, watch a short YouTube reference clip known to evoke it, and we’ll measure how strongly you react.'}
      </p>

      {externalError && <div className="error-box">{externalError}</div>}
      {error && <div className="error-box">{error}</div>}

      <p className="status-line" style={{ marginBottom: 16 }}>
        This warm-up will be saved as <strong>{viewerLabel}</strong>
      </p>

      <label>Warm-up emotion</label>
      <div className="emotion-buttons">
        {CALIBRATION_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`emotion-btn emotion-btn--filled ${modeId === m.id ? 'active' : ''}`}
            style={{ '--emotion': colorFor(m.dual ? 'happy' : m.emotions[0]) }}
            onClick={() => setModeId(m.id)}
            disabled={sampling}
          >
            {m.dual ? (
              <>
                <EmotionMark emotion="happy" size={16} ink />
                <EmotionMark emotion="sad" size={16} ink />
                {m.label}
              </>
            ) : (
              <>
                <EmotionMark emotion={m.emotions[0]} size={16} ink />
                {m.label}
              </>
            )}
          </button>
        ))}
      </div>

      <p className="status-line" style={{ marginBottom: 12 }}>
        Clip: <strong>{clip.title}</strong>
        {clip.note ? ` — ${clip.note}` : ''}
      </p>

      <div className="video-row">
        <div>
          <YouTubePlayer
            key={`${modeId}-${clip.youtubeId}`}
            videoId={clip.youtubeId}
            onPlay={startSampling}
            onPause={stopSampling}
            onEnded={handleEnded}
          />
        </div>
        <div className="webcam-preview">
          {sampling && (
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

      <div className="calibration-meter">
        <div className="status-line">
          Samples: {sampleCount}
          {lastEmotion && (
            <>
              {' · Last read: '}
              <strong style={{ color: colorFor(lastEmotion) }}>{lastEmotion}</strong>
            </>
          )}
        </div>

        {dual ? (
          <div className="dual-calibration-meters">
            {emotions.map((e) => {
              const peak = peakProbs[e] || 0
              const intensity = intensityFromPeak(peak)
              return (
                <div key={e} className="dual-calibration-meter">
                  <div className="status-line" style={{ marginTop: 8 }}>
                    Peak <strong style={{ color: colorFor(e) }}>{e}</strong>: {(peak * 100).toFixed(0)}% → intensity{' '}
                    <strong>{intensity}</strong> / 5
                  </div>
                  <div className="intensity-bar" aria-hidden="true">
                    <div
                      className="intensity-bar-fill"
                      style={{
                        width: `${(intensity / 5) * 100}%`,
                        background: colorFor(e),
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <div className="status-line" style={{ marginTop: 8 }}>
              Peak <strong style={{ color: colorFor(emotions[0]) }}>{emotions[0]}</strong> probability:{' '}
              {((peakProbs[emotions[0]] || 0) * 100).toFixed(0)}% → intensity{' '}
              <strong>{intensityFromPeak(peakProbs[emotions[0]] || 0)}</strong> / 5
            </div>
            <div className="intensity-bar" aria-hidden="true">
              <div
                className="intensity-bar-fill"
                style={{
                  width: `${(intensityFromPeak(peakProbs[emotions[0]] || 0) / 5) * 100}%`,
                  background: colorFor(emotions[0]),
                }}
              />
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="primary" onClick={handleSave} disabled={saving || sampleCount === 0}>
          {saving ? 'Saving…' : finished ? saveLabel : `Save calibration session (${viewerLabel})`}
        </button>
        {!finished && sampleCount > 0 && (
          <span className="status-line" style={{ alignSelf: 'center' }}>
            Play the clip through for best results, or save early once you’ve seen a clear reaction.
          </span>
        )}
        {sampleCount === 0 && (
          <span className="status-line" style={{ alignSelf: 'center' }}>
            Start the webcam and play the reference clip to capture samples.
          </span>
        )}
      </div>
    </div>
  )
}
