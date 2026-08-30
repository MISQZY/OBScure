import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { selectClass } from './constants'

/**
 * A custom dropdown that looks like the native `<select>` used elsewhere in
 * nodes but supports arbitrary React content per option (e.g. badges). The
 * menu is portaled to `document.body` (same trick as PlaceholderPicker) so
 * it stacks above React Flow panels. Position is tracked via RAF so the
 * menu follows the trigger when the canvas is panned or zoomed.
 */
export function NodeSelect<T extends string>({
  value,
  options,
  onChange,
  renderOption
}: {
  value: T
  options: readonly T[]
  onChange: (next: T) => void
  /** Custom renderer for each option. Receives the option value and whether it's the currently selected one. Falls back to plain text. */
  renderOption?: (option: T, selected: boolean) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click. Capture phase matters here: React Flow's canvas
  // pan gesture (d3-zoom, attached directly to the pane element) calls
  // event.stopImmediatePropagation() on every 'mousedown' that starts on the
  // pane, so a bubble-phase document listener never sees a click on empty
  // canvas — the classic symptom being "the dropdown won't close when I
  // click the canvas." A capture-phase listener runs on the way DOWN to the
  // target, before that stopImmediatePropagation() call ever happens.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [open])

  // Track trigger position via RAF so the menu follows the node during canvas pan/zoom
  useEffect(() => {
    if (!open) return
    let rafId: number
    const track = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (trigger && menu) {
        const rect = trigger.getBoundingClientRect()
        menu.style.left = `${rect.left}px`
        menu.style.top = `${rect.bottom + 2}px`
        menu.style.minWidth = `${rect.width}px`
      }
      rafId = requestAnimationFrame(track)
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
  }, [open])

  const triggerContent = renderOption ? renderOption(value, true) : value

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(selectClass, 'flex items-center gap-1 text-left cursor-pointer text-xs')}
      >
        {triggerContent}
        <ChevronDown className="size-3 shrink-0 opacity-50 ml-auto" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed' }}
            className="z-[9999] rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden"
          >
            {/* max-h caps the menu instead of letting it grow unbounded — a
                long options list (e.g. TextNode's Font field, one entry per
                installed system font) could otherwise stretch off-screen.
                ScrollArea takes over past that height, same scrollable
                pattern as the Add Node panel in SceneBuilderPage.tsx. */}
            <ScrollArea className="max-h-72">
              <div className="py-1">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-1.5',
                      opt === value && 'bg-accent/50'
                    )}
                  >
                    {renderOption ? renderOption(opt, opt === value) : opt}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>,
          document.body
        )}
    </>
  )
}
