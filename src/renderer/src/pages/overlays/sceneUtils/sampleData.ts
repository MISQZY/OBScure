/** Sample vars used to simulate a real alert from Play/Test — see sceneTrigger and handlePlay. */
export const SAMPLE_ALERT_VARS = { user: 'Viewer', amount: 25, message: 'Sample message', source: 'twitch' }


/**
 * Sample now-playing vars for previewing an Audio Player's Content/Event
 * outputs (see AUDIO_PLAYER_OUTPUTS in components/nodes) in the editor —
 * there's no live now-playing feed inside the builder (unlike the real
 * overlay, which gets one over the 'now-playing' broadcast channel — see
 * overlays/custom.html), so a Text/Image wired to Content always previews
 * with this fixed sample instead. Mirrors the sample vars render() in
 * overlays/custom.html uses for its own Test-button simulation.
 */
export const SAMPLE_AUDIO_VARS = { artist: 'Sample Artist', title: 'Sample Track', albumArt: '' }


/**
 * Sample round for previewing a Roulette node's Content/Event outputs (see
 * ROULETTE_OUTPUTS in components/nodes/constants.ts) in the editor — same
 * reasoning as SAMPLE_AUDIO_VARS above: there's no live roulette feed inside
 * the builder (the real overlay gets one over the 'roulette-state' broadcast
 * channel — see overlays/custom.html), so anything wired to Roulette always
 * previews with this fixed sample instead. `entrants` doubles as
 * RouletteWheelView's own wheel data (see overlays/views/index.tsx).
 */
export const SAMPLE_ROULETTE_STATE = {
  phase: 'collecting' as const,
  entrants: [
    { id: 's1', name: 'Alice', source: 'chat' as const, weight: 1 },
    { id: 's2', name: 'Bob', source: 'points' as const, weight: 2 },
    { id: 's3', name: 'Carla', source: 'manual' as const, weight: 1 }
  ],
  winner: 'Alice'
}

/**
 * Sample roll for previewing a Random node's Content/Event outputs (see
 * RANDOM_OUTPUTS in components/nodes/constants.ts) in the editor — same
 * reasoning as SAMPLE_ROULETTE_STATE above: there's no live commit/reveal
 * feed inside the builder (the real overlay gets one over the
 * 'random-state' broadcast channel — see overlays/custom.html), so anything
 * wired to Random always previews with this fixed sample instead. `phase`
 * is fixed at 'revealed' (not 'idle'/'committed') so the Widget/Result
 * preview always has something concrete to show rather than an empty state.
 * Three numbers (not one) so the Widget's preview actually demonstrates a
 * multi-result roll (Count > 1) — the real count only exists in the Random
 * tool's own saved config (RandomToolPage.tsx), not on the node itself, so
 * there's no "real" count to mirror here either way.
 */
export const SAMPLE_RANDOM_STATE = {
  phase: 'revealed' as const,
  numbers: [42, 17, 8],
  hash: 'a3f9c1d8e2b74650f1a9c3d7e8b2f405c6a1d9e3f7b8c2a5d6e9f1b3c7a8d2e4',
  seed: '91cdab34ef567890123456789abcdef0',
  min: 1,
  max: 100,
  count: 3
}

/**
 * {entrants, entrantsList, winner, timeLeft} sample vars for a Start-armed-
 * by-Roulette process's own simulated Play/Test run (see
 * handlePlay in hooks/useScenePlayback.ts) — lets a Task's own
 * {title}/{artist}/{entrants}/{winner}/... placeholders preview as
 * something other than literal text while the process is armed purely by
 * Roulette (no real alert type). Unrelated to a plain Text's own Content
 * wire — see rouletteEntrantsTextValue in contentValues.ts for how a
 * Roulette Entrants node feeds one of THOSE instead (a full replacement,
 * not a placeholder template these tokens fill into). `timeLeft` is a fixed
 * sample string (no real countdown to simulate here, same reasoning as
 * SAMPLE_AUDIO_VARS' own static values) — the real overlay computes and
 * ticks its own live one instead (see rouletteStateVars in
 * overlays/custom.html).
 */
export const SAMPLE_ROULETTE_VARS = {
  entrants: SAMPLE_ROULETTE_STATE.entrants.map((entrant) => entrant.name).join(', '),
  entrantsList: SAMPLE_ROULETTE_STATE.entrants.map((entrant) => entrant.name).join('\n'),
  winner: SAMPLE_ROULETTE_STATE.winner,
  timeLeft: '1:30'
}
