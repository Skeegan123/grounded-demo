import { useEffect, useState, type RefObject } from 'react'

export function useConstrainedWorkbench(
  ref: RefObject<HTMLElement | null>,
  threshold: number,
) {
  const [isConstrained, setIsConstrained] = useState(false)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setIsConstrained(entry.contentRect.width < threshold)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [ref, threshold])

  return isConstrained
}
