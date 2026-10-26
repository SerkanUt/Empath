import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { Legend, formatTime } from './Timeline.jsx'
import IntensityComparison from './IntensityComparison.jsx'
import EmotionCards from './EmotionCards.jsx'
import EmotionMark from './EmotionMark.jsx'
import VideoFrame from './VideoFrame.jsx'
import { emotionLabel } from '../emotions.js'

function verdictFor(segments) {
  if (!segments || segments.length === 0) return null
  const landed = segments.filter((s) => s.match).length
  const firstMiss = segments.find((s) => !s.match)
  if (landed === segments.length) return 'Every moment landed. Nice work.'
  const lead = `${landed} of ${segments.length} moments landed.`
  const detail = firstMiss
    ? ` At ${formatTime(firstMiss.start_time)} you wanted ${emotionLabel(firstMiss.intended_emotion)}, and they showed ${firstMiss.observed_emotion ? emotionLabel(firstMiss.observed_emotion) : 'nothing clear'}.`
    : ''
  return lead + detail
}

export default function ResultsDashboard({ scene, controlSessions, calibrationSessions, testSessions, onGo }) {
  const videoRef = useRef(null)
  const [controlId, setControlId] = useState(controlSessions[0]?.id || null)
  const [testId, setTestId] = useState(testSessions[0]?.id || null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    setControlId(controlSessions[0]?.id || null)
  }, [controlSessions])

  useEffect(() => {
    setTestId(testSessions[0]?.id || null)
  }, [testSessions])

  async function runComparison() {
    if (!controlId || !testId) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.score(testId, controlId)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function seekTo(t) {
    if (videoRef.current) videoRef.current.currentTime = t
  }

  if (controlSessions.length === 0 || testSessions.length === 0) {
    const needIntent = controlSessions.length === 0
    return (
      <div className="results-layout">
        <VideoFrame ref={videoRef} src={scene.video_url} title={scene.title} />
        <section className="results-main">
          <h1>Nothing to compare yet</h1>
          <p className="lede">
            {needIntent
              ? 'First tell us what you want people to feel, moment by moment.'
              : 'Now let a viewer watch it, so we can see how they actually reacted.'}
          </p>
          <div className="action-row">
            {needIntent ? (
              <button className="primary" onClick={() => onGo?.('Control')}>Mark the intended emotions</button>
            ) : (
              <button className="primary" onClick={() => onGo?.('Test')}>Record a viewer</button>
            )}
          </div>
          {(controlSessions.length > 0 || calibrationSessions.length > 0 || testSessions.length > 0) && (
            <SessionSummary
              controlSessions={controlSessions}
              calibrationSessions={calibrationSessions}
              testSessions={testSessions}
            />
          )}
        </section>
      </div>
    )
  }

  const verdict = result ? verdictFor(result.segment_scores) : null

  return (
    <div className="results-layout">
      <VideoFrame
        ref={videoRef}
        src={scene.video_url}
        title={scene.title}
        caption={`${formatTime(scene.duration)} · ${testSessions.length} ${testSessions.length === 1 ? 'viewer' : 'viewers'}`}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
      />

      <section className="results-main">
        <header className="results-head">
          <div>
            <h1>{result ? 'Did it land?' : 'Compare what you meant with what they felt'}</h1>
            {verdict && <p className="lede">{verdict}</p>}
          </div>
          {result && (
            <div className="score-big" aria-label={`Match score ${result.dtw_accuracy_score} percent`}>
              {Math.round(result.dtw_accuracy_score)}<small>%</small>
            </div>
          )}
        </header>

        {error && <div className="error-box">{error}</div>}

        <div className="pickers">
          <div>
            <label htmlFor="control-pick">Intent tags</label>
            <select id="control-pick" value={controlId || ''} onChange={(e) => setControlId(parseInt(e.target.value))}>
              {controlSessions.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} · {c.tags.length} tags · {new Date(c.created_at * 1000).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="test-pick">Viewer</label>
            <select id="test-pick" value={testId || ''} onChange={(e) => setTestId(parseInt(e.target.value))}>
              {testSessions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.viewer_label || `#${t.id}`}
                  {t.calibration ? ' · warmed up' : ' · no warm-up'}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" onClick={runComparison} disabled={loading}>
            {loading ? 'Comparing…' : result ? 'Compare again' : 'Compare'}
          </button>
        </div>

        {result && (
          <>
            <EmotionCards
              result={result}
              duration={scene.duration}
              currentTime={currentTime}
              onSeek={seekTo}
            />
            <Legend />

            <ol className="moment-list">
              {result.segment_scores.map((s, i) => (
                <li key={i}>
                  <button type="button" className="moment-row" onClick={() => seekTo(s.start_time)}>
                    <span className="moment-time">{formatTime(s.start_time)}</span>
                    <span className="moment-what">
                      <EmotionMark emotion={s.intended_emotion} size={16} />
                      <span>
                        Wanted <strong>{emotionLabel(s.intended_emotion)}</strong>, got{' '}
                        <strong>{s.observed_emotion ? emotionLabel(s.observed_emotion) : 'nothing clear'}</strong>
                      </span>
                    </span>
                    <span className={`moment-status ${s.match ? 'match-yes' : 'match-no'}`}>
                      {s.match ? 'Landed' : 'Missed'}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <details className="more-detail">
              <summary>More detail</summary>

              {result.calibration ? (
                <p className="status-line">
                  {result.calibration.mode === 'dual' && result.calibration.peaks ? (
                    <>
                      Viewer intensity calibrated on <strong>happy + sad</strong> (one clip): happy peak{' '}
                      {(result.calibration.peaks.happy * 100).toFixed(0)}% →{' '}
                      {result.calibration.intensities?.happy ?? '—'}/5, sad peak{' '}
                      {(result.calibration.peaks.sad * 100).toFixed(0)}% →{' '}
                      {result.calibration.intensities?.sad ?? '—'}/5. Each emotion is scaled to its own baseline.
                    </>
                  ) : (
                    <>
                      Viewer intensity calibrated on <strong>{result.calibration.emotion}</strong>
                      {' '}(peak {(result.calibration.peak_probability * 100).toFixed(0)}% → intensity{' '}
                      {result.calibration.intensity}/5). Observed reactions are scaled to that personal baseline.
                    </>
                  )}
                </p>
              ) : (
                <p className="status-line">
                  No warm-up was used, so scores compare raw detected emotion probabilities without personal
                  intensity normalization.
                </p>
              )}

              <dl className="score-rows">
                <div><dt>DTW-aligned accuracy</dt><dd>{result.dtw_accuracy_score}%</dd></div>
                <div><dt>Windowed segment match</dt><dd>{result.windowed_accuracy_score ?? '—'}%</dd></div>
                {result.intensity_alignment_score != null && (
                  <div><dt>Intensity alignment</dt><dd>{result.intensity_alignment_score}%</dd></div>
                )}
              </dl>

              <IntensityComparison result={result} duration={scene.duration} />

              <h3 style={{ marginTop: 28 }}>Segment breakdown</h3>
              <div className="table-scroll">
                <table className="segments">
                  <thead>
                    <tr>
                      <th>Segment</th>
                      <th>Intended</th>
                      <th>Observed</th>
                      <th>Intended intensity</th>
                      <th>Observed intensity</th>
                      <th>Match</th>
                      <th>Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.segment_scores.map((s, i) => (
                      <tr key={i}>
                        <td>{formatTime(s.start_time)}–{formatTime(s.end_time)}</td>
                        <td>{s.intended_emotion}</td>
                        <td>{s.observed_emotion || '—'}</td>
                        <td>{s.intended_intensity ?? '—'}/5</td>
                        <td>
                          {s.observed_intensity != null ? `${s.observed_intensity}/5` : '—'}
                          {s.intensity_delta != null && (
                            <span className={`intensity-delta ${Math.abs(s.intensity_delta) <= 1 ? 'intensity-delta--close' : 'intensity-delta--far'}`}>
                              {' '}({s.intensity_delta > 0 ? '+' : ''}{s.intensity_delta})
                            </span>
                          )}
                        </td>
                        <td className={s.match ? 'match-yes' : 'match-no'}>{s.match ? 'Match' : 'Mismatch'}</td>
                        <td>{s.samples_in_window}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="status-line">
                DTW-aligned accuracy allows for natural reaction lag (up to a few seconds) before penalizing a
                mismatch. Windowed segment match is the more literal "did each intended beat land" score. Treat both
                as directional signals, not precise measurements — facial emotion recognition has known accuracy
                limits.
              </p>

              <SessionSummary
                controlSessions={controlSessions}
                calibrationSessions={calibrationSessions}
                testSessions={testSessions}
              />
            </details>
          </>
        )}
      </section>
    </div>
  )
}

function SessionSummary({ controlSessions, calibrationSessions, testSessions }) {
  return (
    <div className="session-summary" style={{ marginTop: 20 }}>
      <h3>Saved sessions</h3>
      <div className="session-summary-grid">
        <div>
          <strong>Control</strong>
          {controlSessions.length === 0 ? (
            <p className="status-line">None yet</p>
          ) : (
            <ul className="session-list">
              {controlSessions.map((c) => (
                <li key={c.id}>
                  #{c.id} · {c.created_by || 'admin'} · {c.tags.length} tags
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <strong>Calibrations</strong>
          {calibrationSessions.length === 0 ? (
            <p className="status-line">None yet</p>
          ) : (
            <ul className="session-list">
              {calibrationSessions.map((c) => (
                <li key={c.id}>
                  #{c.id} · {c.viewer_label}
                  {c.calibration?.mode === 'dual'
                    ? ' · happy+sad'
                    : c.calibration?.emotion
                      ? ` · ${c.calibration.emotion}`
                      : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <strong>Tests</strong>
          {testSessions.length === 0 ? (
            <p className="status-line">None yet</p>
          ) : (
            <ul className="session-list">
              {testSessions.map((t) => (
                <li key={t.id}>
                  #{t.id} · {t.viewer_label || 'Unlabeled'} · {t.samples.length} samples
                  {t.calibration ? ' · calibrated' : ' · uncalibrated'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
