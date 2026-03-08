interface Props {
  size?: number
  className?: string
}

export default function KrescoLogo({ size = 48, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Main blob body */}
      <ellipse cx="28" cy="30" rx="24" ry="22" fill="#1A1654" />
      <ellipse cx="28" cy="26" rx="22" ry="20" fill="#1A1654" />
      {/* Slight blob shape on top */}
      <path
        d="M10 26 C10 14 16 8 28 8 C40 8 46 14 46 26 C46 40 40 48 28 48 C16 48 10 40 10 26Z"
        fill="#1A1654"
      />
      {/* Left eye white */}
      <circle cx="20" cy="25" r="6" fill="white" />
      {/* Left pupil */}
      <circle cx="21.5" cy="23.5" r="2.8" fill="#1A1654" />
      {/* Right eye white */}
      <circle cx="36" cy="25" r="6" fill="white" />
      {/* Right pupil */}
      <circle cx="37.5" cy="23.5" r="2.8" fill="#1A1654" />
    </svg>
  )
}
