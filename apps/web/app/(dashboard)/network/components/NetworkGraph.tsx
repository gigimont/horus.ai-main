'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { type NetworkEdge, type Target } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

const EDGE_COLORS: Record<string, string> = {
  supply_chain:     '#3b82f6',
  geographic:       '#22c55e',
  industry:         '#a855f7',
  customer_overlap: '#f97316',
  vendor_overlap:   '#14b8a6',
}

function nodeColor(score: number | undefined | null): string {
  if (score === undefined || score === null) return '#94a3b8'
  if (score >= 7) return '#22c55e'
  if (score >= 4) return '#f59e0b'
  return '#ef4444'
}

function nodeRadius(revenue: number | null | undefined): number {
  if (!revenue) return 18
  return Math.max(14, Math.min(32, 12 + Math.sqrt(revenue / 1_000_000) * 2))
}

interface Props {
  nodes: Target[]
  edges: NetworkEdge[]
  activeEdgeTypes: Set<string>
  minStrength: number
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  score?: number | null
  revenue: number | null | undefined
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  edge_type: string
  strength: number
  description: string
  edgeId: string
}

export default function NetworkGraph({ nodes, edges, activeEdgeTypes, minStrength }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const container = svgRef.current.parentElement!
    const width = container.clientWidth || 800
    const height = container.clientHeight || 600

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    const visibleEdges = edges.filter(
      e => activeEdgeTypes.has(e.edge_type) && e.strength >= minStrength
    )

    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.id,
      name: n.name,
      score: n.target_scores?.[0]?.overall_score,
      revenue: n.revenue_eur,
    }))

    const nodeById = new Map(simNodes.map(n => [n.id, n]))

    const simLinks: SimLink[] = visibleEdges
      .filter(e => nodeById.has(e.source_target_id) && nodeById.has(e.dest_target_id))
      .map(e => ({
        source: e.source_target_id,
        target: e.dest_target_id,
        edge_type: e.edge_type,
        strength: e.strength,
        description: e.description,
        edgeId: e.id,
      }))

    const g = svg.append('g')

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform))
    )

    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(d => 120 - d.strength * 60)
        .strength(d => d.strength * 0.4)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => nodeRadius(d.revenue) + 8))

    const tooltip = d3.select('body')
      .selectAll<HTMLDivElement, unknown>('.network-tooltip')
      .data([null])
      .join('div')
      .attr('class', 'network-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', '#0f172a')
      .style('border', '1px solid #1e293b')
      .style('color', '#f1f5f9')
      .style('padding', '8px 12px')
      .style('border-radius', '2px')
      .style('font-size', '12px')
      .style('max-width', '220px')
      .style('z-index', '9999')
      .style('opacity', '0')

    const link = g.append('g').selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', d => EDGE_COLORS[d.edge_type] ?? '#64748b')
      .attr('stroke-width', d => Math.max(1, d.strength * 3))
      .attr('stroke-dasharray', d => d.strength < 0.3 ? '4 3' : null)
      .attr('stroke-opacity', 0.7)
      .style('cursor', 'pointer')
      .on('mouseover', (_event, d) => {
        tooltip
          .style('opacity', '1')
          .html(`<strong>${d.edge_type.replace(/_/g, ' ')}</strong><br/>Strength: ${d.strength.toFixed(2)}<br/>${d.description}`)
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', `${(event as MouseEvent).clientX + 14}px`)
          .style('top', `${(event as MouseEvent).clientY - 10}px`)
      })
      .on('mouseout', () => tooltip.style('opacity', '0'))

    const node = g.append('g').selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )
      .on('click', (_event, d) => router.push(`/discovery/${d.id}`))
      .on('mouseover', (event, d) => {
        tooltip
          .style('opacity', '1')
          .html(`<strong>${d.name}</strong><br/>Score: ${d.score !== undefined && d.score !== null ? (d.score as number).toFixed(1) : 'N/A'}`)
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', `${(event as MouseEvent).clientX + 14}px`)
          .style('top', `${(event as MouseEvent).clientY - 10}px`)
      })
      .on('mouseout', () => tooltip.style('opacity', '0'))

    node.append('circle')
      .attr('r', d => nodeRadius(d.revenue))
      .attr('fill', d => nodeColor(d.score))
      .attr('fill-opacity', 0.9)
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2)

    node.append('text')
      .text(d => d.name.length > 14 ? d.name.slice(0, 13) + '\u2026' : d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d.revenue) + 13)
      .attr('font-size', 11)
      .attr('fill', '#cbd5e1')
      .attr('pointer-events', 'none')

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => {
      simulation.stop()
      d3.select('body').selectAll('.network-tooltip').remove()
    }
  }, [nodes, edges, activeEdgeTypes, minStrength, router])

  return <svg ref={svgRef} className="w-full h-full" />
}
