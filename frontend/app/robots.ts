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
const privateRoutePrefixes = [
  '/admin',
  '/animated-showcase',
  '/api',
  '/auth',
  '/calendar',
  '/classement',
  '/courses',
  '/exam',
  '/exam-bank',
  '/exercise-bank',
  '/figma-audit',
  '/home',
  '/live',
  '/media',
  '/onboarding',
  '/payment',
  '/pricing',
  '/profile',
  '/professor',
  '/professor-chat',
  '/staff',
  '/studio-review',
  '/topics',
  '/zed',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: privateRoutePrefixes,
      },
    ],
    sitemap: new URL('/sitemap.xml', siteUrl).toString(),
    host: siteUrl.origin,
  }
}
