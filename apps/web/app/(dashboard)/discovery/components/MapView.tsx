'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { Target } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'
import 'mapbox-gl/dist/mapbox-gl.css'

interface Props { targets: Target[] }

export default function MapView({ targets }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [selected, setSelected] = useState<Target | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const mappable = useMemo(
    () => targets.filter(t => t.lat != null && t.lng != null),
    [targets]
  )

  // Init map once
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !mapContainer.current || mapRef.current) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = token
      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [10, 50],
        zoom: 3.5,
      })
      mapRef.current = map
      map.on('load', () => setMapLoaded(true))
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Add markers when map is ready or targets change
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      mappable.forEach(target => {
        const score = target.target_scores?.[0]?.overall_score
        const isSelected = selected?.id === target.id

        const el = document.createElement('div')
        el.style.cssText = `
          width: 34px; height: 34px;
          border-radius: 2px;
          background: #0f172a;
          border: 1.5px solid ${isSelected ? '#f8fafc' : '#334155'};
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 700; color: #f8fafc;
          font-family: monospace;
          letter-spacing: 0.05em;
          transition: border-color 0.15s;
          z-index: 1;
        `
        el.textContent = score ? score.toFixed(1) : '—'
        el.addEventListener('click', () => {
          setSelected(prev => prev?.id === target.id ? null : target)
        })

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([target.lng!, target.lat!])
          .addTo(mapRef.current)
        markersRef.current.push(marker)
      })
    })
  }, [mapLoaded, mappable])

  const unmapped = targets.length - mappable.length

  return (
    <div className="space-y-2">
      {/* Map */}
      <div
        className="rounded-sm border overflow-hidden"
        style={{ height: 440 }}
      >
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Selected company panel — renders BELOW map, always visible */}
      {selected ? (
        <div className="rounded-sm border bg-card p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{selected.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[selected.city, selected.country].filter(Boolean).join(', ')}
              {selected.industry_label ? ` · ${selected.industry_label}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <ScoreBadge score={selected.target_scores?.[0]?.overall_score} size="sm" />
            <Link
              href={`/discovery/${selected.id}`}
              className="text-xs font-medium bg-foreground text-background rounded-sm px-3 py-2 hover:opacity-80 transition-opacity whitespace-nowrap"
            >
              View detail →
            </Link>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-sm border bg-muted/20 px-4 py-2.5 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {mappable.length} targets on map
            {unmapped > 0 ? ` · ${unmapped} not geocoded` : ''}
          </p>
          <p className="text-xs text-muted-foreground">Click a pin to select</p>
        </div>
      )}
    </div>
  )
}
