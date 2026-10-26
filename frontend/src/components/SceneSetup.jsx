import React, { useRef, useState } from 'react'
import { api, SUPPORTED_VIDEO_FORMATS } from '../api.js'
import { formatTime } from './Timeline.jsx'

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
      setError('A title, a video and its length are all needed.')
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
    <div className="setup-layout">
      <h1>Your videos</h1>

      {scenes.length > 0 && (
        <>
          <h2>Pick one to test</h2>
          <div className="scene-picker" role="list">
            {scenes.map((s) => (
              <div
                key={s.id}
                role="listitem"
              >
                <button
                  type="button"
                  className={`scene-chip ${selectedScene?.id === s.id ? 'active' : ''}`}
                  onClick={() => onSelectScene(s)}
                >
                  <strong>{s.title}</strong>
                  <span>{formatTime(s.duration)}</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Add a new video</h2>
      {error && <div className="error-box">{error}</div>}
      <form onSubmit={handleCreate}>
        <label htmlFor="scene-title">Title</label>
        <input id="scene-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning routine reel" />

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
              <span className="upload-title">Drop a video here or click to browse</span>
              <span className="upload-hint">Supported: {SUPPORTED_VIDEO_FORMATS.join(', ')}</span>
            </>
          )}
        </div>

        <label>
          Or paste a video link
          <span className="label-hint"> (not needed if you uploaded a file)</span>
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
          placeholder="https://example.com/my-video.mp4"
        />

        <label htmlFor="scene-duration">Length (seconds)</label>
        <input id="scene-duration" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Filled in after upload, or type it" step="0.01" />

        <button className="primary" type="submit" disabled={submitting || uploading}>
          {submitting ? 'Adding…' : 'Add video'}
        </button>
      </form>
    </div>
  )
}
