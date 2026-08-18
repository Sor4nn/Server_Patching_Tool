import { useEffect, useMemo, useRef, useState } from 'react'
import { IconSearch } from './Icons'

export interface SearchSelectItem<T> {
  value: T
  label: string
  hint?: string
}

interface Props<T> {
  items: SearchSelectItem<T>[]
  selected: T | null
  onSelect: (v: T | null) => void
  placeholder: string
  allLabel?: string
  width?: number
}

export default function SearchSelect<T extends string | number>({
  items, selected, onSelect, placeholder, allLabel, width,
}: Props<T>) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedItem = useMemo(
    () => items.find((i) => i.value === selected) || null,
    [items, selected],
  )
  const value = open ? query : selectedItem ? selectedItem.label : ''

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      (i.hint || '').toLowerCase().includes(q))
  }, [items, query])

  useEffect(() => { setActive(0) }, [query, open])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (v: T | null) => {
    onSelect(v)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="host-search" ref={wrapRef} style={width ? { width } : undefined}>
      <IconSearch size={14} className="host-search-icon" />
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, matches.length))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (active === 0) choose(null)
            else if (matches[active - 1]) choose(matches[active - 1].value)
          } else if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
      />
      {selectedItem && !open && (
        <button
          type="button"
          className="host-search-clear"
          title={`Clear (${allLabel || 'all'})`}
          onClick={() => choose(null)}
        >
          ×
        </button>
      )}
      {open && (
        <div className="host-search-menu">
          <div
            className={`host-search-item ${active === 0 ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); choose(null) }}
          >
            {allLabel || 'All'}
          </div>
          {matches.map((i, idx) => (
            <div
              key={String(i.value)}
              className={`host-search-item ${active === idx + 1 ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(i.value) }}
            >
              {i.label}
              {i.hint && <span className="muted mono" style={{ fontSize: 11 }}> · {i.hint}</span>}
            </div>
          ))}
          {matches.length === 0 && (
            <div className="host-search-item muted">No match</div>
          )}
        </div>
      )}
    </div>
  )
}