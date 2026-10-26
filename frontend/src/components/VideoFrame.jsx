import React, { forwardRef, useState } from 'react'

// A player frame that takes the shape of the video it holds (vertical, square or wide).
const VideoFrame = forwardRef(function VideoFrame({ src, title, caption, onLoadedMetadata, children, ...videoProps }, ref) {
  const [shape, setShape] = useState('wide')
  const [ratio, setRatio] = useState(null)

  function handleMetadata(e) {
    const { videoWidth, videoHeight } = e.target
    if (videoWidth && videoHeight) {
      setRatio(videoWidth / videoHeight)
      setShape(videoWidth / videoHeight < 0.9 ? 'tall' : videoWidth / videoHeight > 1.15 ? 'wide' : 'square')
    }
    onLoadedMetadata?.(e)
  }

  return (
    <figure className={`video-frame is-${shape}`} style={ratio ? { '--video-ratio': ratio } : undefined}>
      <video ref={ref} src={src} controls playsInline onLoadedMetadata={handleMetadata} {...videoProps} />
      {(title || caption) && (
        <figcaption>
          {title && <strong>{title}</strong>}
          {caption && <span>{caption}</span>}
        </figcaption>
      )}
      {children}
    </figure>
  )
})

export default VideoFrame
