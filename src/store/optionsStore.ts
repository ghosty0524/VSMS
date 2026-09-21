// src/store/optionsStore.ts
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../lib/api'
import { DEFAULT_OPTIONS } from '../constants'
import type { OptionsMap, Option, CategoryOption, CategoryStatsMode, TestUnitOption, RestDaysConfig, EngineerOption } from '../types'

interface OptionsState {
  options: OptionsMap
  init: () => Promise<void>
  setRestDays: (config: RestDaysConfig) => Promise<void>
  addCategory: (value: string) => Promise<void>
  updateCategory: (id: string, label: string) => Promise<void>
  toggleCategory: (id: string, isActive: boolean) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  setCategoryStatsMode: (id: string, statsMode: CategoryStatsMode) => Promise<void>
  addTestUnit: (value: string) => Promise<void>
  updateTestUnit: (id: string, label: string) => Promise<void>
  toggleTestUnit: (id: string, isActive: boolean) => Promise<void>
  deleteTestUnit: (id: string) => Promise<void>
  addEngineer: (unitId: string, name: string) => Promise<void>
  updateEngineer: (unitId: string, engId: string, name: string) => Promise<void>
  toggleEngineer: (unitId: string, engId: string, isActive: boolean) => Promise<void>
  removeEngineer: (unitId: string, engId: string) => Promise<void>
  setTestUnitColor: (id: string, color: string | null) => Promise<void>
  /** 所屬部門標籤（null = 自成一部），一次 PUT */
  setTestUnitDepartment: (id: string, department: string | null) => Promise<void>
  setEngineerColor: (unitId: string, engId: string, color: string | null) => Promise<void>
  /** 一次 PUT 把同一個 patch 套到多個單位列（人員頁「一個人一份屬性」） */
  patchEngineers: (
    targets: { unitId: string; engId: string }[],
    patch: Partial<Pick<EngineerOption, 'label' | 'isActive' | 'color'>>,
  ) => Promise<void>
  /** 讓 name 這個人恰好屬於 unitIds 這些單位：缺的新增一列、多的刪掉，一次 PUT；無變動不發 */
  setPersonUnits: (name: string, unitIds: string[]) => Promise<void>
  addDevice:    (value: string) => Promise<void>
  updateDevice: (id: string, label: string) => Promise<void>
  toggleDevice: (id: string, isActive: boolean) => Promise<void>
  deleteDevice: (id: string) => Promise<void>
}

/**
 * 送出 PUT，並用伺服器回應覆蓋樂觀更新的 next（AUTH_PROVIDER=vauth 下伺服器會忽略身分類
 * 欄位、回傳資料庫目前的最新狀態，畫面若仍套用 next 會顯示過期值）。
 * 回應不是合法的 options map（沒有 testUnits 陣列）時，退回原本樂觀更新的 next。
 */
async function persistOptions(options: OptionsMap): Promise<OptionsMap> {
  const res = await api.updateOptions(options)
  if (res && Array.isArray(res.testUnits)) return res
  return options
}

