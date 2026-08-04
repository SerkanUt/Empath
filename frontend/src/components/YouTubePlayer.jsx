import React, { useEffect, useId, useRef } from 'react'

let youtubeApiPromise = null

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT)
  }
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous()
      resolve(window.YT)
    }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    } else if (window.YT && window.YT.Player) {
      resolve(window.YT)
    }
  })
  return youtubeApiPromise
}

/**
 * Embeds a YouTube video and reports play / pause / end via callbacks.
 * Emotion sampling stays on the webcam — YouTube is display-only.
 */
export default function YouTubePlayer({ videoId, onPlay, onPause, onEnded, onReady }) {
  const reactId = useId().replace(/:/g, '')
  const containerId = `yt-player-${reactId}`
  const playerRef = useRef(null)
  const callbacksRef = useRef({ onPlay, onPause, onEnded, onReady })

  useEffect(() => {
    callbacksRef.current = { onPlay, onPause, onEnded, onReady }
  })

  useEffect(() => {
    let cancelled = false

    loadYouTubeApi().then((YT) => {
      if (cancelled) return
      playerRef.current = new YT.Player(containerId, {
        videoId,
        width: '100%',
        height: '360',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => callbacksRef.current.onReady?.(),
          onStateChange: (event) => {
            const { onPlay: play, onPause: pause, onEnded: ended } = callbacksRef.current
            if (event.data === YT.PlayerState.PLAYING) play?.()
            if (event.data === YT.PlayerState.PAUSED) pause?.()
            if (event.data === YT.PlayerState.ENDED) ended?.()
          },
        },
      })
    })

    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        // ignore teardown races
      }
      playerRef.current = null
    }
  }, [videoId, containerId])

  return <div id={containerId} className="youtube-player" />
}
