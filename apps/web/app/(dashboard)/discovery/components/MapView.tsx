'use client'
import { useEffect, useRef, useState } from 'react'
import { Target } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { useRouter } from 'next/navigation'

interface Props {
  targets: Target[]
}

const SCORE_COLOR = (score: number | undefined) => {
  if (!score) return '#94a3b8'
  if (score >= 7.5) return '#10b981'
  if (score >= 5.0) return '#f59e0b'
  return '#ef4444'
}

const CITY_COORDS: Record<string, [number, number]> = {
  'Brescia':   [10.2118, 45.5416],
  'Munich':    [11.5820, 48.1351],
  'Barcelona': [2.1734, 41.3851],
  'Lyon':      [4.8357, 45.7640],
  'Katowice':  [19.0238, 50.2649],
  'Berlin':    [13.4050, 52.5200],
  'Turin':     [7.6869, 45.0703],
  'Paris':     [2.3522, 48.8566],
  'Madrid':    [3.7038, 40.4168],
  'Rome':      [12.4964, 41.9028],
  'Vienna':    [16.3738, 48.2082],
  'Warsaw':    [21.0122, 52.2297],
  'Amsterdam': [4.9041, 52.3676],
  'Brussels':  [4.3517, 50.8503],
  'Zurich':    [8.5417, 47.3769],
  'Stuttgart': [9.1829, 48.7758],
  'Hamburg':   [9.9937, 53.5511],
  'Frankfurt': [8.6821, 50.1109],
}

export default function MapView({ targets }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)
  const [selected, setSelected] = useState<Target | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      (mapboxgl as { accessToken: string }).accessToken = token
      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [10, 50],
        zoom: 3.5,
      })

      map.on('load', () => {
        mapRef.current = map
        targets.forEach(target => {
          const coords = target.city ? CITY_COORDS[target.city] : null
          if (!coords) return
          const score = target.target_scores?.[0]?.overall_score
          const color = SCORE_COLOR(score)
          const el = document.createElement('div')
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;`
          el.textContent = score ? score.toFixed(1) : '?'
          el.onclick = () => setSelected(target)
          new mapboxgl.Marker({ element: el }).setLngLat(coords).addTo(map)
        })
      })
    })

    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove()
        mapRef.current = null
      }
    }
  }, [targets])

  const noCoords = targets.filter(t => !t.city || !CITY_COORDS[t.city]).length

  return (
    <div className="relative rounded-lg overflow-hidden border" style={{ height: 480 }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <p className="text-sm text-muted-foreground">Mapbox token not configured</p>
        </div>
      )}

      {noCoords > 0 && (
        <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm rounded-md px-3 py-1.5 text-xs text-muted-foreground border">
          {noCoords} target{noCoords > 1 ? 's' : ''} not shown — no coordinates found
        </div>
      )}

      {selected && (
        <div className="absolute top-3 right-3 bg-card rounded-lg border shadow-lg p-4 w-64">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-semibold">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {[selected.city, selected.country].filter(Boolean).join(', ')}
              </p>
            </div>
            <ScoreBadge score={selected.target_scores?.[0]?.overall_score} size="sm" />
          </div>
          {selected.industry_label && (
            <p className="text-xs text-muted-foreground mb-3">{selected.industry_label}</p>
          )}
          <div className="flex gap-2">
            <button
              className="flex-1 text-xs bg-primary text-primary-foreground rounded-md px-2 py-1.5 hover:opacity-90"
              onClick={() => router.push(`/discovery/${selected.id}`)}
            >
              View detail
            </button>
            <button
              className="text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm rounded-md px-3 py-2 border text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /><span className="text-muted-foreground">Score ≥ 7.5</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /><span className="text-muted-foreground">Score 5–7.5</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /><span className="text-muted-foreground">Score &lt; 5</span></div>
      </div>
    </div>
  )
}
