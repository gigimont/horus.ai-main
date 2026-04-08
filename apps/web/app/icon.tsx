import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  const s = 32
  const half = 16
  const r = half * 0.625
  const c = half * 0.25
  const bl = half * 0.375
  const bw = 2

  return new ImageResponse(
    (
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="0" y="0" width={s} height={s} fill="#0f172a" rx="6"/>
        <rect
          x={half - r} y={half - r}
          width={r*2} height={r*2}
          fill="none" stroke="#334155" strokeWidth="1"
        />
        <rect
          x={half - c} y={half - c}
          width={c*2} height={c*2}
          fill="#f8fafc"
        />
        {/* Top-left bracket */}
        <line x1="0" y1="0" x2={bl} y2="0" stroke="#f8fafc" strokeWidth={bw}/>
        <line x1="0" y1="0" x2="0" y2={bl} stroke="#f8fafc" strokeWidth={bw}/>
        {/* Top-right bracket */}
        <line x1={s} y1="0" x2={s-bl} y2="0" stroke="#f8fafc" strokeWidth={bw}/>
        <line x1={s} y1="0" x2={s} y2={bl} stroke="#f8fafc" strokeWidth={bw}/>
        {/* Bottom-left bracket */}
        <line x1="0" y1={s} x2={bl} y2={s} stroke="#f8fafc" strokeWidth={bw}/>
        <line x1="0" y1={s} x2="0" y2={s-bl} stroke="#f8fafc" strokeWidth={bw}/>
        {/* Bottom-right bracket */}
        <line x1={s} y1={s} x2={s-bl} y2={s} stroke="#f8fafc" strokeWidth={bw}/>
        <line x1={s} y1={s} x2={s} y2={s-bl} stroke="#f8fafc" strokeWidth={bw}/>
      </svg>
    ),
    { ...size }
  )
}
