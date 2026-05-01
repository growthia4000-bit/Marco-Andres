import { useState, useEffect } from 'react'

export interface SavedFilter {
  id: string
  name: string
  filters: Record<string, string | undefined>
  createdAt: string
}

const STORAGE_KEY = 'crm_saved_filters'
const MAX_SAVED_FILTERS = 10

export function useSavedFilters(pageKey: string) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [filterName, setFilterName] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const allFilters = JSON.parse(stored)
        setSavedFilters(allFilters[pageKey] || [])
      } catch {
        setSavedFilters([])
      }
    }
  }, [pageKey])

  const saveFilter = (name: string, filters: SavedFilter['filters']) => {
    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name,
      filters,
      createdAt: new Date().toISOString(),
    }

    setSavedFilters(prev => {
      const updated = [newFilter, ...prev].slice(0, MAX_SAVED_FILTERS)
      updateStorage(pageKey, updated)
      return updated
    })
    setFilterName('')
    setShowSaveDialog(false)
  }

  const deleteFilter = (id: string) => {
    setSavedFilters(prev => {
      const updated = prev.filter(f => f.id !== id)
      updateStorage(pageKey, updated)
      return updated
    })
  }

  const updateStorage = (key: string, filters: SavedFilter[]) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const allFilters = stored ? JSON.parse(stored) : {}
      allFilters[key] = filters
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allFilters))
    } catch {
      console.error('Failed to save filters to localStorage')
    }
  }

  return {
    savedFilters,
    showSaveDialog,
    setShowSaveDialog,
    filterName,
    setFilterName,
    saveFilter,
    deleteFilter,
  }
}
