import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, useDesktop } from './client'

export default function MicrophoneMenu({ anchor, recording, close }: { anchor: HTMLElement; recording: boolean; close: () => void }) {
  const { settings } = useDesktop()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  async function refresh() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Microphone selection is unavailable in this window.')
      const list = await navigator.mediaDevices.enumerateDevices()
      if (alive.current) setDevices(list.filter(device => device.kind === 'audioinput' && device.deviceId !== 'default'))
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)) }
  }
  useEffect(() => {
    alive.current = true
    void refresh(); menu.current?.focus()
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) close() }
    const dismiss = () => close()
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', dismiss)
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => { alive.current = false; document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); navigator.mediaDevices?.removeEventListener('devicechange', refresh); anchor.focus() }
  }, [anchor, close])
  async function allow() {
    setBusy(true); setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      if (alive.current) await refresh()
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (alive.current) setBusy(false) }
  }
  async function choose(id: string, label: string) {
    if (busy || recording) return
    setBusy(true); setError('')
    try { await api('/settings', { dictationDeviceId: id, dictationDeviceLabel: label }); close() }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }
  }
  const bounds = anchor.getBoundingClientRect()
  return createPortal(<div ref={menu} className="microphone-menu" role="menu" aria-label="Microphone input" tabIndex={-1} style={{ right: Math.max(8, window.innerWidth - bounds.right), bottom: Math.max(8, window.innerHeight - bounds.top + 6) }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close() }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const next = (buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
  }}>
    <strong>Microphone input</strong>
    {recording && <p>Stop dictation before changing inputs.</p>}
    <button role="menuitemradio" aria-checked={!settings.dictationDeviceId} disabled={busy || recording} onClick={() => void choose('', '')}>System default</button>
    {devices.map((device, index) => <button key={device.deviceId || index} aria-label={device.label || `Microphone ${index + 1}`} role="menuitemradio" aria-checked={settings.dictationDeviceId === device.deviceId} disabled={busy || recording || !device.deviceId} onClick={() => void choose(device.deviceId, device.label)}>{device.label || `Microphone ${index + 1}`}</button>)}
    {settings.dictationDeviceId && !devices.some(device => device.deviceId === settings.dictationDeviceId) && <p>Saved input unavailable: {settings.dictationDeviceLabel || 'previous microphone'}. Choose an input again.</p>}
    {(!devices.length || devices.some(device => !device.label)) && <button role="menuitem" disabled={busy || recording} onClick={() => void allow()}>Allow microphone access to show inputs</button>}
    <button role="menuitem" disabled={busy} onClick={() => void refresh()}>Refresh inputs</button>
    {error && <p role="alert">{error}</p>}
  </div>, document.body)
}
