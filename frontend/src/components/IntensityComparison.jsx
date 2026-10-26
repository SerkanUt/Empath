import React from 'react'
import { colorFor, emotionLabel } from '../emotions.js'
import EmotionMark from './EmotionMark.jsx'
import { formatTime } from './Timeline.jsx'

const CHART_HEIGHT = 160
const CHART_PAD = { top: 12, right: 12, bottom: 28, left: 36 }

function buildLinePath(points, width, height, maxTime, maxValue = 5) {
  if (!points.length) return ''
  const plotW = width - CHART_PAD.left - CHART_PAD.right
  const plotH = height - CHART_PAD.top - CHART_PAD.bottom
  return points
    .map((p, i) => {
      const x = CHART_PAD.left + (p.time / maxTime) * plotW
      const y = CHART_PAD.top + plotH - (p.intensity / maxValue) * plotH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

function IntensityTimeline({ controlCurve, observedCurve, duration }) {
  if (!controlCurve?.length && !observedCurve?.length) return null

  const width = 720
  const height = CHART_HEIGHT
  const plotW = width - CHART_PAD.left - CHART_PAD.right
  const plotH = height - CHART_PAD.top - CHART_PAD.bottom
  const maxTime = Math.max(duration || 1, 1)
  const yTicks = [0, 1, 2, 3, 4, 5]

  const controlPath = buildLinePath(controlCurve || [], width, height, maxTime)
  const observedPath = buildLinePath(observedCurve || [], width, height, maxTime)

  return (
    <div className="intensity-chart-wrap">
      <div className="intensity-chart-header">
        <span>Intensity over time (0–5)</span>
        <div className="intensity-chart-legend">
          <span className="legend-item">
            <span className="legend-line legend-line--control" /> Intended
          </span>
          <span className="legend-item">
            <span className="legend-line legend-line--observed" /> Observed
          </span>
        </div>
      </div>
      <svg
        className="intensity-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Intensity over time comparing intended and observed reactions"
      >
        {yTicks.map((tick) => {
          const y = CHART_PAD.top + plotH - (tick / 5) * plotH
          return (
            <g key={tick}>
              <line
                x1={CHART_PAD.left}
                y1={y}
                x2={width - CHART_PAD.right}
                y2={y}
                className="chart-grid-line"
              />
              <text x={CHART_PAD.left - 8} y={y + 4} className="chart-axis-label" textAnchor="end">
                {tick}
              </text>
            </g>
          )
        })}
        <line
          x1={CHART_PAD.left}
          y1={CHART_PAD.top + plotH}
          x2={width - CHART_PAD.right}
          y2={CHART_PAD.top + plotH}
          className="chart-axis"
        />
        <text
          x={CHART_PAD.left + plotW / 2}
          y={height - 4}
          className="chart-axis-label"
          textAnchor="middle"
        >
          {formatTime(0)} → {formatTime(duration)}
        </text>
        {controlPath && (
          <path d={controlPath} className="chart-line chart-line--control" fill="none" />
        )}
        {observedPath && (
          <path d={observedPath} className="chart-line chart-line--observed" fill="none" />
        )}
      </svg>
    </div>
  )
}

function SegmentIntensityBars({ segments }) {
  const withIntensity = (segments || []).filter((s) => s.intended_intensity != null)
  if (withIntensity.length === 0) return null

  const barMax = 5
  const groupWidth = Math.min(120, Math.max(72, 640 / withIntensity.length))
  const barWidth = 18
  const gap = 6
  const chartHeight = 140
  const padBottom = 52
  const plotH = chartHeight - padBottom - 16
  const width = withIntensity.length * groupWidth + 40

  return (
    <div className="intensity-chart-wrap">
      <div className="intensity-chart-header">
        <span>Per-segment intensity (intended vs observed)</span>
      </div>
      <div className="intensity-bar-chart-scroll">
        <svg
          className="intensity-bar-chart"
          viewBox={`0 0 ${width} ${chartHeight}`}
          role="img"
          aria-label="Grouped bar chart of intended versus observed intensity per segment"
        >
          {[1, 2, 3, 4, 5].map((tick) => {
            const y = 16 + plotH - (tick / barMax) * plotH
            return (
              <g key={tick}>
                <line x1={28} y1={y} x2={width - 8} y2={y} className="chart-grid-line" />
                <text x={22} y={y + 4} className="chart-axis-label" textAnchor="end">
                  {tick}
                </text>
              </g>
            )
          })}
          {withIntensity.map((seg, i) => {
            const cx = 40 + i * groupWidth + groupWidth / 2
            const intendedH = (seg.intended_intensity / barMax) * plotH
            const observed = seg.observed_intensity ?? 0
            const observedH = (observed / barMax) * plotH
            const baseY = 16 + plotH
            const delta = seg.intensity_delta
            const deltaLabel =
              delta == null ? '—' : delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `${delta}`

            return (
              <g key={i}>
                <rect
                  x={cx - barWidth - gap / 2}
                  y={baseY - intendedH}
                  width={barWidth}
                  height={intendedH}
                  className="chart-bar chart-bar--intended"
                  rx={3}
                >
                  <title>{`Intended: ${seg.intended_intensity}/5`}</title>
                </rect>
                <rect
                  x={cx + gap / 2}
                  y={baseY - observedH}
                  width={barWidth}
                  height={observedH}
                  className="chart-bar chart-bar--observed"
                  fill={colorFor(seg.intended_emotion)}
                  rx={3}
                >
                  <title>
                    {seg.observed_intensity != null
                      ? `Observed: ${seg.observed_intensity}/5`
                      : 'No samples'}
                  </title>
                </rect>
                <text
                  x={cx}
                  y={baseY + 14}
                  className="chart-segment-label"
                  textAnchor="middle"
                >
                  {formatTime(seg.start_time)}
                </text>
                <text
                  x={cx}
                  y={baseY + 26}
                  className="chart-segment-sub"
                  textAnchor="middle"
                >
                  {emotionLabel(seg.intended_emotion)}
                </text>
                <text
                  x={cx}
                  y={baseY + 38}
                  className={`chart-delta ${delta == null ? '' : Math.abs(delta) <= 1 ? 'chart-delta--close' : 'chart-delta--far'}`}
                  textAnchor="middle"
                >
                  Δ {deltaLabel}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="intensity-chart-legend intensity-chart-legend--bars">
        <span className="legend-item">
          <span className="legend-swatch legend-swatch--intended" /> Intended
        </span>
        <span className="legend-item">
          <EmotionMark emotion="happy" size={12} /><EmotionMark emotion="surprise" size={12} /><EmotionMark emotion="sad" size={12} /> Observed, filled in the intended emotion's colour
        </span>
      </div>
    </div>
  )
}

export default function IntensityComparison({ result, duration }) {
  if (!result) return null

  const segments = result.segment_scores || []
  const hasIntensity =
    result.intensity_alignment_score != null ||
    segments.some((s) => s.intended_intensity != null)

  if (!hasIntensity) return null

  return (
    <section className="intensity-analysis">
      <h3>Intensity analysis</h3>
      <p className="status-line intensity-analysis-intro">
        Compares how strongly each reaction was intended (control tags) versus how strongly the viewer
        actually expressed that same emotion during each segment. Values are on a 1–5 scale; when
        calibration was used, observed intensity is normalized to the viewer&apos;s personal baseline.
      </p>

      <IntensityTimeline
        controlCurve={result.control_curve}
        observedCurve={result.observed_curve}
        duration={duration}
      />

      <SegmentIntensityBars segments={segments} />
    </section>
  )
}
