import { Skeleton } from '@/components/ui/skeleton'

export default function ClustersLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
