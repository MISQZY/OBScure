import type { ReactNode } from 'react'
import { IntegrationStatusBadge } from '@/components/IntegrationStatusBadge'

interface IntegrationPageLayoutProps {
  title: string
  description: string
  status: string
  children: ReactNode
}

export function IntegrationPageLayout({ title, description, status, children }: IntegrationPageLayoutProps) {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <IntegrationStatusBadge status={status} />
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}
