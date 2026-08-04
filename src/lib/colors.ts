// src/lib/colors.ts
// 甘特圖的顏色解析：單位色決定 bar 外框，工程師色決定 bar 內裡與左欄人員徽章。
// 兩者皆可在設定頁自訂；未自訂時工程師色由所屬單位色衍生（僅調整明度、
// 不動色相與飽和度），因此同單位必為同色系——這是「預設一致」的來源。
import { UNIT_COLORS, EXTRA_COLORS } from '../constants'
import type { OptionsMap } from '../types'

// 同單位工程師的明度位移（百分點）。索引 0 刻意為 0，
// 使每個單位的第一位工程師與單位色完全相同。
const LIGHTNESS_OFFSETS = [0, 14, -12, 24, -20, 8, -6, 32]

// 夾限範圍：太亮會在白底上看不見，太暗則與深色文字難以區分
const MIN_LIGHTNESS = 24
const MAX_LIGHTNESS = 88

const TEXT_DARK = '#1e293b'
const TEXT_LIGHT = '#ffffff'

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

/** WCAG 相對亮度 */
function relativeLuminance(hex: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = toRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA)
  const b = relativeLuminance(hexB)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 依底色回傳可讀的文字色。取對比較高者而非用亮度門檻，
 * 因為門檻對中等明度的色（如 SIT-SW 的 #F472B6）判斷不可靠。
 */
export function readableTextColor(bgHex: string): string {
  return contrastRatio(bgHex, TEXT_DARK) >= contrastRatio(bgHex, TEXT_LIGHT)
    ? TEXT_DARK
    : TEXT_LIGHT
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = toRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100
  const lN = l / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lN - c / 2
  const seg = Math.floor(((h % 360) + 360) % 360 / 60)
  const rgb: [number, number, number] =
    seg === 0 ? [c, x, 0] :
    seg === 1 ? [x, c, 0] :
    seg === 2 ? [0, c, x] :
    seg === 3 ? [0, x, c] :
    seg === 4 ? [x, 0, c] :
                [c, 0, x]
  const hex = rgb
    .map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0'))
    .join('')
  return `#${hex}`
}

export function deriveEngineerColor(unitColor: string, index: number): string {
  const { h, s, l } = hexToHsl(unitColor)
  const offset = LIGHTNESS_OFFSETS[index % LIGHTNESS_OFFSETS.length]
  const nextL = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l + offset))
  return hslToHex(h, s, nextL)
}

export function resolveUnitColor(unitValue: string, options: OptionsMap): string {
  const unit = options.testUnits.find(u => u.value === unitValue)
  if (unit?.color) return unit.color
  if (UNIT_COLORS[unitValue]) return UNIT_COLORS[unitValue]
  // 與 constants.ts 的 getUnitColor 同規則：未內建的單位依其在清單中的順序取色
  const extras = options.testUnits.map(u => u.value).filter(v => !UNIT_COLORS[v])
  const idx = extras.indexOf(unitValue)
  return EXTRA_COLORS[(idx < 0 ? 0 : idx) % EXTRA_COLORS.length]
}

export function resolveEngineerColor(
  engineerValue: string,
  unitValue: string,
  options: OptionsMap,
): string {
  // Engineer.value 在 schema 上非唯一，同名工程師可隸屬不同單位，
  // 因此必須以 (unitValue, engineerValue) 配對查找；配對不到才退而求其次。
  const unit =
    options.testUnits.find(u => u.value === unitValue) ??
    options.testUnits.find(u => u.engineers.some(e => e.value === engineerValue))
  if (!unit) return resolveUnitColor(unitValue, options)

  const index = unit.engineers.findIndex(e => e.value === engineerValue)
  if (index < 0) return resolveUnitColor(unit.value, options)

  const engineer = unit.engineers[index]
  if (engineer.color) return engineer.color
  return deriveEngineerColor(resolveUnitColor(unit.value, options), index)
}
