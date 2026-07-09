import type { ReactNode } from 'react'

import ProviderSpecificSettings from '../ProviderSpecific/ProviderSpecificSettings'

interface AuthConnectionSlotsLayoutProps {
  providerId: string
  children: ReactNode
}

export default function AuthConnectionSlotsLayout({ providerId, children }: AuthConnectionSlotsLayoutProps) {
  return (
    <section className="shrink-0">
      <div className="space-y-3">
        <ProviderSpecificSettings providerId={providerId} placement="beforeAuth" />
        <div className="flex flex-col gap-2">
          {children}
          <ProviderSpecificSettings providerId={providerId} placement="afterAuth" />
        </div>
      </div>
    </section>
  )
}
