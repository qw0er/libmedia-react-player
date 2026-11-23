import { createContext, useContext } from 'react'
import { playerLocales } from '../locales'

export const seekStepMs = 5000

export const PlayerText = createContext(playerLocales.en)

export function usePlayerText() {
  return useContext(PlayerText)
}

export function usePlayerLabels() {
  return usePlayerText().labels
}

export function clock(time: number) {
  const seconds = Math.floor(time / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${hours ? `${hours}:${pad(minutes % 60)}` : minutes}:${pad(seconds % 60)}`
}

export type PanelPage =
  | 'settings'
  | 'chapters'
  | 'audio'
  | 'subtitles'
  | 'speed'
  | 'mediaInfo'
