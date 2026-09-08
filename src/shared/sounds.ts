/**
 * Alert sound choice — a bundled preset (served from overlays/sounds/<id>.wav,
 * shipped with the app), a user-uploaded file (copied into the app's
 * userData/custom-sounds directory, see main/index.ts), or none at all.
 */
export const PRESET_SOUND_IDS = ['chime', 'coin', 'pop', 'notify'] as const
export type PresetSoundId = (typeof PRESET_SOUND_IDS)[number]

export const SOUND_IDS = ['none', ...PRESET_SOUND_IDS, 'custom'] as const
export type SoundId = (typeof SOUND_IDS)[number]

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === 'string' && (SOUND_IDS as readonly string[]).includes(value)
}
