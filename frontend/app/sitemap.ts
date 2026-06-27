import type { MetadataRoute } from 'next'

function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://kresco.ma'

  try {
    return new URL('/', new URL(configuredUrl).origin)
  } catch {
    return new URL('https://kresco.ma')
  }
}

const siteUrl = getSiteUrl()

type PublicRoute = {
  path: string
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>
  priority: number
}

const publicRoutes: PublicRoute[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map(({ path, changeFrequency, priority }) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency,
    priority,
  }))
}
