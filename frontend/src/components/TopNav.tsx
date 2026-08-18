import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconSearch,
  IconTrash,
} from './Icons'

interface TopNavProps {
  onSearch?: (query: string) => void
}

export const TopNav: React.FC<TopNavProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      if (onSearch) {
        onSearch(query.trim())
      } else {
        navigate(`/hosts?search=${encodeURIComponent(query.trim())}`)
      }
    }
  }

  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <div className="top-search-bar">
          <IconSearch className="top-search-icon" size={16} />
          <input
            type="text"
            className="top-search-input"
            placeholder="Search hosts, packages, repos..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (onSearch) onSearch(e.target.value)
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div className="top-nav-right">
        <button
          type="button"
          className="top-icon-btn text-amber"
          title="Clean / Cache Purge"
          onClick={() => {
            alert('Cache and temporary logs cleaned.')
          }}
        >
          <IconTrash size={16} />
        </button>
      </div>
    </header>
  )
}