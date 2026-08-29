/** Fixed palette for profile avatars — stored as a key (not a hex value) so the
 *  renderer fully controls the actual colors/theming. */
export const AVATAR_COLORS = [
  'red',
  'orange',
  'amber',
  'lime',
  'emerald',
  'cyan',
  'blue',
  'violet',
  'fuchsia',
  'pink'
] as const

export type AvatarColor = (typeof AVATAR_COLORS)[number]

export const MAX_PROFILES = 10

export const DEFAULT_PROFILE_NAME = 'Гостевой'

export interface Profile {
  id: string
  name: string
  avatarColor: AvatarColor
  createdAt: number
}
