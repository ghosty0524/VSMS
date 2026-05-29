// src/constants.ts
import { v4 as uuidv4 } from 'uuid'
import type { OptionsMap, Option, TestUnitOption } from './types'

export const MIN_DATE = new Date('2026-01-01')

export const FIELD_LIMITS = {
  PROJECT_NAME: 100,
  TASK_DESCRIPTION: 500,
  REQUIRED_PERSONNEL: 200,
  TEST_REPORT: 500,
  DELAY_REASON: 5000,
  DISPLAY_NAME: 50,
} as const

export const UNIT_COLORS: Record<string, string> = {
  'SIT-HW': '#4A90D9',
  'SIT-SW': '#F472B6',   // ★ 改動 1：粉紅色（原 #7ED321）
  'RA':     '#F5A623',
  'SI':     '#9B59B6',
}

export const EXTRA_COLORS = [
  '#E74C3C', '#1ABC9C', '#E67E22', '#2ECC71', '#E91E63',
]

// ★ 改動 2：新增溢出色常數
/** 時間資源溢出色（實際天數超過 timeResource 工作天時使用） */
export const OVERFLOW_COLOR = '#86EFAC'   // green-300

export function getUnitColor(unitValue: string, allUnits: string[]): string {
  if (UNIT_COLORS[unitValue]) return UNIT_COLORS[unitValue]
  const extras = allUnits.filter(u => !UNIT_COLORS[u])
  return EXTRA_COLORS[extras.indexOf(unitValue) % EXTRA_COLORS.length]
}

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Completed: { bg: '#16A34A', text: '#FFFFFF' },
  Delayed:   { bg: '#DC2626', text: '#FFFFFF' },
  Testing:   { bg: '#2563EB', text: '#FFFFFF' },
  Planned:   { bg: '#6B7280', text: '#FFFFFF' },
}

function makeOption(value: string, sortOrder: number): Option {
  return { id: uuidv4(), value, label: value, isActive: true, sortOrder }
}

function makeEngineer(name: string, idx: number): Option {
  return { id: uuidv4(), value: name, label: name, isActive: true, sortOrder: idx }
}

export const DEFAULT_OPTIONS: OptionsMap = {
  categories: [
    'NPI', 'AVL', '2nd Source', 'Security', 'Regression',
  ].map((v, i) => makeOption(v, i)),
  testUnits: [
    {
      ...makeOption('SIT-HW', 0),
      engineers: ['Eric','Darius','Jacky','Polson','Willie','Harry','Hsuan','Jeffrey','Wayhon','Ben'].map(makeEngineer),
    },
    {
      ...makeOption('SIT-SW', 1),
      engineers: ['Eric','Ashley','Kirin'].map(makeEngineer),
    },
    {
      ...makeOption('RA', 2),
      engineers: ['Will','Lily','Japon','Michael'].map(makeEngineer),
    },
    {
      ...makeOption('SI', 3),
      engineers: ['Brian','Wade','Raymond','Paul'].map(makeEngineer),
    },
  ] as TestUnitOption[],
  restDays: { weekends: true, specificDates: [] },
}