interface Props {
  size?: number
  context?: 'dark' | 'light'
  className?: string
}

export default function LogoMark({ size = 24, context = 'dark', className }: Props) {
  const s = size
  const half = s / 2
  const outerFill  = context === 'dark' ? '#1e293b' : '#0f172a'
  const ringStroke = context === 'dark' ? '#334155' : '#475569'
  const bracket    = '#f8fafc'
  const dot        = context === 'dark' ? '#475569' : '#94a3b8'

  const o = half
  const r = half * 0.625
  const c = half * 0.25
  const bl = half * 0.375
  const bw = size * 0.0625 * 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-half} ${-half} ${s} ${s}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer square */}
      <rect x={-o} y={-o} width={s} height={s} fill={outerFill} rx={size * 0.09}/>
      {/* Inner ring */}
      <rect x={-r} y={-r} width={r*2} height={r*2} stroke={ringStroke} strokeWidth={size * 0.03}/>
      {/* Center square */}
      <rect x={-c} y={-c} width={c*2} height={c*2} fill={bracket}/>
      {/* Top-left bracket */}
      <line x1={-o} y1={-o} x2={-o+bl} y2={-o} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      <line x1={-o} y1={-o} x2={-o} y2={-o+bl} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      {/* Top-right bracket */}
      <line x1={o} y1={-o} x2={o-bl} y2={-o} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      <line x1={o} y1={-o} x2={o} y2={-o+bl} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      {/* Bottom-left bracket */}
      <line x1={-o} y1={o} x2={-o+bl} y2={o} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      <line x1={-o} y1={o} x2={-o} y2={o-bl} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      {/* Bottom-right bracket */}
      <line x1={o} y1={o} x2={o-bl} y2={o} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      <line x1={o} y1={o} x2={o} y2={o-bl} stroke={bracket} strokeWidth={bw} strokeLinecap="square"/>
      {/* Inner ring corner dots */}
      <circle cx={-r} cy={-r} r={size * 0.045} fill={dot}/>
      <circle cx={r}  cy={-r} r={size * 0.045} fill={dot}/>
      <circle cx={-r} cy={r}  r={size * 0.045} fill={dot}/>
      <circle cx={r}  cy={r}  r={size * 0.045} fill={dot}/>
    </svg>
  )
}
