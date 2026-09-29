import { useEffect, useRef, useState } from 'react'
import '../../workspace/_shared/report.css'
import { downloadImage } from '../lib/download'

export default function ImagePreview({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [actual, setActual] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close() }, [])
  return <dialog ref={dialog} className="data-lightbox" aria-label="Image preview" onClose={onClose}><div className="data-lightbox-toolbar"><span className="data-lightbox-caption">{title}</span><button onClick={() => setActual(value => !value)}>{actual ? 'Fit' : '100%'}</button><a href={url} target="_blank" rel="noreferrer">Open original</a><button onClick={() => void downloadImage(url).catch(error => setError(error.message))}>Download</button><button onClick={() => dialog.current?.close()}>Close</button></div><div className={`data-lightbox-stage${actual ? ' actual' : ''}`}><img src={url} alt={title} onClick={() => setActual(value => !value)} onError={() => setError('This image could not be loaded.')} /></div><p className="data-lightbox-note" role="status">{error || 'Esc to close'}</p></dialog>
}

export function ZoomImage({ src, alt = '' }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false)
  if (!src) return <span>{alt}</span>
  return <><a href={src} target="_blank" rel="noreferrer" title="Open image" onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setOpen(true) } }}><img src={src} alt={alt} loading="lazy" /></a>{open && <ImagePreview url={src} title={alt || 'Image'} onClose={() => setOpen(false)} />}</>
}
