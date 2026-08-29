import { useState } from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollBar } from '@/components/ui/scroll-area'
import { useI18n } from '@/providers/I18nProvider'
import { cn } from '@/lib/utils'

interface CopyableUrlProps {
  url: string
  /** Extra classes for the wrapping row — pass a `max-w-*` here to cap a long URL's width instead of the default `w-fit`, which always grows to the full text. A capped URL doesn't truncate: the code text scrolls horizontally instead (same ScrollArea/ScrollBar as the rest of the app — a thin overlay bar that doesn't reflow the row), so the full address stays reachable to scroll to and select/copy by hand, not just via the copy button. */
  className?: string
}

/** A Browser Source address shown as read-only text with a one-click copy button. */
export function CopyableUrl({ url, className }: CopyableUrlProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('flex w-fit items-center gap-1 rounded bg-muted py-0.5 pr-0.5 pl-1.5', className)}>
      <ScrollAreaPrimitive.Root className="min-w-0 overflow-hidden">
        <ScrollAreaPrimitive.Viewport className="w-full rounded-[inherit] [&>div]:!block">
          <code className="select-text whitespace-nowrap text-sm" title={url}>{url}</code>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollAreaPrimitive.Root>
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
