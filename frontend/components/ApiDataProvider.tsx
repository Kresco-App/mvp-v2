'use client'

import { SWRConfig } from 'swr'
import { apiSWRConfig } from '@/lib/apiData'

export default function ApiDataProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={apiSWRConfig}>
      {children}
    </SWRConfig>
  )
}
