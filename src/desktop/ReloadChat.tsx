import { useEffect, useRef, useState } from 'react'
import { api, useDesktop } from './client'
import type { ChatSession } from './types'

export default function ReloadChat({ session, close }: { session: ChatSession; close: () => void }) {
  const state = useDesktop()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector('button')?.focus()
    return () => previous?.focus()
  }, [])
  async function reload() {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { await api(`/sessions/${session.id}/reload`, { confirmRestart: true }); close() }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); locked.current = false; setBusy(false) }
  }
  return <div className="desk-scrim" onClick={() => { if (!busy) close() }}>
    <div ref={dialog} className="desk-dialog" role="dialog" aria-modal="true" aria-labelledby="reload-chat-title" tabIndex={-1} onClick={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape' && !busy) close()
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        if (!buttons.length) { event.preventDefault(); return }
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus() }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus() }
      }
    }}>
      <h2 id="reload-chat-title">Reload chat?</h2>
      <p>Reconnect <strong>{session.name}</strong> to reload its MCP tools and configuration.</p>
      <p>This interrupts any work in this chat. Your saved conversation and message draft stay here. Other chats keep running.</p>
      {error && <p className="desk-error-inline" role="alert">{error}</p>}
      <div className="reload-chat-actions"><button className="desk-secondary" disabled={busy} onClick={close}>Cancel</button><button className="desk-primary" disabled={busy || !state.connected} onClick={reload}>{busy ? 'Reloading…' : 'Reload this chat'}</button></div>
    </div>
  </div>
}
