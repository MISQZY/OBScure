import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeProps, useReactFlow, useStore } from '@xyflow/react'
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Bold,
  Italic,
  Upload,
  X,
  type LucideIcon
} from 'lucide-react'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { ANIMATION_IDS, BACKGROUND_ANIMATION_IDS } from '@shared/overlayConfig'
import { ALERT_PLATFORMS, ALERT_TYPES_BY_PLATFORM, type AlertPlatform, type AlertType } from '@shared/types'
import { SOUND_IDS } from '@shared/sounds'
import { cn } from '@/lib/utils'
import { MBadge } from '@/components/MBadge'
import { Checkbox } from '@/components/ui/checkbox'
import { useSystemFonts } from '@/hooks/use-system-fonts'
import { useIntegrationsStatus } from '@/hooks/use-integration-status'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HexColorPicker, HexColorInput } from 'react-colorful'

import { 
  NodeCategory, 
  InputSocket, 
  OutputSocket,
  CATEGORY_STYLES,
  CATEGORY_DOT,
  SOCKET_DOT,
  PROCESS_TYPES
} from './constants'

/**
 * Returns the 1-based priority position of `nodeId` among all nodes wired
 * into the exact same (target, targetHandle) socket, plus the total count of
 * siblings. Scoping by socket (not just target) is what keeps this correct
 * now that a role socket like Transform/Style (see MODIFIER_SOCKETS in this
 * file) can hold several DIFFERENT node types at once — a Position and an
 * Opacity node feeding two different sockets on the same Text are never
 * "siblings" for this purpose, only two nodes actually competing for the
 * same socket are. Was previously restricted to Text/Image/Video/Box (Box's
 * children / Scene's content, the only pre-existing multi sockets); now
 * generic, since single-value sockets can never have 2 edges anyway (onConnect
 * auto-replaces) so the restriction was never load-bearing for those.
 * Only meaningful when outputs === true (the node can connect somewhere).
 * Returns `null` when the node has no outgoing edge or is the only sibling.
 * Deduplicates by NODE id, not by edge count — a single producer can
 * legitimately have more than one edge into the same socket (e.g. an old
 * scene migrated from Audio Player's former separate Author/Title outputs,
 * both now remapped onto its one Content output — see
 * migrateLegacyAudioPlayerEdges in SceneBuilderPage.tsx), and counting each
 * of ITS OWN edges as a separate "sibling" would show a false "1 of 2" on a
 * node with no real competitor at all.
 */
export function usePriorityInfo(nodeId: string) {
  const result = useStore(
    (s) => {
      const outEdge = s.edges.find((e) => e.source === nodeId)
      if (!outEdge) return { position: null, total: null }

      const siblingEdges = s.edges.filter((e) => e.target === outEdge.target && e.targetHandle === outEdge.targetHandle)

      const seenNodeIds = new Set<string>()
      const siblingNodes = siblingEdges
        .map((e) => s.nodes.find((n) => n.id === e.source))
        .filter((n): n is (typeof s.nodes)[number] => n != null)
        .filter((n) => (seenNodeIds.has(n.id) ? false : (seenNodeIds.add(n.id), true)))
        .sort((a, b) => ((a.data.priority as number) ?? 0) - ((b.data.priority as number) ?? 0))

      if (siblingNodes.length < 2) return { position: null, total: null }

      const index = siblingNodes.findIndex((n) => n.id === nodeId)
      return { position: index + 1, total: siblingNodes.length }
    },
    (a, b) => a.position === b.position && a.total === b.total
  )

  if (result.position === null) return null
  return result as { position: number; total: number }
}

/**
 * Whether `nodeId` currently has an incoming edge on socket `targetHandle`
 * — used by ImageNode to know when its Content socket (see IMAGE_SOCKETS)
 * is wired to Audio Player's Content output, in which case the URL field
 * goes read-only: the connection already decides what's shown (see
 * buildImage's own doc comment in overlays/custom.html), so an
 * editable-but-ignored URL field would just be confusing.
 */
export function useHasIncomingEdge(nodeId: string, targetHandle: string): boolean {
  return useStore((s) => s.edges.some((e) => e.target === nodeId && e.targetHandle === targetHandle))
}

