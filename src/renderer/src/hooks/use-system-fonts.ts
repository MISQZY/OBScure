import { useEffect, useState } from 'react'

/** System font family names (see fonts:getSystem in src/main/index.ts). Empty until loaded. */
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>([])

  useEffect(() => {
    window.maddoner.getSystemFonts().then(setFonts)
  }, [])

  return fonts
}
