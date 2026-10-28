import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onOpenPdf: () => void
  onSettings: () => void
  settingsActive?: boolean
}

/** The glass sidebar every screen shares: brand on top, a section in the
 *  middle, Settings and "+ Open PDF" at the bottom. */
export function Sidebar({ children, onOpenPdf, onSettings, settingsActive }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="wordmark">
          Blanks<span />
        </div>
        <div className="chip-local" title="Your files never leave this computer">
          Local
        </div>
      </div>
      {children}
      <div className="spacer" />
      <button className="nav" type="button" onClick={onSettings} aria-current={settingsActive ? 'page' : undefined}>
        <span className="grow">Settings</span>
      </button>
      <button className="pill pill-deep" type="button" onClick={onOpenPdf}>
        + Open PDF
      </button>
    </aside>
  )
}
