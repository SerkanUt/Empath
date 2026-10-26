import React, { useRef, useState } from 'react'
import { api } from '../api.js'
import { EMOTIONS, colorFor, emotionLabel } from '../emotions.js'
import { formatTime } from './Timeline.jsx'
import EmotionMark from './EmotionMark.jsx'
import VideoFrame from './VideoFrame.jsx'

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
    <div className="split-layout">
      <VideoFrame
        ref={videoRef}
        src={scene.video_url}
        title={scene.title}
        caption={`Now at ${formatTime(currentTime)}`}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
      />

      <section className="split-main">
        <h1>What should people feel?</h1>
        <p className="lede">
          Play the video. When you want a feeling to start, tap it. Let it play, then tap "End tag" where that
          feeling should have passed.
        </p>

        {error && <div className="error-box">{error}</div>}

        <h3>How strong? <span className="inline-value">{intensity} of 5</span></h3>
        <input
          type="range"
          min="1"
          max="5"
          value={intensity}
          onChange={(e) => setIntensity(parseInt(e.target.value))}
          aria-label="Intensity from 1 to 5"
          style={{ width: '100%', marginBottom: 20 }}
        />

        <div className="emotion-buttons">
          {EMOTIONS.map((emotion) => (
            <button
              key={emotion}
              className={`emotion-btn emotion-btn--filled ${openTag?.emotion === emotion ? 'active' : ''}`}
              style={{ '--emotion': colorFor(emotion) }}
              onClick={() => startTag(emotion)}
              disabled={!!openTag}
            >
              <EmotionMark emotion={emotion} size={18} ink />
              {emotionLabel(emotion)}
            </button>
          ))}
        </div>

        {openTag && (
          <div className="tag-row tag-row--open">
            <span>
              Tagging <strong style={{ color: colorFor(openTag.emotion) }}>{emotionLabel(openTag.emotion)}</strong> from{' '}
              {formatTime(openTag.start_time)}…
            </span>
            <button className="primary" onClick={endTag}>End tag</button>
          </div>
        )}

        <h3>Tags added ({tags.length})</h3>
        <div className="tag-list">
          {tags.map((tag, i) => (
            <div className="tag-row tag-card" key={i} style={{ background: colorFor(tag.emotion) }}>
              <span className="tag-what">
                <EmotionMark emotion={tag.emotion} size={16} ink />
                {emotionLabel(tag.emotion)} · {formatTime(tag.start_time)}–{formatTime(tag.end_time)} · strength {tag.intensity}
              </span>
              <button className="danger-outline" onClick={() => removeTag(i)}>Remove</button>
            </div>
          ))}
          {tags.length === 0 && <p className="status-line">No tags yet.</p>}
        </div>

        <div className="action-row">
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </section>
    </div>
  )
}
