import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * A minimal popover for a trigger button inside a node — used instead of
 * Radix's Popover for the same reason NodeSelect rolls its own dropdown:
 * Radix's dismiss-on-outside-click depends on a bubble-phase 'mousedown'
 * listener on document reaching all the way back up, but React Flow's canvas
 * pan gesture (d3-zoom, attached directly to the pane element) calls
 * event.stopImmediatePropagation() on every 'mousedown' that starts on the
 * pane — so that listener never fires, and a Radix Popover opened from
 * inside a node never closes when you click empty canvas.
 * Portaled + capture-phase, same fix as NodeSelect's own outside-click effect.
 */
export function NodePopover({
  trigger,
  children,
  className,
  side = 'bottom',
  sideOffset = 8
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  children: React.ReactNode
  className?: string
  side?: 'bottom' | 'right'
  sideOffset?: number
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!open) return
    let rafId: number
    const track = () => {
      const t = triggerRef.current
      const m = menuRef.current
      if (t && m) {
        const rect = t.getBoundingClientRect()
        if (side === 'right') {
          m.style.left = `${rect.right + sideOffset}px`
          m.style.top = `${rect.top}px`
        } else {
          m.style.left = `${rect.left}px`
          m.style.top = `${rect.bottom + sideOffset}px`
        }
      }
      rafId = requestAnimationFrame(track)
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
  }, [open, side, sideOffset])

  const clonedTrigger = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e)
      setOpen((prev) => !prev)
    }
  } as never)

  return (
    <>
      {clonedTrigger}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed' }}
            className={cn('z-[9999] rounded-md border bg-popover text-popover-foreground shadow-md', className)}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