/**
 * Like useHasIncomingEdge above, but additionally requires the wire's
 * SOURCE to be `sourceType` — used where a socket accepts more than one
 * node type but only ONE of them should flip some other UI behavior. Text's
 * own Content socket is the case that matters today: it accepts both Audio
 * Player (a placeholder-merge, template stays editable — see
 * audioContentValues) and Roulette Entrants (a full replacement — see
 * TextNode.tsx's own doc comment for why ONLY that one locks the textarea).
 */
export function useHasIncomingEdgeFromType(nodeId: string, targetHandle: string, sourceType: string): boolean {
  return useStore((s) => s.edges.some((e) => e.target === nodeId && e.targetHandle === targetHandle && s.nodes.find((n) => n.id === e.source)?.type === sourceType))
}

/**
 * Which of TEXT_PLACEHOLDERS this Text node can actually get a value for
 * right now, given the current graph — PlaceholderPicker's {} menu only
 * offers these, instead of every token whether or not anything would ever
 * fill it in (this is what the user reported: {title}/{artist} showing up
 * with no Audio Player anywhere in the scene). EVENT_PLACEHOLDERS (user/
 * amount/message/source) need an Event node wired into Scene or Start —
 * either one arms all four together, same as sceneTrigger/processTrigger
 * elsewhere. 'artist'/'title' both need either Audio Player's Event output
 * wired into Scene's own Event socket (arms both, scene-wide — same shared
 * `event` id a real Event node uses, see SCENE_SOCKETS) or its Content
 * output wired directly into THIS node's own Content socket (Content is one
 * bundled wire — see AUDIO_PLAYER_OUTPUTS/audioContentValues in overlays/
 * custom.html — so wiring it in arms both placeholders together, never just
 * one). Roulette Entrants has no placeholder tokens of its own — it feeds a
 * Text's Content socket as a full REPLACEMENT (see ROULETTE_ENTRANTS_OUTPUTS'
 * own doc comment in constants.ts and TextNode.tsx's own doc comment), not a
 * template these tokens fill into. Doesn't verify precise reachability from
 * this specific node's own Scene for the Event/scene-wide Audio check (just
 * whether one exists ANYWHERE in the graph) — a false positive only offers a
 * token that happens not to resolve, same harmless-if-imprecise reasoning as
 * hasAudioContentDeps in overlays/custom.html.
 */
