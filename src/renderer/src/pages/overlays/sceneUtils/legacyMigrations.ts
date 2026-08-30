import { Edge } from "@xyflow/react";

/**
 * One-time upgrade for edges saved before Position/Size/Transform and
 * Opacity/Shadow/Animation/Hide were consolidated into the single multi-wire
 * `transform`/`style` sockets (see MODIFIER_SOCKETS/TASK_SOCKETS in
 * components/nodes/index.tsx) — remaps each old per-parameter targetHandle
 * to the group socket id that now carries it, purely so the EDITOR can still
 * attach the wire to a socket row that actually exists (isValidConnection/
 * SocketRow both look up sockets by id). The runtime resolvers (modifierStyle
 * below, applyModifierStyle in overlays/custom.html) never read targetHandle
 * at all — they already resolve wiring by the connected node's own `type` —
 * so an un-migrated overlay still renders correctly live; this only matters
 * for editing it further. 'transform' needs no remapping: that id already
 * meant exactly the same thing (only Transform-type nodes) before and after.
 */
export const LEGACY_MODIFIER_HANDLE_REMAP: Record<string, string> = {
  position: 'transform',
  size: 'transform',
  opacity: 'style',
  shadow: 'style',
  animation: 'style',
  hide: 'style'
}

export function migrateLegacyModifierEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => {
    const remapped = e.targetHandle ? LEGACY_MODIFIER_HANDLE_REMAP[e.targetHandle] : undefined
    return remapped ? { ...e, targetHandle: remapped } : e
  })
}


/**
 * One-time upgrade for edges saved before Audio Player's five outputs
 * (Author/Title/Cover/Event/Now Playing) were consolidated into two —
 * Content (bundles Author+Title+Cover) and Event (bundles the track-change
 * trigger and the Now Playing feed) — see AUDIO_PLAYER_OUTPUTS in
 * components/nodes/index.tsx. Remaps each old sourceHandle to the id that
 * now carries it, purely so the EDITOR can still attach the wire to an
 * output row that actually exists (OutputRow, like SocketRow, looks up
 * sockets by id). Every consumer of these edges (audioContentValues,
 * hasAudioCover, processTrigger's audioArmed, custom.html's isAudioTrigger)
 * already resolves wiring by targetHandle + the source node's own `type`,
 * never by sourceHandle — so an un-migrated overlay still renders correctly
 * live; this only matters for editing it further. These 5 ids are unique to
 * Audio Player's old outputs (no other node type's NODE_OUTPUTS uses them),
 * so remapping by sourceHandle alone, with no source-type check, is safe.
 *
 * A scene that had BOTH Author and Title wired into the same Text's Content
 * socket (the documented way to fill both placeholders at once, back when
 * they were separate outputs) ends up with two edges that are now, post-
 * remap, identical in every field that matters (same source, sourceHandle,
 * target, targetHandle) — genuinely the same connection twice, not two
 * competing producers. Left alone, usePriorityInfo would count that Audio
 * Player as its own "sibling" and show a false "1 of 2" priority badge with
 * no real competitor, so the second copy is dropped here.
 *
 * Also remaps the target side: Scene used to have its OWN dedicated
 * `audioPlayer` input socket (separate from the `event` socket a real Event
 * node uses) for the whole-scene-visibility-by-isPlaying use — that's gone
 * now, folded into Scene's own `event` socket instead (which accepts
 * 'audioPlayer' alongside 'event', same convention Start's `event` socket
 * already used) — see SCENE_SOCKETS/AUDIO_PLAYER_OUTPUTS in components/
 * nodes/index.tsx. `audioPlayer` was never used as a targetHandle anywhere
 * else, so remapping it unconditionally is safe.
 */
export const LEGACY_AUDIO_PLAYER_SOURCE_HANDLE_REMAP: Record<string, string> = {
  author: 'content',
  title: 'content',
  cover: 'content',
  trackChanged: 'event',
  feed: 'event'
}

export function migrateLegacyAudioPlayerEdges(edges: Edge[]): Edge[] {
  const remapped = edges.map((e) => {
    const newSourceHandle = e.sourceHandle ? LEGACY_AUDIO_PLAYER_SOURCE_HANDLE_REMAP[e.sourceHandle] : undefined
    const newTargetHandle = e.targetHandle === 'audioPlayer' ? 'event' : undefined
    return newSourceHandle || newTargetHandle
      ? { ...e, ...(newSourceHandle ? { sourceHandle: newSourceHandle } : {}), ...(newTargetHandle ? { targetHandle: newTargetHandle } : {}) }
      : e
  })
  const seen = new Set<string>()
  return remapped.filter((e) => {
    const key = `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
