import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kresco — Plateforme E-Learning',
  description: 'Preparez votre Bac avec des cours video, des quiz interactifs et un suivi personnalise.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased bg-slate-900 text-white">
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{ duration: 3000 }}
          expand={false}
          visibleToasts={3}
        />
      </body>
    </html>
  )
}
