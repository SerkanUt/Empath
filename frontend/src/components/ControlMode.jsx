import React, { useRef, useState } from 'react'
import { api } from '../api.js'
import { EMOTIONS, colorFor } from '../emotions.js'
import { formatTime } from './Timeline.jsx'

export default function ControlMode({ scene, onSaved }) {
  const videoRef = useRef(null)
  const [tags, setTags] = useState([])
  const [openTag, setOpenTag] = useState(null)
  const [intensity, setIntensity] = useState(3)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  function startTag(emotion) {
    if (!videoRef.current) return
    setOpenTag({ emotion, start_time: videoRef.current.currentTime, intensity })
  }

  function endTag() {
    if (!openTag || !videoRef.current) return
    const end_time = videoRef.current.currentTime
    if (end_time <= openTag.start_time) {
      setError('End time must be after start time — let the clip play a bit before ending the tag.')
      return
    }
    setTags((prev) => [...prev, { ...openTag, end_time }])
    setOpenTag(null)
    setError(null)
  }

  function removeTag(index) {
    setTags((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (tags.length === 0) {
      setError('Add at least one emotion tag before saving.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const session = await api.createControlSession(scene.id, { tags, created_by: 'admin' })
      onSaved(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <h2>Control mode — mark the intended emotion</h2>
      <p className="status-line" style={{ marginTop: -8, marginBottom: 16 }}>
        Play the scene. Click an emotion when you want the audience to start feeling it, let it play, then click
        "End tag" at the moment that feeling should have passed.
      </p>

      {error && <div className="error-box">{error}</div>}

      <video
        ref={videoRef}
        src={scene.video_url}
        controls
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
      />
      <p className="status-line">Current time: {formatTime(currentTime)}</p>

      <h3 style={{ marginTop: 20 }}>Intensity: {intensity}</h3>
      <input
        type="range"
        min="1"
        max="5"
        value={intensity}
        onChange={(e) => setIntensity(parseInt(e.target.value))}
        style={{ width: '100%', marginBottom: 16 }}
      />

      <div className="emotion-buttons">
        {EMOTIONS.map((emotion) => (
          <button
            key={emotion}
            className={`emotion-btn ${openTag?.emotion === emotion ? 'active' : ''}`}
            style={{ '--dot-color': colorFor(emotion) }}
            onClick={() => startTag(emotion)}
            disabled={!!openTag}
          >
            <span style={{ background: colorFor(emotion), width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 6 }} />
            {emotion}
          </button>
        ))}
      </div>

      {openTag && (
        <div className="tag-row" style={{ marginBottom: 16 }}>
          <span>
            Tagging <strong style={{ color: colorFor(openTag.emotion) }}>{openTag.emotion}</strong> from{' '}
            {formatTime(openTag.start_time)}…
          </span>
          <button className="secondary" onClick={endTag}>End tag</button>
        </div>
      )}

      <h3>Tags added ({tags.length})</h3>
      <div className="tag-list">
        {tags.map((tag, i) => (
          <div className="tag-row" key={i}>
            <span>
              <span className="swatch" style={{ background: colorFor(tag.emotion) }} />
              {tag.emotion} · {formatTime(tag.start_time)}–{formatTime(tag.end_time)} · intensity {tag.intensity}
            </span>
            <button className="danger-outline" onClick={() => removeTag(i)}>Remove</button>
          </div>
        ))}
        {tags.length === 0 && <p className="status-line">No tags yet.</p>}
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save control session (admin)'}
        </button>
      </div>
    </div>
  )
}
