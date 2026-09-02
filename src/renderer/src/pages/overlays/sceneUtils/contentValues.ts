import { Edge, Node } from "@xyflow/react";
import type { GlobalVariable } from "@shared/types";
import { variablePlaceholderName, variablePlaceholderValue } from "@/components/nodes";
import { NodeMap } from "./graph";
import { SAMPLE_AUDIO_VARS, SAMPLE_ROULETTE_STATE, SAMPLE_RANDOM_STATE } from "./sampleData";
import { interpolate } from "./sceneTrigger";

/**
 * One formatted row per entrant, for a Roulette Entrants list node's own
 * `layout`/`rowTemplate`/`sortByChance` fields (see NODE_DEFAULTS.
 * rouletteEntrants in components/nodes/constants.ts) — `rowTemplate`
 * supports {name}/{chance}/{weight} tokens via the same interpolate() every
 * other template field in this file already uses. `chance` is the same
 * weighted-percentage formula RouletteWheel.tsx/RouletteToolPage.tsx use for
 * their own wheel/entrant-list. Mirrors rouletteEntrantRows in
 * overlays/custom.html.
 */
export function rouletteEntrantRows(entrants: { name: string; weight: number }[], data: Record<string, unknown>): string[] {
  const totalWeight = entrants.reduce((sum, entrant) => sum + entrant.weight, 0)
  const ordered = data.sortByChance ? [...entrants].sort((a, b) => b.weight - a.weight) : entrants
  const template = (data.rowTemplate as string) || '{name}'
  return ordered.map((entrant) => {
    const chance = totalWeight > 0 ? Math.round((entrant.weight / totalWeight) * 100) : 0
    return interpolate(template, { name: entrant.name, chance, weight: entrant.weight })
  })
}


/**
 * { artist, title } from SAMPLE_AUDIO_VARS when Audio Player's Content
 * output (see TEXT_SOCKETS/AUDIO_PLAYER_OUTPUTS in components/nodes/
 * index.tsx) feeds this Text's own Content socket (id `content`), or null
 * when it isn't wired in. Both fields always come together — Content is one
 * bundled wire, not separate Author/Title ones — so a template like
 * "{artist} — {title}" fills in full or not at all. Merged into `vars` by
 * TextView, same as audioContentValues merges the live feed into `vars` in
 * overlays/custom.html — Content's own template still decides what's shown,
 * this only supplies the values its {artist}/{title} placeholders resolve
 * to.
 */
export function audioContentValues(nodeId: string, edges: Edge[], map: NodeMap): { artist?: string; title?: string } | null {
  const hasAudioContent = edges.some((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source]?.type === 'audioPlayer')
  return hasAudioContent ? { artist: SAMPLE_AUDIO_VARS.artist, title: SAMPLE_AUDIO_VARS.title } : null
}


/**
 * The Format field of whichever Clock node is wired into this node's own
 * Content socket, or null when none is (see CLOCK_OUTPUTS' own doc comment
 * in components/nodes/constants.ts) — deliberately the FORMAT, not an
 * already-formatted string: `{time}` needs a fresh `new Date()` every
 * second, which only the actual renderer (TextView, ticking its own 1s
 * interval) is positioned to do — this only identifies WHICH format string
 * to feed it. Mirrors clockFormatFor in overlays/custom-content-values.js.
 */
export function clockFormatFor(nodeId: string, edges: Edge[], map: NodeMap): string | null {
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source]?.type === 'clock')
  if (!edge) return null
  return (map[edge.source]?.data.format as string) || 'HH:mm:ss'
}


/**
 * The FULL text a Text node should show when its own Content socket is fed
 * by a Roulette Entrants node's Content output (see ROULETTE_ENTRANTS_
 * OUTPUTS in components/nodes/constants.ts) — null when it isn't wired in.
 * Unlike audioContentValues above (which only ever SUPPLIES placeholder
 * values a template still decides how to use), this REPLACES the Text's own
 * template outright — same priority buildImage in overlays/custom.html
 * already gives Audio Player's Content wire over a set URL — because a
 * joined entrants list has no meaningful "template" of its own once
 * rouletteEntrantRows has already formatted every row (see TextNode.tsx's
 * own doc comment for why its textarea goes read-only once this is wired).
 * Reads the CONNECTED ENTRANTS NODE's own rowTemplate/layout/sortByChance/
 * separator fields, not this Text's. Mirrors rouletteEntrantsTextValue in
 * overlays/custom.html, which instead reads the REAL live round.
 */
