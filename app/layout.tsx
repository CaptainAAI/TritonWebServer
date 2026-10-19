import type { Metadata } from 'next'
import './globals.css'

import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
import AppBar from '@/components/AppBar'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: 'Triton Inference Server Web UI',
  description: 'Triton Inference Server Web UI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" defaultMode="system" />
        <Providers>
          <AppBar />
          {children}
        </Providers>
      </body>
    </html>
  )
}