export const useOptionsStore = create<OptionsState>()((set, get) => ({
  options: DEFAULT_OPTIONS,

  init: async () => {
    const options = await api.getOptions()
    set({ options })
  },

  setRestDays: async (config) => {
    const next = { ...get().options, restDays: config }
    set({ options: await persistOptions(next) })
  },

  addCategory: async (value) => {
    const cats = get().options.categories
    const newCat: CategoryOption = {
      id: uuidv4(), value, label: value, isActive: true, sortOrder: cats.length,
      statsMode: 'counted',
    }
    const next = { ...get().options, categories: [...cats, newCat] }
    set({ options: await persistOptions(next) })
  },

  updateCategory: async (id, label) => {
    const next = {
      ...get().options,
      categories: get().options.categories.map((c) => c.id === id ? { ...c, label, value: label } : c),
    }
    set({ options: await persistOptions(next) })
  },

  toggleCategory: async (id, isActive) => {
    const next = {
      ...get().options,
      categories: get().options.categories.map((c) => c.id === id ? { ...c, isActive } : c),
    }
    set({ options: await persistOptions(next) })
  },

  deleteCategory: async (id) => {
    const next = {
      ...get().options,
      categories: get().options.categories.filter((c) => c.id !== id),
    }
    set({ options: await persistOptions(next) })
  },

  setCategoryStatsMode: async (id, statsMode) => {
    const next = {
      ...get().options,
      categories: get().options.categories.map((c) => c.id === id ? { ...c, statsMode } : c),
    }
    set({ options: await persistOptions(next) })
  },

  addTestUnit: async (value) => {
    const units = get().options.testUnits
    const newUnit: TestUnitOption = { id: uuidv4(), value, label: value, isActive: true, sortOrder: units.length, engineers: [] }
    const next = { ...get().options, testUnits: [...units, newUnit] }
    set({ options: await persistOptions(next) })
  },

  updateTestUnit: async (id, label) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, label, value: label } : u),
    }
    set({ options: await persistOptions(next) })
  },

  toggleTestUnit: async (id, isActive) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, isActive } : u),
    }
    set({ options: await persistOptions(next) })
  },

  deleteTestUnit: async (id) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.filter((u) => u.id !== id),
    }
    set({ options: await persistOptions(next) })
  },

  addEngineer: async (unitId, name) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        const eng: Option = { id: uuidv4(), value: name, label: name, isActive: true, sortOrder: u.engineers.length }
        return { ...u, engineers: [...u.engineers, eng] }
      }),
    }
    set({ options: await persistOptions(next) })
  },

  updateEngineer: async (unitId, engId, name) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        // ★ 只更新 label，不動 value（value 是識別碼，改名不應影響排程參照，比照 updateDevice）
        return { ...u, engineers: u.engineers.map((e) => e.id === engId ? { ...e, label: name } : e) }
      }),
    }
    set({ options: await persistOptions(next) })
  },

  toggleEngineer: async (unitId, engId, isActive) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        return { ...u, engineers: u.engineers.map((e) => e.id === engId ? { ...e, isActive } : e) }
      }),
    }
    set({ options: await persistOptions(next) })
  },

  removeEngineer: async (unitId, engId) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        return { ...u, engineers: u.engineers.filter((e) => e.id !== engId) }
      }),
    }
    set({ options: await persistOptions(next) })
  },

  setTestUnitColor: async (id, color) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, color } : u),
    }
    set({ options: await persistOptions(next) })
  },

  setTestUnitDepartment: async (id, department) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, department } : u),
    }
    set({ options: await persistOptions(next) })
  },

  setEngineerColor: async (unitId, engId, color) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        return { ...u, engineers: u.engineers.map((e) => e.id === engId ? { ...e, color } : e) }
      }),
    }
    set({ options: await persistOptions(next) })
  },

  patchEngineers: async (targets, patch) => {
    const wanted = new Set(targets.map(t => `${t.unitId}/${t.engId}`))
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => ({
        ...u,
        engineers: u.engineers.map((e) => wanted.has(`${u.id}/${e.id}`) ? { ...e, ...patch } : e),
      })),
    }
    set({ options: await persistOptions(next) })
  },

  setPersonUnits: async (name, unitIds) => {
    const want = new Set(unitIds)
    let changed = false
    // 重新加回某個單位時延用這個人現有列的 label／color，不要重置成 name／預設色
    const existing = get().options.testUnits.flatMap(u => u.engineers).find(e => e.value === name)
    const testUnits = get().options.testUnits.map((u) => {
      const has = u.engineers.some(e => e.value === name)
      if (want.has(u.id) && !has) {
        changed = true
        const eng: EngineerOption = {
          id: uuidv4(), value: name, label: existing?.label ?? name, isActive: true,
          sortOrder: u.engineers.length, color: existing?.color,
        }
        return { ...u, engineers: [...u.engineers, eng] }
      }
      if (!want.has(u.id) && has) {
        changed = true
        return { ...u, engineers: u.engineers.filter(e => e.value !== name) }
      }
      return u
    })
    if (!changed) return
    const next = { ...get().options, testUnits }
    set({ options: await persistOptions(next) })
  },

  addDevice: async (value) => {
    const devices = get().options.devices ?? []
    const newDevice = await api.createDevice({ value, label: value, sortOrder: devices.length })
    set({ options: { ...get().options, devices: [...devices, newDevice] } })
  },

  updateDevice: async (id, label) => {
    await api.updateDevice(id, { label })
    set({
      options: {
        ...get().options,
        // ★ 只更新 label，不動 value（value 是識別碼，改名不應影響排程參照）
        devices: (get().options.devices ?? []).map(d =>
          d.id === id ? { ...d, label } : d
        ),
      },
    })
  },

  toggleDevice: async (id, isActive) => {
    await api.updateDevice(id, { isActive })
    set({
      options: {
        ...get().options,
        devices: (get().options.devices ?? []).map(d => d.id === id ? { ...d, isActive } : d),
      },
    })
  },

  deleteDevice: async (id) => {
    await api.deleteDevice(id)
    set({
      options: {
        ...get().options,
        devices: (get().options.devices ?? []).filter(d => d.id !== id),
      },
    })
  },
}))