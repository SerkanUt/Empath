import React, { useRef, useState } from 'react'
import { api, SUPPORTED_VIDEO_FORMATS } from '../api.js'

const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/webm,video/ogg,video/quicktime,video/x-m4v,.mp4,.webm,.ogg,.mov,.m4v'

export default function SceneSetup({ scenes, onScenesChanged, selectedScene, onSelectScene }) {
  const fileInputRef = useRef(null)
  const [title, setTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [duration, setDuration] = useState('')
  const [uploadedFilename, setUploadedFilename] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleFileSelected(file) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const result = await api.uploadSceneVideo(file)
      setVideoUrl(result.video_url)
      setUploadedFilename(result.filename)
      if (result.duration != null) {
        setDuration(String(result.duration))
      }
    } catch (err) {
      setVideoUrl('')
      setUploadedFilename(null)
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0]
    handleFileSelected(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    handleFileSelected(file)
  }

  function clearUpload() {
    setVideoUrl('')
    setUploadedFilename(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    if (!title || !videoUrl || !duration) {
      setError('Title, video, and duration are all required.')
      return
    }
    setSubmitting(true)
    try {
      const scene = await api.createScene({
        title,
        video_url: videoUrl,
        duration: parseFloat(duration),
      })
      setTitle('')
      setVideoUrl('')
      setDuration('')
      setUploadedFilename(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await onScenesChanged()
      onSelectScene(scene)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="panel">
      <h2>Scenes</h2>

      {scenes.length > 0 && (
        <>
          <h3>Existing scenes</h3>
          <div className="scene-picker">
            {scenes.map((s) => (
              <div
                key={s.id}
                className={`scene-chip ${selectedScene?.id === s.id ? 'active' : ''}`}
                onClick={() => onSelectScene(s)}
              >
                {s.title}
              </div>
            ))}
          </div>
        </>
      )}

      <h3>Add a new scene</h3>
      {error && <div className="error-box">{error}</div>}
      <form onSubmit={handleCreate}>
        <label>Scene title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Act 2 — Rooftop confrontation" />

        <label>Video file</label>
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploadedFilename ? 'has-file' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_VIDEO_TYPES}
            onChange={handleFileInputChange}
            hidden
          />
          {uploading ? (
            <span>Uploading…</span>
          ) : uploadedFilename ? (
            <>
              <span className="upload-filename">{uploadedFilename}</span>
              <button
                type="button"
                className="upload-clear"
                onClick={(e) => {
                  e.stopPropagation()
                  clearUpload()
                }}
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <span>Drop a video here or click to browse</span>
              <span className="upload-hint">Supported: {SUPPORTED_VIDEO_FORMATS.join(', ')}</span>
            </>
          )}
        </div>

        <label>
          Or paste a video URL
          <span className="label-hint"> (optional if you uploaded a file above)</span>
        </label>
        <input
          type="text"
          value={videoUrl}
          onChange={(e) => {
            setVideoUrl(e.target.value)
            if (uploadedFilename) {
              setUploadedFilename(null)
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
            }
          }}
          placeholder="https://example.com/scene1.mp4"
        />

        <label>Duration (seconds)</label>
        <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Auto-filled after upload, or enter manually" step="0.01" />

        <button className="primary" type="submit" disabled={submitting || uploading}>
          {submitting ? 'Adding…' : 'Add scene'}
        </button>
      </form>
    </div>
  )
}
