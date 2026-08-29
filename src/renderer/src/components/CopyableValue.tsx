import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/providers/I18nProvider'
import { cn } from '@/lib/utils'

interface CopyableValueProps {
  value: string
  className?: string
}

/** Same one-click-copy affordance as CopyableUrl, for an arbitrary value (a hash, a seed, ...) rather than specifically a Browser Source URL. */
export function CopyableValue({ value, className }: CopyableValueProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('flex w-fit max-w-full items-center gap-1 rounded bg-muted py-0.5 pr-0.5 pl-1.5', className)}>
      <code className="truncate text-xs">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label={copied ? t.common.copied : t.common.copy}
        title={copied ? t.common.copied : t.common.copy}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  )
}
