'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Network } from 'lucide-react'
import { api, OfficerNetworkRow } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  targetId: string
}

export default function OfficerNetworkPanel({ targetId }: Props) {
  const [connections, setConnections] = useState<OfficerNetworkRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.officerNetwork.forTarget(targetId)
      .then(res => setConnections(res.connections))
      .catch(() => setConnections([]))
      .finally(() => setLoaded(true))
  }, [targetId])

  if (!loaded || connections.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-2">
          <Network className="h-3.5 w-3.5 text-muted-foreground" />
          <CardTitle className="text-sm">Officer Connections</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-0">
        {connections.map(conn => {
          if (conn.match_type === 'exact') {
            const otherTargets = conn.target_ids
              .map((tid, i) => ({
                id: tid,
                name: conn.target_names[i] ?? tid,
                role: conn.roles[i] ?? null,
              }))
              .filter(t => t.id !== targetId)

            if (otherTargets.length === 0) return null

            return (
              <div
                key={conn.id}
                className="flex items-start gap-3 py-2 border-b border-border last:border-0"
              >
                <Network className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{conn.officer_name}</p>
                  <div className="mt-0.5 space-y-0.5">
                    {otherTargets.map(t => (
                      <div key={t.id} className="flex items-center gap-1.5">
                        <Link
                          href={`/discovery/${t.id}`}
                          className="text-xs text-primary hover:underline underline-offset-2"
                        >
                          {t.name}
                        </Link>
                        {t.role && (
                          <span className="text-xs text-muted-foreground">· {t.role}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          if (conn.match_type === 'family_name') {
            const otherTargets = conn.target_ids
              .map((tid, i) => ({ id: tid, name: conn.target_names[i] ?? tid }))
              .filter(t => t.id !== targetId)

            if (otherTargets.length === 0) return null

            return (
              <div
                key={conn.id}
                className="flex items-start gap-3 py-2 border-b border-border last:border-0"
              >
                <Network className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {conn.officer_name} family group
                  </p>
                  <div className="mt-0.5 space-y-0.5">
                    {otherTargets.map(t => (
                      <Link
                        key={t.id}
                        href={`/discovery/${t.id}`}
                        className="block text-xs text-primary hover:underline underline-offset-2"
                      >
                        {t.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          return null
        })}
      </CardContent>
    </Card>
  )
}
