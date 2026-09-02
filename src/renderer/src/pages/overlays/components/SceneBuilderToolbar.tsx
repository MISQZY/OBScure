import { Panel } from '@xyflow/react'
import { Trash2, Check, X, Sparkles, FlaskConical, HelpCircle, Download, Upload } from 'lucide-react'
import type { CustomOverlay, OverlayUrls } from '@shared/types'
import { CopyableUrl } from '@/components/CopyableUrl'
import { slugify } from '@/lib/custom-overlays'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import type { SaveStatus } from '../sceneUtils'

/**
 * The floating top-center panel — name, URL key, and the save/prettify/
 * test/help/delete actions, centered above the canvas instead of a
 * full-width bar above it, now that the canvas itself fills the whole page.
 * Delete sits apart from the rest (top-right, next to the name) since it's
 * destructive and shouldn't be one click away from Save/Prettify/Test/Help,
 * which live together in a footer row instead.
 */
export function SceneBuilderToolbar({
  overlay,
  urls,
  nameInput,
  setNameInput,
  urlKeyInput,
  setUrlKeyInput,
  urlKeyLocked,
  setUrlKeyLocked,
  urlKeyError,
  commitName,
  commitUrlKey,
  onDelete,
  onPrettify,
  onExport,
  onImport,
  importInvalid,
  onDismissImportInvalid,
  pendingImportVersions,
  onConfirmPendingImport,
  onCancelPendingImport,
  saveStatus,
  onSave,
  testStatus,
  onTest,
  onStartTour
}: {
  overlay: CustomOverlay
  urls: OverlayUrls | null
  nameInput: string
  setNameInput: (value: string) => void
  urlKeyInput: string
  setUrlKeyInput: (value: string) => void
  urlKeyLocked: boolean
  setUrlKeyLocked: (locked: boolean) => void
  urlKeyError: string | null
  commitName: () => void
  commitUrlKey: () => void
  onDelete: () => void
  onPrettify: () => void
  onExport: () => void
  onImport: () => void
  importInvalid: boolean
  onDismissImportInvalid: () => void
  pendingImportVersions: { saved: string; current: string } | null
  onConfirmPendingImport: () => void
  onCancelPendingImport: () => void
  saveStatus: SaveStatus
  onSave: () => void
  testStatus: 'idle' | 'testing' | 'error'
  onTest: () => void
  onStartTour: () => void
}) {
  const { t } = useI18n()
  return (
    /*
      w-[27rem], not min-w: a shrink-to-fit (auto) width here made the
      URL-key row's own flex-wrap useless — an auto-width flex-col parent
      sizes itself off row 1/3's shorter content, then row 2 (label +
      url-key input + the CopyableUrl address, which needs ~27rem to lay
      out on one line) gets stretched to that narrower auto-computed width
      and simply overflows past this panel's own edge instead of wrapping,
      since flex-wrap only wraps against a container's REAL resolved
      width, not one still being auto-computed from shorter sibling rows.
      An explicit width removes that ambiguity — 27rem is row 2's own
      natural width, so normally nothing wraps and the URL shows in full;
      max-w clamps it smaller on a narrow canvas, and THEN flex-wrap
      correctly drops the URL box to its own line within that resolved
      width (see useResponsiveCanvasLayout's own doc comment for how the
      two side panels' collapse thresholds account for this width).
    */
    <Panel position="top-center" className="mt-3 w-[27rem] max-w-[calc(100%-2rem)] bg-card border rounded-xl shadow-md px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <input
          value={nameInput}
          onChange={(e) => {
            const value = e.target.value
            setNameInput(value)
            if (!urlKeyLocked) setUrlKeyInput(slugify(value))
          }}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setNameInput(overlay.name)
              if (!urlKeyLocked) setUrlKeyInput(overlay.urlKey)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          aria-label="Scene name"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight text-foreground outline-none border-b border-transparent rounded-sm px-0.5 -mx-0.5 hover:border-border focus:border-primary transition-colors"
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              title={t.sceneBuilder.nav.deleteScene}
              className="flex items-center justify-center p-2 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            >
              <Trash2 className="size-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>
              {interpolate(t.sceneBuilder.nav.deleteSceneConfirm, { name: overlay.name })}
            </AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                {t.common.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted-foreground shrink-0" htmlFor="scene-url-key" title={t.sceneBuilder.nav.urlKey}>
            {t.sceneBuilder.nav.urlKey}:
          </label>
          <input
            id="scene-url-key"
            value={urlKeyInput}
            onChange={(e) => {
              setUrlKeyLocked(true)
              setUrlKeyInput(e.target.value)
            }}
            onBlur={commitUrlKey}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="bg-muted border rounded px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-primary w-24 shrink-0"
          />
          {urls && (
            <div className="min-w-0 flex-1" data-tour="scene-builder-url">
              <CopyableUrl url={`${urls.customBase}/${encodeURIComponent(overlay.urlKey)}.html`} className="max-w-[220px]" />
            </div>
          )}
        </div>
        {urlKeyError && <p className="text-xs text-destructive">{urlKeyError}</p>}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t" data-tour="scene-builder-save">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPrettify}
            title={t.sceneBuilder.nav.prettify}
            className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Sparkles className="size-4" />
          </button>
          <button
            onClick={onExport}
            title={t.sceneBuilder.nav.exportScene}
            className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Download className="size-4" />
          </button>
          <button
            onClick={onImport}
            title={t.sceneBuilder.nav.importScene}
            className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Upload className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSave}
            disabled={saveStatus === 'saving'}
            className={cn(
              'flex items-center gap-1.5 text-sm font-semibold py-2 px-3.5 rounded-md transition-colors disabled:cursor-wait',
              saveStatus === 'saved' && 'bg-green-600 hover:bg-green-600 text-white',
              saveStatus === 'error' && 'bg-destructive hover:bg-destructive text-destructive-foreground',
              (saveStatus === 'idle' || saveStatus === 'saving') && 'bg-primary hover:bg-primary/90 text-primary-foreground'
            )}
          >
            {saveStatus === 'saved' && <Check className="size-4" />}
            {saveStatus === 'error' && <X className="size-4" />}
            {saveStatus === 'saving'
              ? t.sceneBuilder.nav.saving
              : saveStatus === 'saved'
                ? t.sceneBuilder.nav.saved
                : saveStatus === 'error'
                  ? t.sceneBuilder.nav.saveFailed
                  : t.sceneBuilder.nav.save}
          </button>
          <button
            onClick={onTest}
            disabled={testStatus === 'testing'}
            title={t.sceneBuilder.nav.test}
            className={cn(
              'flex items-center justify-center p-2 rounded-md border transition-colors disabled:cursor-wait',
              testStatus === 'error'
                ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {testStatus === 'error' ? <X className="size-4" /> : <FlaskConical className="size-4" />}
          </button>
        </div>
        <button
          onClick={onStartTour}
          title={t.sceneBuilder.nav.tutorial}
          className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <HelpCircle className="size-4" />
        </button>
      </div>

      <AlertDialog open={importInvalid} onOpenChange={(open) => !open && onDismissImportInvalid()}>
        <AlertDialogContent>
          <AlertDialogTitle>{t.sceneBuilder.nav.importInvalid}</AlertDialogTitle>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onDismissImportInvalid}>{t.common.ok}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingImportVersions !== null} onOpenChange={(open) => !open && onCancelPendingImport()}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {pendingImportVersions &&
              interpolate(t.sceneBuilder.nav.importVersionWarning, {
                savedVersion: pendingImportVersions.saved,
                currentVersion: pendingImportVersions.current
              })}
          </AlertDialogTitle>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelPendingImport}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmPendingImport}>{t.sceneBuilder.nav.importAnyway}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}
