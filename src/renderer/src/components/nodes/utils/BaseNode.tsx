import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Trash2, ChevronDown, ChevronUp, Copy, Pencil } from 'lucide-react'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { NodeCategory, InputSocket, OutputSocket, CATEGORY_STYLES, CATEGORY_DOT, SOCKET_DOT } from '../constants'
import { usePriorityInfo, useSequenceInfo } from './hooks'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** One labeled input-socket row — the dot is nested inside this (relatively positioned) row rather than placed by percentage on the whole node, so any number of sockets stacks cleanly regardless of node height. */
export function SocketRow({ id, label, dotClass, title }: { id: string; label: string; dotClass: string; title: string }) {
  return (
    <div className="relative flex items-center gap-1.5 pl-3 pr-2 h-5 text-[10px] text-muted-foreground">
      <Handle
        type="target"
        position={Position.Left}
        id={id}
        style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)' }}
        className={cn('w-2.5 h-2.5', dotClass)}
        title={title}
      />
      <span className="truncate">{label}</span>
    </div>
  )
}

/** One labeled output-socket row — the source-side mirror of SocketRow, dot on the right edge. Only rendered for node types with an `outputSockets` list (see OutputSocket/NODE_OUTPUTS above); every other node keeps the single generic "output" handle. `helpKey` (optional — see OutputSocket's own doc comment) looks up `sceneBuilder.tooltip.outputs[helpKey]` and renders it in the same small "?" hover tooltip BaseNode's header uses, so a node's header help can stay a short one-liner while each output's own exact behavior lives on the row it belongs to. Placed AFTER the label (not before) so it sits flush against the row's right edge — the last child in a `justify-end` row lands at a fixed position regardless of the label's own width, so the "?" lines up identically across every output row instead of drifting with each label's length. */
export function OutputRow({ id, label, dotClass, title, helpKey }: { id: string; label: string; dotClass: string; title: string; helpKey?: string }) {
  const { t } = useI18n()
  const help = helpKey ? (t.sceneBuilder.tooltip.outputs as Record<string, string>)[helpKey] : undefined
  return (
    <div className="relative flex items-center justify-end gap-1.5 pl-2 pr-3 h-5 text-[10px] text-muted-foreground">
      <span className="truncate">{label}</span>
      {help && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="nodrag shrink-0 flex items-center justify-center size-3.5 rounded-full border border-muted-foreground/50 text-muted-foreground text-[9px] font-bold leading-none hover:bg-accent hover:text-accent-foreground hover:border-foreground/50 transition-colors cursor-pointer"
            >
              ?
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="w-56 text-xs leading-snug whitespace-normal">
            {help}
          </TooltipContent>
        </Tooltip>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id={id}
        style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)' }}
        className={cn('w-2.5 h-2.5', dotClass)}
        title={title}
      />
    </div>
  )
}