export function useAvailablePlaceholders(nodeId: string): readonly string[] {
  return useStore(
    (s) => {
      const hasEvent = s.edges.some((e) => e.targetHandle === 'event' && s.nodes.find((n) => n.id === e.source)?.type === 'event')
      // Scoped to a Scene TARGET specifically (not just any 'event' handle —
      // Start shares the same id for arming a Process, a separate concern
      // that doesn't arm these scene-wide placeholders).
      const audioIntoScene = s.edges.some(
        (e) =>
          e.targetHandle === 'event' &&
          s.nodes.find((n) => n.id === e.target)?.type === 'scene' &&
          s.nodes.find((n) => n.id === e.source)?.type === 'audioPlayer'
      )
      const directAudioContent = s.edges.some(
        (e) => e.target === nodeId && e.targetHandle === 'content' && s.nodes.find((n) => n.id === e.source)?.type === 'audioPlayer'
      )
      const result: string[] = []
      if (hasEvent) result.push(...EVENT_PLACEHOLDERS)
      if (audioIntoScene || directAudioContent) result.push('artist', 'title')
      return result
    },
    (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
  )
}

/**
 * Returns this node's 1-based step number when walking the sequence-flow
 * chain forward from Start (Start itself is step 1) — answers "what order
 * do these Tasks run in" at a glance, the process equivalent of
 * usePriorityInfo above. `null` for a non-process node, or a process node
 * not reachable from Start (an orphaned Task, say — walking a linear chain
 * can't reach it). Mirrors nextProcessNode in SceneBuilderPage.tsx, just
 * walking for display here instead of resolving timing.
 */
export function useSequenceInfo(nodeId: string): number | null {
  return useStore((s) => {
    const selfNode = s.nodes.find((n) => n.id === nodeId)
    if (!selfNode || !PROCESS_TYPES.has(selfNode.type!)) return null
    const start = s.nodes.find((n) => n.type === 'start')
    if (!start) return null
    let index = 0
    let current: (typeof s.nodes)[number] | undefined = start
    while (current) {
      index += 1
      if (current.id === nodeId) return index
      const nextEdge = s.edges.find(
        (e) => e.source === current!.id && s.nodes.some((n) => n.id === e.target && PROCESS_TYPES.has(n.type!))
      )
      current = nextEdge ? s.nodes.find((n) => n.id === nextEdge.target) : undefined
    }
    return null
  })
}
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

/** One labeled output-socket row — the source-side mirror of SocketRow, dot on the right edge. Only rendered for node types with an `outputSockets` list (see OutputSocket/NODE_OUTPUTS above); every other node keeps the single generic "output" handle. `help` (optional — see OutputSocket's own doc comment) renders the same small "?" popover BaseNode's header uses, so a node's header help can stay a short one-liner while each output's own exact behavior lives on the row it belongs to. Placed AFTER the label (not before) so it sits flush against the row's right edge — the last child in a `justify-end` row lands at a fixed position regardless of the label's own width, so the "?" lines up identically across every output row instead of drifting with each label's length. */
export function OutputRow({ id, label, dotClass, title, help }: { id: string; label: string; dotClass: string; title: string; help?: string }) {
  return (
    <div className="relative flex items-center justify-end gap-1.5 pl-2 pr-3 h-5 text-[10px] text-muted-foreground">
      <span className="truncate">{label}</span>
      {help && (
        <NodePopover
          side="bottom"
          className="w-56 text-xs leading-snug p-2.5"
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="Help"
              className="nodrag shrink-0 flex items-center justify-center size-3.5 rounded-full border border-muted-foreground/50 text-muted-foreground text-[9px] font-bold leading-none hover:bg-accent hover:text-accent-foreground hover:border-foreground/50 transition-colors cursor-pointer"
            >
              ?
            </button>
          }
        >
          {help}
        </NodePopover>
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
  const collapsed = Boolean(data.collapsed)
  const priority = usePriorityInfo(id)
  const sequence = useSequenceInfo(id)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelText, setLabelText] = useState((data.label as string) || '')
  const categoryStyle = CATEGORY_STYLES[category]
  const hasSocketSection = sockets.length > 0 || sequenceIn
  const hasBody = Boolean(children) && !collapsed
  const showTrailingBorder = hasSocketSection || hasBody

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
          'px-3 py-2 rounded-tr-md font-semibold text-sm flex justify-between items-center gap-2',
          categoryStyle.header,
          showTrailingBorder ? 'border-b' : 'rounded-br-md'
        )}
      >
        <div
          onClick={() => updateNodeData(id, { collapsed: !collapsed })}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
          <div className="flex items-center min-w-0 flex-1 gap-1.5">
            <span className="truncate shrink-0">{title}</span>
            {help && (
              <NodePopover
                side="bottom"
                className="w-56 text-xs leading-snug p-2.5"
                trigger={
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    title="Help"
                    className="nodrag shrink-0 flex items-center justify-center size-3.5 rounded-full border border-muted-foreground/50 text-muted-foreground text-[9px] font-bold leading-none hover:bg-accent hover:text-accent-foreground hover:border-foreground/50 transition-colors cursor-pointer"
                  >
                    ?
                  </button>
                }
              >
                {help}
              </NodePopover>
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
            title="Not wired into rendering yet — this node can be placed and connected, but currently has no effect on the overlay."
          >
            SOON
          </span>
        )}
        {sequence !== null && (
          <span
            className="nodrag shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold leading-none"
            title={`Step ${sequence} in the process sequence (Start → ... → End)`}
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
            title={`Render priority ${priority.position} of ${priority.total} — click to move to end, right-click to set a specific position`}
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
            title="Delete node"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => updateNodeData(id, { collapsed: !collapsed })}>
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          {collapsed ? 'Expand' : 'Collapse'}
        </ContextMenuItem>
        {deletable && (
          <ContextMenuItem onSelect={duplicateNode}>
            <Copy className="size-4" />
            Duplicate
          </ContextMenuItem>
        )}
        {deletable && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => deleteElements({ nodes: [{ id }] })}>
              <Trash2 className="size-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      </ContextMenu>
      {hasSocketSection && (
        <div className="flex flex-col border-b py-0.5">
          {sockets.map((socket) => (
            <SocketRow
              key={socket.id}
              id={socket.id}
              label={socket.label}
              dotClass={SOCKET_DOT[socket.kind]}
              title={`${socket.label} in${socket.multi ? ' (multiple)' : ''}`}
            />
          ))}
          {sequenceIn && <SocketRow id="event-in" label="Sequence" dotClass="!bg-indigo-500" title="Event in — previous step" />}
        </div>
      )}
      {hasBody && <div className="p-3 flex flex-col gap-2">{children}</div>}
      {outputs &&
        (outputSockets && outputSockets.length > 0 ? (
          <div className="flex flex-col border-t py-0.5">
            {outputSockets.map((socket) => (
              <OutputRow key={socket.id} id={socket.id} label={socket.label} dotClass={SOCKET_DOT[socket.kind]} title={`${socket.label} out`} help={socket.help} />
            ))}
          </div>
        ) : (
          <Handle
            type="source"
            position={Position.Right}
            id="output"
            className={cn('w-3 h-3', CATEGORY_DOT[category])}
            title="Output"
          />
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

/**
 * A minimal popover for a trigger button inside a node — used instead of
 * Radix's Popover for the same reason NodeSelect above rolls its own
 * dropdown: Radix's dismiss-on-outside-click depends on a bubble-phase
 * 'mousedown' listener on document reaching all the way back up, but React
 * Flow's canvas pan gesture (d3-zoom, attached directly to the pane
 * element) calls event.stopImmediatePropagation() on every 'mousedown' that
 * starts on the pane — so that listener never fires, and a Radix Popover
 * opened from inside a node never closes when you click empty canvas.
 * Portaled + capture-phase, same fix as NodeSelect's own outside-click effect.
 */
export function NodePopover({
  trigger,
  children,
  className,
  side = 'bottom',
  sideOffset = 8
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  children: React.ReactNode
  className?: string
  side?: 'bottom' | 'right'
  sideOffset?: number
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [open])

  useEffect(() => {
    if (!open) return
    let rafId: number
    const track = () => {
      const t = triggerRef.current
      const m = menuRef.current
      if (t && m) {
        const rect = t.getBoundingClientRect()
        if (side === 'right') {
          m.style.left = `${rect.right + sideOffset}px`
          m.style.top = `${rect.top}px`
        } else {
          m.style.left = `${rect.left}px`
          m.style.top = `${rect.bottom + sideOffset}px`
        }
      }
      rafId = requestAnimationFrame(track)
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
  }, [open, side, sideOffset])

  const clonedTrigger = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e)
      setOpen((prev) => !prev)
    }
  } as never)

  return (
    <>
      {clonedTrigger}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed' }}
            className={cn('z-[9999] rounded-md border bg-popover text-popover-foreground shadow-md', className)}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 nodrag">
      <HexColorInput
        color={value}
        onChange={onChange}
        prefixed
        className="font-mono text-[10px] text-muted-foreground uppercase bg-transparent w-[4.5rem] outline-none focus:text-foreground text-right border-b border-transparent focus:border-border transition-colors"
      />
      <NodePopover
        className="w-auto p-3 flex flex-col gap-3"
        trigger={
          <button
            type="button"
            className="size-5 rounded border shadow-sm ring-1 ring-border/50 cursor-pointer p-0 shrink-0"
            style={{ backgroundColor: value }}
          />
        }
      >
        <HexColorPicker color={value} onChange={onChange} />
        <HexColorInput
          color={value}
          onChange={onChange}
          prefixed
          className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono uppercase"
        />
      </NodePopover>
    </div>
  )
}

/**
 * `nodrag` is an @xyflow/react convention: without it, a click-drag inside
 * this element is captured as a node-move gesture instead of the browser's
 * normal text selection/interaction. `select-text` overrides the
 * `user-select: none` xyflow puts on .react-flow__node itself, which
 * otherwise blocks drag-selecting text even inside a nodrag input. Both are
 * on every interactive control in every node below.
 */
export const numberInputClass = 'nodrag select-text w-16 bg-muted px-1 py-0.5 rounded outline-none'
export const selectClass = 'nodrag select-text flex-1 min-w-0 bg-muted px-1 py-0.5 rounded outline-none'

export const textInputClass = 'nodrag select-text w-full h-6 bg-muted px-1 rounded outline-none'

/** Multi-line sibling of textInputClass, for Text's own Content field — starts at `rows={3}` (set on the element itself) and resize-y lets a longer caption grow past that instead of scrolling inside a fixed box. */
export const textAreaClass = 'nodrag select-text w-full bg-muted px-1 py-1 rounded outline-none resize-y'

/** Filled in from an Event node's real/simulated alert — see EventNode/interpolate. Read by useAvailablePlaceholders, which is what actually decides PlaceholderPicker's {} menu contents ('title'/'artist', the other half, are handled there together since Audio Player's Content wire always arms both at once — see that hook's own doc comment). */
export const EVENT_PLACEHOLDERS = ['user', 'amount', 'message', 'source'] as const

export type SavedNodeMap = Record<string, Record<string, unknown>>

export const SavedNodeDataContext = createContext<SavedNodeMap>({})

/**
 * Wraps the `<ReactFlow>` tree in SceneBuilderPage with each node's data AS
 * OF THE LAST SAVE — a separate snapshot from the `nodes` state ReactFlow
 * actually renders (which holds live, possibly-unsaved edits). Exists so
 * NumberInput can fall back to what's genuinely persisted when a field is
 * cleared (see useSavedNodeData/NumberInput's `savedValue`) instead of
 * either the type's generic default or an edit that was never Saved.
 * `savedNodes` is `overlay?.nodes` — undefined before the scene has ever
 * been loaded/saved, same as no saved value existing yet for any field.
 */
export function SavedNodeDataProvider({
  savedNodes,
  children
}: {
  savedNodes: { id: string; data?: Record<string, unknown> }[] | undefined
  children: React.ReactNode
}) {
  const map = useMemo(() => {
    const result: SavedNodeMap = {}
    for (const node of savedNodes ?? []) result[node.id] = node.data ?? {}
    return result
  }, [savedNodes])
  return <SavedNodeDataContext.Provider value={map}>{children}</SavedNodeDataContext.Provider>
}

/** This node's data as of the last Save, or `{}` before anything's been saved — see SavedNodeDataProvider above. */
export function useSavedNodeData(id: string): Record<string, unknown> {
  return useContext(SavedNodeDataContext)[id] ?? {}
}

/**
 * Text-backed replacement for `<input type="number">`. A controlled native
 * number input snaps its DOM value back to `Number(x) || fallback` on every
 * keystroke, so intermediate states while typing — "-" before a negative
 * number, "" while clearing the field, "1." before a decimal — get erased
 * mid-type instead of staying editable (the "can't erase/type a negative
 * value" bugs). Keeping a local text buffer while focused lets those
 * intermediate states survive; a syntactically valid number commits (clamped
 * to min/max) live so the canvas preview stays in sync while typing, and
 * blur/Enter always resolves the field to a concrete number (or `null` when
 * `allowEmpty`, e.g. Size's "auto") — never leaves it stuck on garbage.
 * Clearing the field and blurring restores `savedValue` — this field's value
 * as of the last Save (see useSavedNodeData below), not merely the live
 * in-editor `value`, so undoing an in-progress edit by clearing it doesn't
 * quietly keep an unsaved number around either. `fallback` only kicks in
 * when nothing's ever been saved for this field.
 */
// A node's `data` should already hold this field's default the moment it's
// placed (see NODE_DEFAULTS in addNode, SceneBuilderPage.tsx), but this
// still falls back to `fallback` for a nullish `value` regardless (a node
// type not yet covered there, a hand-edited/older saved scene) so the field
// never displays blank when it isn't meant to. Module-level, not a closure
// inside NumberInput, so its own effect can list it without an
// exhaustive-deps warning over a function that's recreated every render.
export function displayValue(value: number | null | undefined, allowEmpty: boolean, fallback: number): string {
  if (value !== null && value !== undefined) return String(value)
  return allowEmpty ? '' : String(fallback)
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  className,
  allowEmpty = false,
  fallback = 0,
  savedValue
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  min?: number
  max?: number
  placeholder?: string
  className?: string
  /** Empty commits `null` instead of snapping back to `fallback` — for optional fields like Size's width/height ("auto"). */
  allowEmpty?: boolean
  /** What an empty/unparsable field resolves to on blur when `allowEmpty` is false AND there's no saved value to restore instead (see NumberInput's doc comment). */
  fallback?: number
  /** This field's value as of the last Save (from useSavedNodeData) — what clearing the field restores, since `value` alone is just the live, possibly-never-saved edit. `undefined` before anything's ever been saved. */
  savedValue?: number | null
}) {
  const [text, setText] = useState(displayValue(value, allowEmpty, fallback))
  const isFocused = useRef(false)

  useEffect(() => {
    if (isFocused.current) return
    setText(displayValue(value, allowEmpty, fallback))
  }, [value, allowEmpty, fallback])

  const clamp = (n: number): number => {
    let out = n
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    return out
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      className={className}
      value={text}
      onFocus={() => {
        isFocused.current = true
      }}
      onChange={(e) => {
        const raw = e.target.value
        // Reject anything that isn't a (possibly partial) signed decimal —
        // keeps stray letters out while still allowing "-", ".", "-." mid-type.
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
        setText(raw)
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
        const parsed = Number(raw)
        if (!Number.isNaN(parsed)) onChange(clamp(parsed))
      }}
      onBlur={() => {
        isFocused.current = false
        // Restore to what was actually Saved for this field, not the
        // generic per-field `fallback` — so clearing a field you'd already
        // saved puts back what you had, not the type's blank-slate default.
        // Only when nothing's ever been saved (a brand-new node/field) does
        // this fall through to `fallback`.
        const restoreTo = savedValue !== null && savedValue !== undefined ? savedValue : fallback
        if (text.trim() === '') {
          if (allowEmpty) {
            onChange(null)
          } else {
            onChange(restoreTo)
            setText(String(restoreTo))
          }
          return
        }
        const parsed = Number(text)
        const resolved = Number.isNaN(parsed) ? restoreTo : clamp(parsed)
        onChange(resolved)
        setText(String(resolved))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}

/**
 * A custom dropdown that looks like the native `<select>` used elsewhere in
 * nodes but supports arbitrary React content per option (e.g. badges). The
 * menu is portaled to `document.body` (same trick as PlaceholderPicker) so
 * it stacks above React Flow panels. Position is tracked via RAF so the
 * menu follows the trigger when the canvas is panned or zoomed.
 */
export function NodeSelect<T extends string>({
  value,
  options,
  onChange,
  renderOption
}: {
  value: T
  options: readonly T[]
  onChange: (next: T) => void
  /** Custom renderer for each option. Receives the option value and whether it's the currently selected one. Falls back to plain text. */
  renderOption?: (option: T, selected: boolean) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click. Capture phase matters here: React Flow's canvas
  // pan gesture (d3-zoom, attached directly to the pane element) calls
  // event.stopImmediatePropagation() on every 'mousedown' that starts on the
  // pane, so a bubble-phase document listener never sees a click on empty
  // canvas — the classic symptom being "the dropdown won't close when I
  // click the canvas." A capture-phase listener runs on the way DOWN to the
  // target, before that stopImmediatePropagation() call ever happens.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [open])

  // Track trigger position via RAF so the menu follows the node during canvas pan/zoom
  useEffect(() => {
    if (!open) return
    let rafId: number
    const track = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (trigger && menu) {
        const rect = trigger.getBoundingClientRect()
        menu.style.left = `${rect.left}px`
        menu.style.top = `${rect.bottom + 2}px`
        menu.style.minWidth = `${rect.width}px`
      }
      rafId = requestAnimationFrame(track)
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
  }, [open])

  const triggerContent = renderOption ? renderOption(value, true) : value

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(selectClass, 'flex items-center gap-1 text-left cursor-pointer text-xs')}
      >
        {triggerContent}
        <ChevronDown className="size-3 shrink-0 opacity-50 ml-auto" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed' }}
            className="z-[9999] rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden"
          >
            {/* max-h caps the menu instead of letting it grow unbounded — a
                long options list (e.g. TextNode's Font field, one entry per
                installed system font) could otherwise stretch off-screen.
                ScrollArea takes over past that height, same scrollable
                pattern as the Add Node panel in SceneBuilderPage.tsx. */}
            <ScrollArea className="max-h-72">
              <div className="py-1">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-1.5',
                      opt === value && 'bg-accent/50'
                    )}
                  >
                    {renderOption ? renderOption(opt, opt === value) : opt}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>,
          document.body
        )}
    </>
  )
}

