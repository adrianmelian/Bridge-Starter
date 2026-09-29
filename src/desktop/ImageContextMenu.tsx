import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, desktopState } from './client'
import './image-context-menu.css'

type Target = { url: string; x: number; y: number }
export default function ImageContextMenu() {
  const [target, setTarget] = useState<Target | null>(null)
  const [resolved, setResolved] = useState<{ target: Target; path?: string; error?: string } | null>(null)
  const [status, setStatus] = useState('')
  const menu = useRef<HTMLDivElement>(null)
  const path = resolved?.target === target ? resolved.path : undefined
  const error = resolved?.target === target ? resolved.error : undefined
  useEffect(() => {
    const local = (event: MouseEvent) => {
      const image = event.target instanceof Element ? event.target.closest('img') : null
      if (!image) return
      event.preventDefault()
      const rect = image.getBoundingClientRect()
      setTarget({ url: image.currentSrc || image.src, x: event.clientX || rect.left, y: event.clientY || rect.top })
    }
    const report = (event: MessageEvent) => {
      if (event.data?.type !== 'bridge-image-menu' || typeof event.data.url !== 'string') return
      const base = desktopState().contentBase
      if (!base || event.origin !== new URL(base).origin) return
      const frame = [...document.querySelectorAll('iframe')].find(frame => frame.contentWindow === event.source)
      if (!frame || !frame.getClientRects().length || ![event.data.x, event.data.y].every(Number.isFinite)) return
      const rect = frame.getBoundingClientRect()
      setTarget({ url: event.data.url, x: rect.left + event.data.x, y: rect.top + event.data.y })
    }
    const dismiss = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setTarget(null) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current) { event.preventDefault(); event.stopPropagation(); setTarget(null) } }
    const resize = () => setTarget(null)
    document.addEventListener('contextmenu', local, true)
    window.addEventListener('message', report)
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('contextmenu', local, true); window.removeEventListener('message', report)
      document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', resize)
    }
  }, [])
  useEffect(() => {
    if (!target) return
    let cancelled = false
    api<{ path: string }>('/images/path', { url: target.url }).then(value => { if (!cancelled) setResolved({ target, path: value.path }) }).catch(e => { if (!cancelled) setResolved({ target, error: e.message }) })
    menu.current?.showPopover()
    return () => { cancelled = true }
  }, [target])
  useEffect(() => { menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus() }, [resolved])
  async function act(action: 'copy' | 'reveal') {
    if (!path) return
    try {
      if (action === 'copy') await navigator.clipboard.writeText(`"${path}"`)
      else await api('/reveal', { path })
      setStatus(action === 'copy' ? 'Image path copied.' : 'Image selected in Explorer.')
      setTarget(null)
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)) }
  }
  const host = document.querySelector('dialog[open]') || document.body
  return <>{target && createPortal(<div ref={menu} popover="manual" role="menu" aria-label="Image actions" className="image-context-menu" style={{ left: Math.max(4, Math.min(target.x, innerWidth - 264)), top: Math.max(4, Math.min(target.y, innerHeight - 140)) }}>
    <button role="menuitem" disabled={!path} onClick={() => void act('reveal')}>Open in Explorer</button>
    <button role="menuitem" disabled={!path} onClick={() => void act('copy')}>Copy as Path</button>
    {!path && <small>{error || 'Finding image file…'}</small>}
  </div>, host)}{status && <div className="image-action-status" role="status" onClick={() => setStatus('')}>{status}<button aria-label="Dismiss image notification" onClick={() => setStatus('')}>×</button></div>}</>
}
