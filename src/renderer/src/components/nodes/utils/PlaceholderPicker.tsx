import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/providers/I18nProvider'

/**
 * The {} button next to a text field — opens a list of AVAILABLE
 * placeholders (see useAvailablePlaceholders — `tokens`, not the full
 * TEXT_PLACEHOLDERS, so a Text with nothing wired in doesn't offer
 * {title}/{artist} that would just render literally) and inserts the
 * chosen one at the cursor. Rendered via a portal to document.body: React
 * Flow's own Panels (Add Node, Save Changes, Preview) live outside the
 * pannable node layer with their own z-index, so a menu nested inside a
 * node can never stack above them — it'd render fully visible but
 * silently un-clickable wherever a Panel happens to overlap it.
 */
export function PlaceholderPicker({ tokens, onInsert }: { tokens: readonly string[]; onInsert: (token: string) => void }) {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Capture phase — see NodeSelect's outside-click effect above for why.
  useEffect(() => {
    if (!anchor) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setAnchor(null)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [anchor])

  const toggle = () => {
    if (anchor) {
      setAnchor(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setAnchor({ right: window.innerWidth - rect.right, top: rect.bottom + 4 })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title={t.sceneBuilder.tooltip.insertPlaceholder}
        className="nodrag h-6 px-1.5 rounded bg-muted hover:bg-accent border border-transparent hover:border-border text-[10px] font-mono text-muted-foreground hover:text-accent-foreground shrink-0"
      >
        {'{}'}
      </button>
      {anchor &&
        createPortal(
          <div
            ref={menuRef}
            style={{ right: anchor.right, top: anchor.top }}
            className="nodrag fixed z-[9999] min-w-[110px] rounded-md border bg-popover text-popover-foreground shadow-lg py-1"
          >
            {tokens.length === 0 ? (
              <p className="w-48 px-2 py-1 text-[11px] text-muted-foreground leading-snug">
                Nothing wired in yet — connect an Event (for user/amount/message/source) or Audio Player (for title/artist) to enable placeholders.
              </p>
            ) : (
              tokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onInsert(token)
                    setAnchor(null)
                  }}
                  className="w-full text-left px-2 py-1 text-xs font-mono hover:bg-accent hover:text-accent-foreground"
                >
                  {`{${token}}`}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </>
  )
}
