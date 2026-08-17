import React from 'react'

export interface DonutSegment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: DonutSegment[]
  size?: number
  strokeWidth?: number
  emptyLabel?: string
  showLegend?: boolean
}

export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  size = 140,
  strokeWidth = 22,
  emptyLabel = 'No data',
  showLegend = true,
}) => {
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  let accumulatedPercent = 0

  return (
    <div className="donut-chart-container">
      <div className="donut-chart-wrapper" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg">
          {/* Base track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={strokeWidth}
          />
          {total === 0 ? (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#26334d"
              strokeWidth={strokeWidth}
              strokeDasharray="4 4"
            />
          ) : (
            segments.map((seg, idx) => {
              if (seg.value <= 0) return null
              const percent = seg.value / total
              const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`
              const strokeDashoffset = -circumference * accumulatedPercent
              accumulatedPercent += percent

              return (
                <circle
                  key={idx}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="butt"
                  className="donut-segment"
                  style={{
                    transform: 'rotate(-90deg)',
                    transformOrigin: '50% 50%',
                    transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease',
                  }}
                />
              )
            })
          )}
        </svg>
        {total === 0 && (
          <div className="donut-center-text">
            <span>{emptyLabel}</span>
          </div>
        )}
      </div>

      {showLegend && (
        <div className="donut-legend">
          {segments.map((seg, idx) => (
            <div key={idx} className="donut-legend-item">
              <span
                className="donut-legend-dot"
                style={{ backgroundColor: seg.color }}
              />
              <span className="donut-legend-label">{seg.label}</span>
              {total > 0 && <span className="donut-legend-value">{seg.value}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