export function rouletteEntrantsTextValue(nodeId: string, edges: Edge[], map: NodeMap): string | null {
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source]?.type === 'rouletteEntrants')
  if (!edge) return null
  const entrantsData = map[edge.source]?.data ?? {}
  const rows = rouletteEntrantRows(SAMPLE_ROULETTE_STATE.entrants, entrantsData)
  const layout = (entrantsData.layout as string) || 'list'
  return layout === 'inline' ? rows.join((entrantsData.separator as string) ?? ', ') : rows.join('\n')
}


/**
 * { number, numbers, hash, seed } from SAMPLE_RANDOM_STATE when Random's
 * Content output (see RANDOM_OUTPUTS in components/nodes/constants.ts) feeds
 * this Text's own Content socket, or null when it isn't wired in — same
 * placeholder-MERGE shape as audioContentValues above (own doc comment
 * covers the shared reasoning): this only ever supplies values a template
 * still decides how to use, so the Text's own textarea stays fully editable
 * (unlike Roulette Entrants' REPLACE-outright wire). `number` is the first
 * rolled value; `numbers` space-joins all of them, for a multi-roll. Mirrors
 * randomContentValues in overlays/custom.html, which instead reads the REAL
 * live roll.
 */
export function randomContentValues(nodeId: string, edges: Edge[], map: NodeMap): { number: number | string; numbers: string; hash: string; seed: string } | null {
  const hasRandomContent = edges.some((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source]?.type === 'randomSource')
  if (!hasRandomContent) return null
  return {
    number: SAMPLE_RANDOM_STATE.numbers[0] ?? '',
    numbers: SAMPLE_RANDOM_STATE.numbers.join(' '),
    hash: SAMPLE_RANDOM_STATE.hash,
    seed: SAMPLE_RANDOM_STATE.seed
  }
}


/** Whether this Image's `imageContent` socket is wired to Audio Player's Content output. Mirrors hasAudioCover in overlays/custom.html. */
export function hasAudioCover(nodeId: string, edges: Edge[], map: NodeMap): boolean {
  return edges.some((e) => e.target === nodeId && e.targetHandle === 'imageContent' && map[e.source]?.type === 'audioPlayer')
}


/**
 * A Progress Bar's own Current/Target value — the wired Variable node's own
 * resolved value (local `data.value`, or the referenced GlobalVariable's
 * once scope=global — see variablePlaceholderValue) for whichever socket, or
 * 0 when nothing's wired (same as any other unwired optional input, see
 * PROGRESS_SOCKETS' own doc comment). `current`/`target` land on the SAME
 * accepted type ('variable'), unlike every other paired-socket lookup in
 * this file (Audio Player's `content` vs. `event`, say), so this resolves by
 * socket id via `edges` directly rather than `lastOfType`-ing a flat `mods`
 * list, which can't tell two same-typed wires on different sockets apart.
 * Mirrors progressSourceValue in overlays/custom-content-values.js.
 */
export function progressSourceValue(
  nodeId: string,
  socketId: 'current' | 'target',
  edges: Edge[],
  map: NodeMap,
  globalVariables: GlobalVariable[]
): number {
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === socketId && map[e.source]?.type === 'variable')
  if (!edge) return 0
  const node = map[edge.source]
  return node ? variablePlaceholderValue(node, globalVariables) : 0
}


/**
 * `{name}` -> resolved value for every Variable node present ANYWHERE in
 * `nodes` (mere presence "registers" it — no wiring required, same
 * "available without wiring" convention EVENT_PLACEHOLDERS already uses, see
 * useAvailablePlaceholders/VariableNode's own doc comments), merged into
 * EVERY Text node's own `contentValues` (see ContentView.tsx) so `{myVar}`
 * resolves the same way whether typed into Scene's own content or a
 * Progress Bar's Label. A node with no resolved placeholder yet (empty local
 * name, or scope=global with nothing picked) contributes nothing. Mirrors
 * variablePlaceholderValues in overlays/custom-content-values.js.
 */
export function variablePlaceholderValues(nodes: Node[], globalVariables: GlobalVariable[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of nodes) {
    if (n.type !== 'variable') continue
    const name = variablePlaceholderName(n, globalVariables)
    if (!name) continue
    out[name] = String(variablePlaceholderValue(n, globalVariables))
  }
  return out
}
