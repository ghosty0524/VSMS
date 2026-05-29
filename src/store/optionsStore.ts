// src/store/optionsStore.ts
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../lib/api'
import { DEFAULT_OPTIONS } from '../constants'
import type { OptionsMap, Option, TestUnitOption, RestDaysConfig } from '../types'

interface OptionsState {
  options: OptionsMap
  init: () => Promise<void>
  setRestDays: (config: RestDaysConfig) => Promise<void>
  addCategory: (value: string) => Promise<void>
  updateCategory: (id: string, label: string) => Promise<void>
  toggleCategory: (id: string, isActive: boolean) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  addTestUnit: (value: string) => Promise<void>
  updateTestUnit: (id: string, label: string) => Promise<void>
  toggleTestUnit: (id: string, isActive: boolean) => Promise<void>
  deleteTestUnit: (id: string) => Promise<void>
  addEngineer: (unitId: string, name: string) => Promise<void>
  updateEngineer: (unitId: string, engId: string, name: string) => Promise<void>
  removeEngineer: (unitId: string, engId: string) => Promise<void>
}

async function persistOptions(options: OptionsMap): Promise<void> {
  await api.updateOptions(options)
}

export const useOptionsStore = create<OptionsState>()((set, get) => ({
  options: DEFAULT_OPTIONS,

  init: async () => {
    const options = await api.getOptions()
    set({ options })
  },

  setRestDays: async (config) => {
    const next = { ...get().options, restDays: config }
    await persistOptions(next)
    set({ options: next })
  },

  addCategory: async (value) => {
    const cats = get().options.categories
    const newCat: Option = { id: uuidv4(), value, label: value, isActive: true, sortOrder: cats.length }
    const next = { ...get().options, categories: [...cats, newCat] }
    await persistOptions(next)
    set({ options: next })
  },

  updateCategory: async (id, label) => {
    const next = {
      ...get().options,
      categories: get().options.categories.map((c) => c.id === id ? { ...c, label, value: label } : c),
    }
    await persistOptions(next)
    set({ options: next })
  },

  toggleCategory: async (id, isActive) => {
    const next = {
      ...get().options,
      categories: get().options.categories.map((c) => c.id === id ? { ...c, isActive } : c),
    }
    await persistOptions(next)
    set({ options: next })
  },

  deleteCategory: async (id) => {
    const next = {
      ...get().options,
      categories: get().options.categories.filter((c) => c.id !== id),
    }
    await persistOptions(next)
    set({ options: next })
  },

  addTestUnit: async (value) => {
    const units = get().options.testUnits
    const newUnit: TestUnitOption = { id: uuidv4(), value, label: value, isActive: true, sortOrder: units.length, engineers: [] }
    const next = { ...get().options, testUnits: [...units, newUnit] }
    await persistOptions(next)
    set({ options: next })
  },

  updateTestUnit: async (id, label) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, label, value: label } : u),
    }
    await persistOptions(next)
    set({ options: next })
  },

  toggleTestUnit: async (id, isActive) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, isActive } : u),
    }
    await persistOptions(next)
    set({ options: next })
  },

  deleteTestUnit: async (id) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.filter((u) => u.id !== id),
    }
    await persistOptions(next)
    set({ options: next })
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
    await persistOptions(next)
    set({ options: next })
  },

  updateEngineer: async (unitId, engId, name) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        return { ...u, engineers: u.engineers.map((e) => e.id === engId ? { ...e, value: name, label: name } : e) }
      }),
    }
    await persistOptions(next)
    set({ options: next })
  },

  removeEngineer: async (unitId, engId) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        return { ...u, engineers: u.engineers.filter((e) => e.id !== engId) }
      }),
    }
    await persistOptions(next)
    set({ options: next })
  },
}))