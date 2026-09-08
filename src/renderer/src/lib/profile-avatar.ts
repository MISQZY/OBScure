import type { AvatarColor } from '@shared/profiles'

// Tailwind v4 needs statically-written class names to pick these up — this map
// is what turns a stored `AvatarColor` key into an actual background class.
export const AVATAR_COLOR_CLASSES: Record<AvatarColor, string> = {
  red: 'bg-red-500 text-white',
  orange: 'bg-orange-500 text-white',
  amber: 'bg-amber-500 text-white',
  lime: 'bg-lime-600 text-white',
  emerald: 'bg-emerald-500 text-white',
  cyan: 'bg-cyan-500 text-white',
  blue: 'bg-blue-500 text-white',
  violet: 'bg-violet-500 text-white',
  fuchsia: 'bg-fuchsia-500 text-white',
  pink: 'bg-pink-500 text-white'
}

export function profileInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}
