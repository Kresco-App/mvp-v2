import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import ThemeToggle from '@/components/ThemeToggle'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kresco — Plateforme E-Learning',
  description: 'Preparez votre Bac avec des cours video, des quiz interactifs et un suivi personnalise.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('kresco-theme');
                  if (t !== 'light' && t !== 'dark') t = 'dark';
                  document.documentElement.setAttribute('data-theme', t);
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeToggle />
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
