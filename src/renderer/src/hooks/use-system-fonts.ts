import { useEffect, useState } from 'react'

/** System font family names (see fonts:getSystem in src/main/index.ts). Empty until loaded. */
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>([])

  useEffect(() => {
    window.obscure.getSystemFonts().then(setFonts).catch(() => setFonts([]))
  }, [])

  return fonts
}
