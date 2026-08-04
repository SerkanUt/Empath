import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import Timeline, { Legend, formatTime } from './Timeline.jsx'

export default function ResultsDashboard({ scene, controlSessions, calibrationSessions, testSessions }) {
  const [controlId, setControlId] = useState(controlSessions[0]?.id || null)
  const [testId, setTestId] = useState(testSessions[0]?.id || null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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

  if (controlSessions.length === 0 || testSessions.length === 0) {
    return (
      <div className="panel">
        <h2>Results</h2>
        <p className="status-line">
          You need at least one control session and one test session for "{scene.title}" before you can compare
          results. Use the Control and Test tabs above to record them.
        </p>
        {(controlSessions.length > 0 || calibrationSessions.length > 0 || testSessions.length > 0) && (
          <SessionSummary
            controlSessions={controlSessions}
            calibrationSessions={calibrationSessions}
            testSessions={testSessions}
          />
        )}
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Results — {scene.title}</h2>

      {error && <div className="error-box">{error}</div>}

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label>Control session (intended)</label>
          <select value={controlId || ''} onChange={(e) => setControlId(parseInt(e.target.value))}>
            {controlSessions.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.id} · {c.created_by || 'admin'} · {c.tags.length} tags ·{' '}
                {new Date(c.created_at * 1000).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Test session (observed)</label>
          <select value={testId || ''} onChange={(e) => setTestId(parseInt(e.target.value))}>
            {testSessions.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id}
                {t.viewer_label ? ` · ${t.viewer_label}` : ''}
                {t.calibration
                  ? t.calibration.mode === 'dual'
                    ? ` · cal happy+sad`
                    : ` · cal ${t.calibration.emotion} @${t.calibration.intensity}/5`
                  : ''}
                {' · '}{t.samples.length} samples
              </option>
            ))}
          </select>
        </div>
      </div>

      <SessionSummary
        controlSessions={controlSessions}
        calibrationSessions={calibrationSessions}
        testSessions={testSessions}
      />

      <button className="primary" onClick={runComparison} disabled={loading}>
        {loading ? 'Comparing…' : 'Run comparison'}
      </button>

      {result && (
        <div style={{ marginTop: 28 }}>
          {result.calibration && (
            <p className="status-line" style={{ marginBottom: 16 }}>
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
          )}

          <div className="score-grid">
            <div className="score-card">
              <div className="value">{result.dtw_accuracy_score}%</div>
              <div className="label">DTW-aligned accuracy</div>
            </div>
            <div className="score-card">
              <div className="value">{result.windowed_accuracy_score ?? '—'}%</div>
              <div className="label">Windowed segment match</div>
            </div>
          </div>

          <h3>Emotion timeline</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 8 }}>
            <Timeline label="Intended (control)" curve={result.control_curve} duration={scene.duration} />
            <Timeline label="Observed (test viewer)" curve={result.observed_curve} duration={scene.duration} />
          </div>
          <Legend />

          <h3 style={{ marginTop: 28 }}>Segment breakdown</h3>
          <table className="segments">
            <thead>
              <tr>
                <th>Segment</th>
                <th>Intended</th>
                <th>Observed</th>
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
                  <td className={s.match ? 'match-yes' : 'match-no'}>{s.match ? 'Match' : 'Mismatch'}</td>
                  <td>{s.samples_in_window}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="status-line" style={{ marginTop: 16 }}>
            DTW-aligned accuracy allows for natural reaction lag (up to a few seconds) before penalizing a mismatch.
            Windowed segment match is the more literal "did each intended beat land" score. Treat both as directional
            signals, not precise measurements — facial emotion recognition has known accuracy limits.
          </p>
        </div>
      )}
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
                  {t.calibration ? ' · calibrated' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