export function BaseNode({
  id,
  data,
  title,
  children,
  outputs = true,
  deletable = true,
  labelable = false,
  category = 'style',
  sockets = [],
  sequenceIn = false,
  outputSockets,
  soon = false,
  help
}: {
  id: string
  data: Record<string, unknown>
  title: string
  /** Optional now that longer notes moved behind `help` — a node whose sockets/fields say everything (Scene, Start, End, ...) can have no body at all. */
  children?: React.ReactNode
  outputs?: boolean
  deletable?: boolean
  labelable?: boolean
  /** Visual grouping only — see the NodeCategory doc comment above. Defaults to 'style' (the largest, catch-all group of modifier nodes). */
  category?: NodeCategory
  /** This node's labeled input sockets, one per parameter — see InputSocket/NODE_SOCKETS above. Empty for pure-source nodes (Position, Animation, Event, ...) which have no inputs of their own. */
  sockets?: InputSocket[]
  /** True for a node that's placeable and connectable but has no effect on rendering yet (see each such node's own doc comment for what's missing) — shows a "Soon" badge so a scene built around it doesn't silently do nothing with no visible cue why. */
  soon?: boolean
  /** Longer usage note, tucked behind a "?" next to the title instead of sitting in the node body as always-visible text — keeps the body to just its actual controls. Omit for a node whose fields are self-explanatory. */
  help?: string
  /**
   * Start/Task/Wait/End only: the process sequence-flow input ("previous
   * step", id "event-in") — separate from `sockets` above because it isn't
   * a parameter, it's what precedes this step. Start has none (entry
   * point, nothing precedes it). See isValidConnection in
   * SceneBuilderPage.tsx for how it's kept strictly for process-to-process
   * connections despite every node's output sharing the same generic
   * "output" id.
   */
  sequenceIn?: boolean
  /** This node's labeled OUTPUT sockets — see OutputSocket/NODE_OUTPUTS above. Only Text/Image/Box/Group set this today; every other node ignores it and keeps the single generic "output" handle (gated by `outputs` above). */
  outputSockets?: OutputSocket[]
}) {
  const { deleteElements, updateNodeData, getEdges, getNodes, getNode, addNodes } = useReactFlow()
  const { t } = useI18n()
  const collapsed = Boolean(data.collapsed)
  const priority = usePriorityInfo(id)
  const sequence = useSequenceInfo(id)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelText, setLabelText] = useState((data.label as string) || '')
  const categoryStyle = CATEGORY_STYLES[category]
  const hasSocketSection = sockets.length > 0 || sequenceIn
  // Collapsing only ever hides `children` below (see hasBody) — sockets
  // always stay visible regardless of `collapsed` (a wire has to land
  // somewhere). A node with no body — pure sockets/outputs, e.g. Scene,
  // Start, Audio Player, Random/Roulette Widget — has nothing collapsing
  // could ever hide, so the chevron/click-to-collapse/context-menu entry
  // are all skipped rather than sitting there as dead, misleading UI.
  const canCollapse = Boolean(children)
  const hasBody = canCollapse && !collapsed
  // The output section (the boxed outputSockets rows list, OR — see
  // `outputs` further down — the single unlabeled bottom row a node without
  // outputSockets gets instead) is trailing content just like a socket
  // section or body, so the header needs a bottom border/square corners
  // here too rather than rounding itself as if it were the whole node.
  const hasOutputSection = Boolean(outputs)
  const showTrailingBorder = hasSocketSection || hasBody || hasOutputSection
  // Scene/Random Widget/Roulette Widget have neither a collapsible body nor
  // are deletable from here (see each node's own `deletable={false}` doc
  // comment) — with both entries skipped below, ContextMenuContent would
  // render with zero children: an empty, squashed popup box on right-click
  // instead of no popup at all. Skip mounting the whole menu in that case.
  const hasMenuItems = canCollapse || deletable

  /** Every sibling node (deduped, sorted by current priority) competing for the same (target, targetHandle) socket this node feeds — shared by cyclePriority/setPriority below. Mirrors usePriorityInfo's own computation (see its doc comment for the scoping/dedup reasoning); can't reuse the hook's own memoized result directly since these need the RAW node list to write new priorities back to, not just position/total. */
  const getPrioritySiblings = () => {
    const edges = getEdges()
    const nodes = getNodes()
    const outEdge = edges.find((e) => e.source === id)
    if (!outEdge) return null
    const seenNodeIds = new Set<string>()
    return edges
      .filter((e) => e.target === outEdge.target && e.targetHandle === outEdge.targetHandle)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is (typeof nodes)[number] => n != null)
      .filter((n) => (seenNodeIds.has(n.id) ? false : (seenNodeIds.add(n.id), true)))
      .sort((a, b) => ((a.data.priority as number) ?? 0) - ((b.data.priority as number) ?? 0))
  }

  /** Left-click on the Priority Badge: rotate every sibling by 1 (1->2, 2->3, ..., N->1) — the quick "send this one to the back" gesture. Right-click instead (see setPriority/PriorityMenu below) jumps straight to a specific position. */
  const cyclePriority = () => {
    if (!priority) return
    const siblings = getPrioritySiblings()
    if (!siblings) return
    siblings.forEach((n, idx) => {
      const newPos = (idx + 1) % siblings.length + 1
      updateNodeData(n.id, { priority: newPos })
    })
  }

  /**
   * Right-click on the Priority Badge (see the menu rendered further down):
   * jump straight to a SPECIFIC position instead of only cycling — e.g.
   * siblings at 1,2,3 and THIS node (currently 1) picking "2" becomes
   * 2,1,3: a SWAP with whoever currently holds position 2, not a full
   * reshuffle — every other sibling's own priority is left untouched. Lets
   * "1,2,3 -> 2,1,3" happen in one click, which cyclePriority's rotate-only
   * model can never reach directly.
   */
  const setPriority = (newPosition: number) => {
    if (!priority) return
    const siblings = getPrioritySiblings()
    if (!siblings) return
    const currentIndex = siblings.findIndex((n) => n.id === id)
    const targetIndex = newPosition - 1
    if (currentIndex === -1 || targetIndex === currentIndex || targetIndex < 0 || targetIndex >= siblings.length) return
    const other = siblings[targetIndex]
    updateNodeData(id, { priority: newPosition })
    updateNodeData(other.id, { priority: currentIndex + 1 })
  }

  const [priorityMenuAnchor, setPriorityMenuAnchor] = useState<{ left: number; top: number } | null>(null)
  const priorityBadgeRef = useRef<HTMLButtonElement>(null)
  const priorityMenuRef = useRef<HTMLDivElement>(null)

  // Capture phase — see PlaceholderPicker's own outside-click effect for why.
  useEffect(() => {
    if (!priorityMenuAnchor) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (priorityBadgeRef.current?.contains(target) || priorityMenuRef.current?.contains(target)) return
      setPriorityMenuAnchor(null)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [priorityMenuAnchor])

  /** A fresh, unconnected copy right next to the original — same id scheme as the Add Node palette (see addNode in SceneBuilderPage.tsx), deep-cloned data so editing the copy never mutates the original. */
  const duplicateNode = () => {
    const current = getNode(id)
    if (!current) return
    addNodes({
      ...current,
      id: `${current.type}-${Date.now()}`,
      position: { x: current.position.x + 32, y: current.position.y + 32 },
      data: structuredClone(current.data),
      selected: false
    })
  }

  return (
    <div
      className={cn(
        'min-w-[150px] rounded-md border border-l-4 bg-card text-card-foreground shadow-sm bg-background group relative',
        categoryStyle.border
      )}
    >
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        className={cn(
          // Rounded top corners so the header's own background — which the
          // outer node isn't clipped to, since it has no overflow-hidden
          // (sockets/handles need to protrude past the edges — see
          // SocketRow/OutputRow's negative left/right offsets) — matches the
          // outer wrapper's rounded-md curve instead of a hard square corner
          // poking past it and showing the canvas through the gap. The two
          // corners aren't symmetric: the outer border is 1px on top/right
          // but 4px on the left (categoryStyle's accent stripe, `border-l-4`
          // below), so the header — flush against the INSIDE of that border
          // — sits 1px down but 4px right of the outer box's true corner.
          // Mirroring the outer's flat rounded-md (8px) radius on both axes
          // here would overshoot that offset and visibly miss the border's
          // curve on the left side; each corner's radius is instead
          // `[horizontal_vertical]`, shrunk per axis by ITS OWN adjacent
          // border width (8-4 horizontal, 8-1 vertical for top-left; 8-1/8-1
          // for top-right) so it nests flush against the border regardless
          // of the asymmetry. Same reasoning for rounded-b when this header
          // IS the whole node.
          'px-3 py-2 rounded-tl-[4px_7px] rounded-tr-[7px] font-semibold text-sm flex justify-between items-center gap-2',
          categoryStyle.header,
          showTrailingBorder ? 'border-b' : 'rounded-bl-[4px_7px] rounded-br-[7px]'
        )}
      >
        <div
          onClick={canCollapse ? () => updateNodeData(id, { collapsed: !collapsed }) : undefined}
          className={cn('flex items-center gap-1.5 min-w-0 flex-1 text-left', canCollapse && 'cursor-pointer')}
          title={canCollapse ? (collapsed ? t.sceneBuilder.tooltip.expand : t.sceneBuilder.tooltip.collapse) : undefined}
        >
          {canCollapse && (
            <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
          )}
          <div className="flex items-center min-w-0 flex-1 gap-1.5">
            <span className="truncate shrink-0">{title}</span>
            {help && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="nodrag shrink-0 flex items-center justify-center size-3.5 rounded-full border border-muted-foreground/50 text-muted-foreground text-[9px] font-bold leading-none hover:bg-accent hover:text-accent-foreground hover:border-foreground/50 transition-colors cursor-pointer"
                  >
                    ?
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="w-56 text-xs leading-snug whitespace-normal">
                  {help}
                </TooltipContent>
              </Tooltip>
            )}
            {isEditingLabel ? (
              <input
                autoFocus
                type="text"
                className="nodrag bg-transparent outline-none border-b border-primary text-muted-foreground font-normal min-w-0 flex-1"
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                onBlur={() => {
                  setIsEditingLabel(false)
                  updateNodeData(id, { label: labelText })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingLabel(false)
                    updateNodeData(id, { label: labelText })
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                {data.label && <span className="font-normal text-muted-foreground truncate">{data.label as string}</span>}
                {labelable && (
                  <Pencil
                    className="size-3 text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 nodrag cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLabelText((data.label as string) || '')
                      setIsEditingLabel(true)
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
        {soon && (
          <span
            className="nodrag shrink-0 inline-flex items-center justify-center h-4 px-1.5 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-none"
            title={t.sceneBuilder.tooltip.notWired}
          >
            SOON
          </span>
        )}
        {sequence !== null && (
          <span
            className="nodrag shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold leading-none"
            title={`${interpolate(t.sceneBuilder.tooltip.step, { current: String(sequence) })} (Start → ... → End)`}
          >
            {sequence}
          </span>
        )}
        {priority && (
          <button
            ref={priorityBadgeRef}
            type="button"
            onClick={cyclePriority}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const rect = priorityBadgeRef.current?.getBoundingClientRect()
              if (rect) setPriorityMenuAnchor({ left: rect.left, top: rect.bottom + 4 })
            }}
            className="nodrag shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none cursor-pointer hover:opacity-80 transition-opacity"
            title={interpolate(t.sceneBuilder.tooltip.priority, { position: String(priority.position), total: String(priority.total) })}
          >
            {priority.position}
          </button>
        )}
        {priority &&
          priorityMenuAnchor &&
          createPortal(
            <div
              ref={priorityMenuRef}
              style={{ left: priorityMenuAnchor.left, top: priorityMenuAnchor.top }}
              className="nodrag fixed z-[9999] min-w-[64px] rounded-md border bg-popover text-popover-foreground shadow-lg py-1"
            >
              {Array.from({ length: priority.total }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPriority(n)
                    setPriorityMenuAnchor(null)
                  }}
                  className={cn(
                    'w-full text-center px-3 py-1 text-xs',
                    n === priority.position ? 'bg-accent text-accent-foreground font-semibold' : 'hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>,
            document.body
          )}
        {deletable && (
          <button
            type="button"
            onClick={() => deleteElements({ nodes: [{ id }] })}
            className="nodrag shrink-0 text-muted-foreground hover:text-destructive transition-colors outline-none cursor-pointer"
            title={t.sceneBuilder.tooltip.deleteNode}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      </ContextMenuTrigger>
      {hasMenuItems && (
        <ContextMenuContent>
          {canCollapse && (
            <ContextMenuItem onSelect={() => updateNodeData(id, { collapsed: !collapsed })}>
              {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              {collapsed ? t.sceneBuilder.tooltip.expand : t.sceneBuilder.tooltip.collapse}
            </ContextMenuItem>
          )}
          {deletable && (
            <ContextMenuItem onSelect={duplicateNode}>
              <Copy className="size-4" />
              {t.sceneBuilder.tooltip.duplicate}
            </ContextMenuItem>
          )}
          {deletable && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onSelect={() => deleteElements({ nodes: [{ id }] })}>
                <Trash2 className="size-4" />
                {t.sceneBuilder.tooltip.delete}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      )}
      </ContextMenu>
      {hasSocketSection && (
        <div className="flex flex-col border-b py-0.5">
          {sockets.map((socket) => (
            <SocketRow
              key={socket.id}
              id={socket.id}
              label={socket.label}
              dotClass={SOCKET_DOT[socket.kind]}
              title={interpolate(socket.multi ? t.sceneBuilder.tooltip.socketInMulti : t.sceneBuilder.tooltip.socketIn, { label: socket.label })}
            />
          ))}
          {sequenceIn && <SocketRow id="event-in" label="Sequence" dotClass="!bg-indigo-500" title={t.sceneBuilder.tooltip.sequenceIn} />}
        </div>
      )}
      {hasBody && <div className="p-3 flex flex-col gap-2">{children}</div>}
      {outputs &&
        (outputSockets && outputSockets.length > 0 ? (
          <div className="flex flex-col border-t py-0.5">
            {outputSockets.map((socket) => (
              <OutputRow
                key={socket.id}
                id={socket.id}
                label={socket.label}
                dotClass={SOCKET_DOT[socket.kind]}
                title={interpolate(t.sceneBuilder.tooltip.socketOut, { label: socket.label })}
                helpKey={socket.helpKey}
              />
            ))}
          </div>
        ) : (
          // Same bottom-row treatment (and now the same labeled-row
          // component) as the outputSockets list above, just a single
          // generic "Output" row instead of named ones — not a bare Handle
          // centered by React Flow's default top:50% on the whole node:
          // that default measures against the node's OWN bounding box,
          // which only gets re-measured when the box's overall size
          // changes — collapsing a socket-only node like Wait doesn't
          // change its box size (the dot was never part of layout flow to
          // begin with), so the wire stayed pinned to the stale
          // header-height midpoint while the visible dot drifted, the two
          // visibly decoupling. A real row here has actual height, so
          // adding/removing it changes the node's box size and forces
          // React Flow to remeasure, keeping the wire glued to the dot.
          <div className="flex flex-col border-t py-0.5">
            <OutputRow id="output" label="Output" dotClass={CATEGORY_DOT[category]} title="Output" />
          </div>
        ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-xs gap-2">
      <label className="shrink-0">{label}</label>
      {children}
    </div>
  )
}
