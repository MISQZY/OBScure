import type { ComponentType, ReactNode, SVGProps } from 'react'
import { IntegrationStatusBadge } from '@/components/IntegrationStatusBadge'

interface IntegrationPageLayoutProps {
  title: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  description: string
  status: string
  children: ReactNode
}

export function IntegrationPageLayout({ title, icon: Icon, description, status, children }: IntegrationPageLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-5 text-muted-foreground" />}
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <IntegrationStatusBadge status={status} />
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}
