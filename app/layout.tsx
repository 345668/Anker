import React from "react"
import type { Metadata, Viewport } from 'next'
import { DM_Sans, Outfit, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700']
});

const outfit = Outfit({ 
  subsets: ["latin"],
  variable: '--font-outfit',
  weight: ['400', '500', '600', '700', '800']
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: '--font-jetbrains'
});

export const metadata: Metadata = {
  title: 'Optimus - The AI platform to build your fundraise',
  description: 'The AI-powered platform for founders to discover investors, manage outreach, and close their fundraise faster.',
  generator: 'v0.app',
  keywords: ['fundraising', 'investors', 'startup', 'AI', 'venture capital', 'pitch deck', 'founder', 'seed', 'series a'],
  authors: [{ name: 'Optimus' }],
  openGraph: {
    title: 'Optimus - The AI platform to build your fundraise',
    description: 'The AI-powered platform for founders to discover investors, manage outreach, and close their fundraise faster.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#fafafa',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${dmSans.variable} ${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
