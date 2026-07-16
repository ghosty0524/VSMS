import React from 'react'
import type { TimeScale } from '../../lib/analytics'

const OPTIONS: { value: TimeScale; label: string }[] = [
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
  { value: 'year', label: '年' },
]

interface Props {
  value: TimeScale
  onChange: (v: TimeScale) => void
}

const ScaleToggle: React.FC<Props> = ({ value, onChange }) => (
  <div className="inline-flex border border-gray-300 rounded-lg overflow-hidden text-xs">
    {OPTIONS.map(o => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)}
        className={`px-3 py-1 transition-colors ${
          value === o.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
        }`}>
        {o.label}
      </button>
    ))}
  </div>
)

export default ScaleToggle
