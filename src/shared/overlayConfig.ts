/** Shared entrance/exit animation set — see overlays/animations.css for the actual keyframes. */
export const ANIMATION_IDS = ['none', 'fade', 'slide', 'zoom', 'bounce'] as const
export type AnimationId = (typeof ANIMATION_IDS)[number]

/**
 * Full-size ambient background layer — see overlays/background-animations.css.
 * Distinct from AnimationId (that's the card/alert's own entrance/exit); this
 * fills the entire Browser Source instead of just sizing to the widget, and
 * is shown automatically whenever it's set to anything other than 'none'.
 *
 * 'vignette' is a static radial tint toward the edges/corners — previously
 * baked into 'paratrooper' and 'airdrop' themselves (so the configured color
 * showed up somewhere even though their small pixel-art sprite couldn't
 * carry it on its own); it's its own pickable option now, and those two no
 * longer apply it.
 *
 * 'paratrooper' and 'airdrop' are one-shot DOM-based effects rather than
 * plain CSS background patterns:
 *  - see overlays/paratrooper.css/.js: a soldier, built from randomly preset
 *    parts, parachutes in and then runs off along the bottom edge.
 *  - see overlays/airdrop.css/.js: a supply crate parachutes down, lands,
 *    and then vents smoke tinted with backgroundAnimationColor for the rest
 *    of the effect.
 * Both replay on a loop while the background is visible.
 */
export const BACKGROUND_ANIMATION_IDS = ['none', 'gradient', 'pulse', 'stars', 'vignette', 'paratrooper', 'airdrop'] as const
export type BackgroundAnimationId = (typeof BACKGROUND_ANIMATION_IDS)[number]

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
