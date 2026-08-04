import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { EMOTIONS, colorFor } from '../emotions.js'

const SAMPLE_INTERVAL_MS = 400

export default function LiveDetector() {
  const webcamVideoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const inFlightRef = useRef(false)

  const [webcamReady, setWebcamReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [dominant, setDominant] = useState(null)
  const [probs, setProbs] = useState(() => Object.fromEntries(EMOTIONS.map((e) => [e, 0])))
  const [faceDetected, setFaceDetected] = useState(null)
  const [sampleCount, setSampleCount] = useState(0)
  const [latencyMs, setLatencyMs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    return () => {
      stopSampling()
      stopWebcam()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  function stopWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setWebcamReady(false)
  }

  function captureFrameBase64() {
    const webcamVideo = webcamVideoRef.current
    if (!webcamVideo || webcamVideo.readyState < 2) return null
    const canvas = canvasRef.current
    canvas.width = webcamVideo.videoWidth || 640
    canvas.height = webcamVideo.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  async function sampleTick() {
    if (inFlightRef.current) return
    const frame = captureFrameBase64()
    if (!frame) return
    inFlightRef.current = true
    const started = performance.now()
    try {
      const result = await api.detectEmotion(frame)
      setLatencyMs(Math.round(performance.now() - started))
      setDominant(result.dominant_emotion)
      setFaceDetected(!!result.face_detected)
      setProbs((prev) => {
        const next = { ...prev }
        for (const e of EMOTIONS) next[e] = 0
        const incoming = result.emotion_probabilities || {}
        for (const [k, v] of Object.entries(incoming)) {
          if (k in next) next[k] = Number(v) || 0
        }
        return next
      })
      setSampleCount((n) => n + 1)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      inFlightRef.current = false
    }
  }

  function startSampling() {
    if (!webcamReady) {
      setError('Start the webcam first.')
      return
    }
    setRunning(true)
    if (!intervalRef.current) {
      intervalRef.current = setInterval(sampleTick, SAMPLE_INTERVAL_MS)
      sampleTick()
    }
  }

  function stopSampling() {
    setRunning(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const sorted = [...EMOTIONS].sort((a, b) => (probs[b] || 0) - (probs[a] || 0))

  return (
    <div className="panel">
      <h2>Live detector — emotion scores</h2>
      <p className="status-line" style={{ marginTop: -8, marginBottom: 16 }}>
        Point the webcam at your face and watch the raw FER probabilities update live. Useful for checking
        whether sad is being read as neutral or distracted.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="live-detector-layout">
        <div className="webcam-preview live-detector-cam">
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

        <div className="live-detector-scores">
          <div className="live-detector-meta">
            <div>
              Dominant:{' '}
              {dominant ? (
                <strong style={{ color: colorFor(dominant), textTransform: 'capitalize' }}>{dominant}</strong>
              ) : (
                <span>—</span>
              )}
            </div>
            <div>
              Face:{' '}
              {faceDetected == null ? (
                '—'
              ) : faceDetected ? (
                <span className="match-yes">detected</span>
              ) : (
                <span className="match-no">missing</span>
              )}
            </div>
            <div>Samples: {sampleCount}</div>
            <div>{latencyMs != null ? `${latencyMs} ms` : '—'}</div>
          </div>

          <div className="prob-bars">
            {sorted.map((emotion) => {
              const value = probs[emotion] || 0
              const pct = Math.round(value * 100)
              const isDominant = emotion === dominant
              return (
                <div key={emotion} className={`prob-row ${isDominant ? 'is-dominant' : ''}`}>
                  <div className="prob-label">
                    <span className="swatch" style={{ background: colorFor(emotion) }} />
                    {emotion}
                  </div>
                  <div className="prob-track">
                    <div
                      className="prob-fill"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        background: colorFor(emotion),
                      }}
                    />
                  </div>
                  <div className="prob-value">{pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!webcamReady ? (
          <button className="primary" onClick={startWebcam}>
            Start webcam
          </button>
        ) : !running ? (
          <button className="primary" onClick={startSampling}>
            Start detecting
          </button>
        ) : (
          <button className="secondary" onClick={stopSampling}>
            Pause
          </button>
        )}
      </div>
    </div>
  )
}
