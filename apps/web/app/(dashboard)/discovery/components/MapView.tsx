'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Target } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'

interface Props { targets: Target[] }

const SCORE_COLOR = (score: number | undefined) => {
  if (!score) return '#94a3b8'
  if (score >= 7.5) return '#10b981'
  if (score >= 5.0) return '#f59e0b'
  return '#ef4444'
}

export default function MapView({ targets }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [selected, setSelected] = useState<Target | null>(null)

  const mappable = useMemo(
    () => targets.filter(t => t.lat != null && t.lng != null),
    [targets]
  )
  const noCoords = targets.length - mappable.length

  const addMarkers = (map: mapboxgl.Map, mapboxgl: typeof import('mapbox-gl').default) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    mappable.forEach(target => {
      const score = target.target_scores?.[0]?.overall_score
      const color = SCORE_COLOR(score)
      const el = document.createElement('div')
      el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;`
      el.textContent = score ? score.toFixed(1) : '?'
      el.onclick = () => setSelected(target)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([target.lng!, target.lat!])
        .addTo(map)
      markersRef.current.push(marker)
    })
  }

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !mapContainer.current) return

    import('mapbox-gl').then(mod => {
      const mapboxgl = mod.default

      if (mapRef.current) {
        // Map already initialized — just refresh markers
        addMarkers(mapRef.current, mapboxgl)
        return
      }

      mapboxgl.accessToken = token
      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [10, 50],
        zoom: 3.5,
      })

      mapRef.current = map

      map.on('load', () => {
        addMarkers(map, mapboxgl)
      })
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [mappable])

  return (
    <div>
      <div className="relative rounded-sm overflow-hidden border" style={{ height: 480 }}>
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <p className="text-sm text-muted-foreground">Mapbox token not configured</p>
          </div>
        )}

        {noCoords > 0 && (
          <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm rounded-md px-3 py-1.5 text-xs text-muted-foreground border">
            {noCoords} target{noCoords > 1 ? 's' : ''} not shown — coordinates pending
          </div>
        )}

        <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm rounded-md px-3 py-2 border text-xs space-y-1">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /><span className="text-muted-foreground">Score ≥ 7.5</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /><span className="text-muted-foreground">Score 5–7.5</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /><span className="text-muted-foreground">Score &lt; 5</span></div>
        </div>
      </div>

      {/* Popup renders OUTSIDE the map container — no overflow clipping */}
      {selected && (
        <div className="mt-2 bg-card rounded-sm border p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold">{selected.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[selected.city, selected.country].filter(Boolean).join(', ')}
              {selected.industry_label ? ` · ${selected.industry_label}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ScoreBadge score={selected.target_scores?.[0]?.overall_score} size="sm" />
            <Link
              href={`/discovery/${selected.id}`}
              className="text-xs bg-foreground text-background rounded-sm px-3 py-1.5 hover:opacity-90 transition-opacity"
            >
              View detail
            </Link>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
