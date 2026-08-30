import { useStore } from '@xyflow/react'
import { PROCESS_TYPES } from '../constants'
import { EVENT_PLACEHOLDERS } from './constants'

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
 * one). Random's Content output works the same way (see RANDOM_OUTPUTS/
 * randomContentValues) — wiring it into THIS node's own Content socket arms
 * 'number'/'numbers'/'hash'/'seed' together, no scene-wide equivalent (it
 * has nothing like Audio Player's own Event-into-Scene arming). Roulette
 * Entrants has no placeholder tokens of its own — it feeds a Text's Content
 * socket as a full REPLACEMENT (see ROULETTE_ENTRANTS_OUTPUTS' own doc
 * comment in constants.ts and TextNode.tsx's own doc comment), not a
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
      const directRandomContent = s.edges.some(
        (e) => e.target === nodeId && e.targetHandle === 'content' && s.nodes.find((n) => n.id === e.source)?.type === 'randomSource'
      )
      const result: string[] = []
      if (hasEvent) result.push(...EVENT_PLACEHOLDERS)
      if (audioIntoScene || directAudioContent) result.push('artist', 'title')
      if (directRandomContent) result.push('number', 'numbers', 'hash', 'seed')
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
