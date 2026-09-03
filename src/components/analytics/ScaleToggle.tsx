import React from 'react'
import { SegmentedControl } from '../shared/SegmentedControl'
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

// 內容換成共用的 SegmentedControl。改版前這裡是自己一套（gray-900 實心、rounded-lg），
// 跟甘特圖工具列的分段控制（slate-600 實心、rounded-md）長得不一樣但做同一件事。
// 保留這層包裝是因為 TimeScale 的選項固定，兩個使用處不必各自重寫一遍。
const ScaleToggle: React.FC<Props> = ({ value, onChange }) => (
  <SegmentedControl ariaLabel="時間刻度" value={value} onChange={onChange} options={OPTIONS} />
)

export default ScaleToggle