/**
 * The {} button next to a text field — opens a list of AVAILABLE
 * placeholders (see useAvailablePlaceholders — `tokens`, not the full
 * TEXT_PLACEHOLDERS, so a Text with nothing wired in doesn't offer
 * {title}/{artist} that would just render literally) and inserts the
 * chosen one at the cursor. Rendered via a portal to document.body: React
 * Flow's own Panels (Add Node, Save Changes, Preview) live outside the
 * pannable node layer with their own z-index, so a menu nested inside a
 * node can never stack above them — it'd render fully visible but
 * silently un-clickable wherever a Panel happens to overlap it.
 */
export function PlaceholderPicker({ tokens, onInsert }: { tokens: readonly string[]; onInsert: (token: string) => void }) {
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Capture phase — see NodeSelect's outside-click effect above for why.
  useEffect(() => {
    if (!anchor) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setAnchor(null)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [anchor])

  const toggle = () => {
    if (anchor) {
      setAnchor(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setAnchor({ right: window.innerWidth - rect.right, top: rect.bottom + 4 })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title="Insert placeholder"
        className="nodrag h-6 px-1.5 rounded bg-muted hover:bg-accent border border-transparent hover:border-border text-[10px] font-mono text-muted-foreground hover:text-accent-foreground shrink-0"
      >
        {'{}'}
      </button>
      {anchor &&
        createPortal(
          <div
            ref={menuRef}
            style={{ right: anchor.right, top: anchor.top }}
            className="nodrag fixed z-[9999] min-w-[110px] rounded-md border bg-popover text-popover-foreground shadow-lg py-1"
          >
            {tokens.length === 0 ? (
              <p className="w-48 px-2 py-1 text-[11px] text-muted-foreground leading-snug">
                Nothing wired in yet — connect an Event (for user/amount/message/source) or Audio Player (for title/artist) to enable placeholders.
              </p>
            ) : (
              tokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onInsert(token)
                    setAnchor(null)
                  }}
                  className="w-full text-left px-2 py-1 text-xs font-mono hover:bg-accent hover:text-accent-foreground"
                >
                  {`{${token}}`}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </>
  )
}
/** Sentinel for the "use the overlay page's own default font stack" option — NodeSelect can't take an empty/null value. */
export const SYSTEM_DEFAULT_FONT = '__default__'

export const TEXT_ALIGN_BUTTONS = [
  { id: 'left', Icon: AlignLeft, title: 'Left' },
  { id: 'center', Icon: AlignCenter, title: 'Center' },
  { id: 'right', Icon: AlignRight, title: 'Right' },
  { id: 'justify', Icon: AlignJustify, title: 'Justify' }
] as const

export const TEXT_VERTICAL_BUTTONS = [
  { id: 'top', Icon: AlignVerticalJustifyStart, title: 'Top' },
  { id: 'middle', Icon: AlignVerticalJustifyCenter, title: 'Middle' },
  { id: 'bottom', Icon: AlignVerticalJustifyEnd, title: 'Bottom' }
] as const

/** A row of mutually-exclusive icon buttons (Align, Vertical) — the compact node-UI equivalent of TextSettings.tsx's alignment button group elsewhere in the app, since that component's shadcn Button/CollapsibleSection styling doesn't fit inside a node's tight layout. */
export function IconToggleGroup<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: readonly { id: T; Icon: LucideIcon; title: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="nodrag flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5 w-fit">
      {options.map(({ id, Icon, title }) => (
        <button
          key={id}
          type="button"
          title={title}
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center justify-center size-6 rounded transition-colors',
            id === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}

/**
 * Upload/Remove row for a node-level file upload (ImageNode, SoundNode) —
 * mirrors AlertSoundPicker's upload/remove buttons (components/
 * AlertSoundPicker.tsx) in miniature, for the compact node-UI context.
 * Files themselves persist in the app's own writable directory
 * (userData/custom-images or custom-sounds — see main/index.ts) until
 * explicitly removed here, independent of any particular scene/node using
 * them — same lifetime as a bundled preset asset.
 */
export function UploadRow({
  uploading,
  hasCustom,
  onUpload,
  onRemove,
  label
}: {
  uploading: boolean
  hasCustom: boolean
  onUpload: () => void
  onRemove: () => void
  label: string
}) {
  return (
    <div className="nodrag flex items-center gap-1.5">
      <button
        type="button"
        onClick={onUpload}
        disabled={uploading}
        className="flex items-center gap-1 text-[11px] py-1 px-2 rounded bg-muted hover:bg-accent border border-transparent hover:border-border transition-colors disabled:opacity-50"
      >
        <Upload className="size-3" />
        {uploading ? 'Uploading…' : label}
      </button>
      {hasCustom && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove uploaded file"
          className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
/** 'auto' (default) plays entrance on a Task's 'show' action and exit on 'hide', same as before this field existed. 'in'/'out' pin the direction explicitly, overriding the Task's own action — see computeTaskState in SceneBuilderPage.tsx / overlays/custom.html. */
export const ANIMATION_SUB_TYPES = ['auto', 'in', 'out'] as const
/** A container: background, padding, corner radius, optional border — mirrors BoxAppearanceConfig/accentColor shared by every real overlay. Connect Text/Image into it, then it into Scene (or straight into Scene itself if you don't need a card behind them). */
/**
 * Corner treatment for a Box (see boxShapeStyle, shared by BoxView in
 * SceneBuilderPage.tsx / buildBox in overlays/custom.html): 'rectangle'
 * keeps the plain Radius field; the rest override it with a fixed
 * border-radius ('pill'/'circle') or a clip-path polygon
 * ('hexagon'/'diamond') — a Box already being a general-purpose
 * background+padding+children container, this is what makes it double as a
 * badge/avatar-frame/callout shape instead of needing a whole separate
 * "Shape" node type for what's really just one more corner style.
 */
export const BOX_SHAPE_IDS = ['rectangle', 'pill', 'circle', 'hexagon', 'diamond'] as const
export const EVENT_KINDS = ['alert', 'command'] as const

export const ALERT_PLATFORM_LABELS: Record<AlertPlatform, string> = { twitch: 'Twitch', youtube: 'YouTube' }

/** Falls back to inferring platform from a saved alertType (pre-platform-field scenes) rather than always defaulting to 'twitch' — otherwise loading an old YouTube-typed Event node would show a Sub-type list that doesn't contain its own saved value. */
export function inferAlertPlatform(data: Record<string, unknown>): AlertPlatform {
  if (data.platform === 'twitch' || data.platform === 'youtube') return data.platform
  const savedType = data.alertType as string
  return (ALERT_TYPES_BY_PLATFORM.youtube as string[]).includes(savedType) ? 'youtube' : 'twitch'
}
export const TASK_ACTIONS = ['show', 'hide', 'update'] as const
/** Maps 1:1 onto CSS `overflow-x`/`overflow-y` — see OverflowNode. 'auto' shows a scrollbar only once content actually exceeds the box (from a wired Size, most often); 'scroll' always reserves one. */
export const OVERFLOW_MODES = ['visible', 'hidden', 'auto', 'scroll'] as const
/** Which way an Overflow node's Auto-scroll animates its content — see overflowAutoScroll in overlays/sceneUtils.tsx. 'up'/'down' pick the vertical keyframe, 'left'/'right' the horizontal one; 'down'/'right' just play the same keyframe in reverse. */
export const SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const
