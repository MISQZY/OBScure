import { useState } from 'react'
import { Panel } from '@xyflow/react'
import { ChevronRight, PanelLeft } from 'lucide-react'
import { CATEGORY_STYLES, NODE_CATEGORY } from '@/components/nodes'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NODE_PALETTE, PALETTE_GROUPS } from '../sceneBuilderConstants'

/**
 * The floating top-left panel listing every placeable node type, grouped and
 * collapsible. Below `isNarrow` (see useResponsiveCanvasLayout) it collapses
 * to just a toggle button instead of staying permanently pinned — freeing up
 * the width the centered toolbar needs so the two stop painting over each
 * other on a narrow window.
 */
export function AddNodePalette({
  isNarrow,
  onPaletteDragStart
}: {
  isNarrow: boolean
  onPaletteDragStart: (event: React.DragEvent, type: string) => void
}) {
  const { t } = useI18n()
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Every Add Node group starts collapsed — the palette lists every node
  // type across every group up front otherwise, which is a lot to scan past
  // just to find one node in one group.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PALETTE_GROUPS.map((group) => [group, true]))
  )

  return (
    <Panel position="top-left" data-tour="scene-builder-add-node" className="m-4 flex flex-col items-start gap-2">
      {isNarrow && (
        <button
          type="button"
          onClick={() => setPaletteOpen((open) => !open)}
          title={paletteOpen ? t.sceneBuilder.nav.hidePalette : t.sceneBuilder.nav.showPalette}
          className="flex items-center justify-center p-2.5 rounded-lg border bg-card shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <PanelLeft className="size-4" />
        </button>
      )}
      {(!isNarrow || paletteOpen) && (
        // React Flow's <Panel> is position:absolute with no explicit height
        // (only top/left are set), so its own height is auto/shrink-to-fit —
        // a %-based max-height here (the previous calc(100% - 9rem)) has no
        // definite-height ancestor to resolve against, which CSS treats as
        // 'none' (unconstrained). That's what broke both the cap and, as a
        // consequence, the scrolling: with no real bound, the list just grew
        // past the canvas instead of clipping+scrolling. vh is viewport-
        // relative, so it stays bounded regardless of the Panel's own
        // (undefined) height.
        <div className="bg-card border rounded-lg shadow-sm flex flex-col min-w-[170px] max-h-[50vh] overflow-hidden">
          <div className="p-2.5 border-b bg-card shrink-0">
            <h3 className="font-semibold text-sm text-center">{t.sceneBuilder.nav.addNode}</h3>
          </div>
          <ScrollArea className="flex-1 min-h-0 my-3">
            <div className="flex flex-col gap-1 px-3">
              {PALETTE_GROUPS.map((group) => {
                const entries = NODE_PALETTE.filter((entry) => entry.group === group)
                const isOpen = !collapsedGroups[group]
                // Every entry in a palette group shares one NodeCategory
                // (e.g. "Transform" is entirely 'style', "Data" entirely
                // 'data') — see NODE_CATEGORY's own doc comment — so one
                // lookup colors both the group header and every button in
                // it, matching the exact tint/accent that node gets once
                // it's actually placed on the canvas (BaseNode's own
                // header styling, CATEGORY_STYLES in components/nodes).
                const categoryStyle = CATEGORY_STYLES[NODE_CATEGORY[entries[0].type]]
                return (
                  <div key={group} className="flex flex-col gap-1">
                    <button
                      onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                      className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer py-0.5"
                    >
                      <ChevronRight className={cn('size-3 transition-transform', isOpen && 'rotate-90')} />
                      <span className={cn('size-1.5 rounded-full shrink-0', categoryStyle.dot)} />
                      {group}
                    </button>
                    {isOpen &&
                      entries.map((entry) => (
                        <button
                          key={entry.type}
                          type="button"
                          draggable
                          onDragStart={(e) => onPaletteDragStart(e, entry.type)}
                          title={t.sceneBuilder.nav.dragToAdd}
                          className={cn(
                            'text-xs py-2 px-3 rounded border-l-4 transition-all text-left border border-transparent hover:border-border hover:brightness-110 cursor-grab active:cursor-grabbing',
                            categoryStyle.header,
                            categoryStyle.border
                          )}
                        >
                          {entry.label}
                        </button>
                      ))}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </Panel>
  )
}
