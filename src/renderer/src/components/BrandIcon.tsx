import type { ComponentType, SVGProps } from 'react'
import type { SimpleIcon } from 'simple-icons'
import { siObsstudio, siSpotify, siTwitch, siYoutube } from 'simple-icons'

/**
 * Renders one `simple-icons` brand mark with `fill="currentColor"` — not the
 * brand's own hex — so it drops into the same status-driven color classes
 * (`text-emerald-600`, `text-muted-foreground`, ...) the sidebar/dashboard
 * already apply to integration icons, matching lucide-react's own
 * `currentColor` convention closely enough that call sites (`<Icon
 * className="size-5" />`) don't need to change.
 */
function BrandIcon({ icon, ...props }: SVGProps<SVGSVGElement> & { icon: SimpleIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="img" {...props}>
      <title>{icon.title}</title>
      <path d={icon.path} />
    </svg>
  )
}

function bind(icon: SimpleIcon): ComponentType<SVGProps<SVGSVGElement>> {
  return (props: SVGProps<SVGSVGElement>) => <BrandIcon icon={icon} {...props} />
}

export const TwitchIcon = bind(siTwitch)
export const YoutubeIcon = bind(siYoutube)
export const SpotifyIcon = bind(siSpotify)
export const ObsIcon = bind(siObsstudio)
