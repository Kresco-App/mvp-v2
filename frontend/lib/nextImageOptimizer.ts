export function nextImageOptimizerSrc(src: string, width: number, quality = 75) {
  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: String(quality),
  })
  return `/_next/image?${params.toString()}`
}
