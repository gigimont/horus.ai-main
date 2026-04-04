'use client'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <AlertTriangle className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="text-sm text-muted-foreground mt-1">
          {error.message?.includes('fetch') || error.message?.includes('ECONNREFUSED')
            ? 'Could not connect to the API. Make sure the backend server is running on port 8000.'
            : 'An unexpected error occurred.'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>Try again</Button>
    </div>
  )
}
