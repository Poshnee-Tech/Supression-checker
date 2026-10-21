export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" fill="#F26B1D" />
      <path
        d="M20 8.5l9 3.4v8.4c0 5.4-3.6 9.6-9 11.2-5.4-1.6-9-5.8-9-11.2v-8.4l9-3.4z"
        fill="#0B1F3A"
      />
      <path
        d="M15.6 20.4l3.1 3.1 5.9-6.3"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
