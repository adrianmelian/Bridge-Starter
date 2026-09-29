/** Bridge insignia; legacy component props keep existing call sites compatible. */
export default function MakLogo({ size = 64, tone = 'pink' }: { size?: number; animated?: boolean; tone?: 'pink' | 'black' }) {
  return <img className="mak-logo" src={tone === 'black' ? '/assets/ready-room-insignia.svg' : '/assets/bridge-insignia.svg'} width={size} height={size} alt="" aria-hidden="true" draggable={false} style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }} />
}
