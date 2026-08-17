import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconSearch,
  IconTrash,
  IconDiscord,
  IconStar,
  IconLinkedIn,
  IconYouTube,
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

        <a
          href="https://discord.com"
          target="_blank"
          rel="noreferrer"
          className="social-pill discord-pill"
          title="Join Discord Community"
        >
          <IconDiscord size={15} />
          <span className="social-count">811</span>
        </a>

        <a
          href="https://github.com/Sor4nn/Server_Patching_Tool"
          target="_blank"
          rel="noreferrer"
          className="social-pill github-pill"
          title="Star on GitHub"
        >
          <IconStar size={14} className="star-icon" />
          <span className="social-count">3.2k</span>
        </a>

        <a
          href="https://linkedin.com"
          target="_blank"
          rel="noreferrer"
          className="social-pill linkedin-pill"
          title="LinkedIn Network"
        >
          <IconLinkedIn size={14} />
          <span className="social-count">803</span>
        </a>

        <a
          href="https://youtube.com"
          target="_blank"
          rel="noreferrer"
          className="social-pill youtube-pill"
          title="YouTube Channel"
        >
          <IconYouTube size={15} />
          <span className="social-count">194</span>
        </a>
      </div>
    </header>
  )
}
