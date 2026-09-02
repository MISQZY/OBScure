import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useWhatsNew } from '@/hooks/use-whats-new'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'

/** One-time "what's new" dialog: shown after an update once main resolves a non-null payload from useWhatsNew, listing every release skipped between the old and new version. Self-dismisses for the rest of the session once closed. */
export function WhatsNewDialog() {
  const payload = useWhatsNew()
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(false)

  if (!payload || dismissed) return null

  return (
    <Dialog open onOpenChange={(open) => !open && setDismissed(true)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.whatsNew.title}</DialogTitle>
          <DialogDescription>
            {interpolate(t.whatsNew.description, { from: payload.fromVersion, to: payload.toVersion })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-3">
          {payload.entries.map((entry) => (
            <div key={entry.version} className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold">v{entry.version}</h4>
              {entry.notes.length > 0 ? (
                <ul className="list-disc pl-4 text-sm text-muted-foreground">
                  {entry.notes.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t.whatsNew.noNotes}</p>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => setDismissed(true)}>{t.whatsNew.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
