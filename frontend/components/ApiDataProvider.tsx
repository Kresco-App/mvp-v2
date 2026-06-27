'use client'

import { SWRConfig } from 'swr'
import { apiSWRConfig } from '@/lib/apiData'
import { createApiDataCacheProvider } from '@/lib/apiDataCache'

const apiDataProviderConfig = {
  ...apiSWRConfig,
  provider: createApiDataCacheProvider,
}

export default function ApiDataProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={apiDataProviderConfig}>
      {children}
    </SWRConfig>
  )
}
