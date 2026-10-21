import type { CheckStatus } from '@/lib/types'

export function StatusIcon({
  status,
  className = 'h-8 w-8',
}: {
  status: CheckStatus
  className?: string
}) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (status === 'PASS') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9.2" strokeWidth={1.8} />
        <path d="M7.8 12.4l2.9 2.9 5.5-6.1" />
      </svg>
    )
  }

  if (status === 'FAIL') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9.2" strokeWidth={1.8} />
        <path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" />
      </svg>
    )
  }

  if (status === 'INVALID') {
    return (
      <svg {...common}>
        <path d="M10.3 3.9L2.6 17.2A1.9 1.9 0 004.3 20h15.4a1.9 1.9 0 001.7-2.8L13.7 3.9a1.9 1.9 0 00-3.4 0z" strokeWidth={1.8} />
        <path d="M12 9.2v4.1" />
        <path d="M12 16.6h.01" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9.2" strokeWidth={1.8} />
      <path d="M12 7.6v5" />
      <path d="M12 16.2h.01" />
    </svg>
  )
}
