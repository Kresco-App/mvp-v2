import type { MetadataRoute } from 'next'

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kresco.ma')
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
