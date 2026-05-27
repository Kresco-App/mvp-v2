import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getAuthRedirect } from '@/lib/authRedirect'
import { isJwtExpired, KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

export function proxy(request: NextRequest) {
  const token = request.cookies.get(KRESCO_TOKEN_COOKIE)?.value
  const userRole = request.cookies.get(KRESCO_USER_ROLE_COOKIE)?.value
  const decision = getAuthRedirect(request.nextUrl.pathname, token, isJwtExpired, userRole)

  if (decision.action === 'allow') return NextResponse.next()

  const response = NextResponse.redirect(new URL(decision.destination, request.url))
  if (decision.clearCookie) {
    response.cookies.delete(KRESCO_TOKEN_COOKIE)
    response.cookies.delete(KRESCO_USER_ROLE_COOKIE)
  }
  return response
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/calendar/:path*',
    '/classement/:path*',
    '/courses/:path*',
    '/exam/:path*',
    '/exam-bank/:path*',
    '/home/:path*',
    '/live/:path*',
    '/payment-success/:path*',
    '/pricing/:path*',
    '/profile/:path*',
    '/professor/:path*',
    '/professor-chat/:path*',
    '/topics/:path*',
    '/watch/:path*',
    '/zed/:path*',
  ],
}
