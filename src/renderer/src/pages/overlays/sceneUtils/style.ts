import { Node } from "@xyflow/react";
import { lastOfType } from "./graph";

/** `#rrggbb` + an opacity percent -> `rgba(...)` — for the Shadow node's color+opacity fields, which (unlike Text/Box's own plain colors) need an alpha channel a hex string alone can't carry. */
export function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = (hex || '#000000').replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) || 0
  const g = parseInt(clean.slice(2, 4), 16) || 0
  const b = parseInt(clean.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`
}


/**
 * Position/Size/Transform/Opacity/Shadow/Hide modifier nodes wired into a
 * target, expressed as inline CSS — mirrors applyModifierStyle in
 * overlays/custom.html. Hide: a manual on/off switch (display: none unless
 * its own Hidden checkbox is off) — see HideNode's own doc comment in
 * components/nodes/index.tsx for how this differs from a Task's show/hide.
 */
export function modifierStyle(mods: Node[], baseMods?: Node[]): React.CSSProperties {
  const style: React.CSSProperties = {}

  const size = lastOfType(mods, 'size')
  const baseSize = baseMods && lastOfType(baseMods, 'size')
  if (size || baseSize) {
    const targetSize = size || baseSize
    if (targetSize?.data.width != null) style.width = targetSize.data.width as number
    if (targetSize?.data.height != null) style.height = targetSize.data.height as number
  }

  const overflow = lastOfType(mods, 'overflow')
  const baseOverflow = baseMods && lastOfType(baseMods, 'overflow')
  if (overflow || baseOverflow) {
    const targetOverflow = overflow || baseOverflow
    if (targetOverflow?.data.overflowX) style.overflowX = targetOverflow.data.overflowX as React.CSSProperties['overflowX']
    if (targetOverflow?.data.overflowY) style.overflowY = targetOverflow.data.overflowY as React.CSSProperties['overflowY']
    if (targetOverflow?.data.hideScrollbar) {
      style.scrollbarWidth = 'none'
      style.msOverflowStyle = 'none'
    }
    // Auto-scroll's whole illusion depends on the scrolling axis actually
    // clipping (see AutoScrollTrack's own doc comment) — a track sliding
    // around inside an axis left 'visible' just shows BOTH duplicated
    // copies fully unfolded with no windowing at all, which reads as
    // "doesn't scroll through properly, jumps around" (the exact bug this
    // was built to prevent — it's easy to flip Auto-scroll on without also
    // remembering to set that SAME axis's own Overflow X/Y to hidden/auto).
    // Force it here rather than trusting the separate dropdown to already
    // agree with it.
    if (targetOverflow?.data.autoScroll) {
      const scrollDirection = (targetOverflow.data.scrollDirection as string) || 'up'
      if (scrollDirection === 'left' || scrollDirection === 'right') {
        if (style.overflowX === 'visible' || style.overflowX == null) style.overflowX = 'hidden'
      } else {
        if (style.overflowY === 'visible' || style.overflowY == null) style.overflowY = 'hidden'
      }
    }
  }

  let transformStr = ''

  const transform = lastOfType(mods, 'transform')
  const baseTransform = baseMods && lastOfType(baseMods, 'transform')
  if (transform || baseTransform) {
    const bsx = (baseTransform?.data.scaleX as number) ?? 1
    const bsy = (baseTransform?.data.scaleY as number) ?? 1
    const brot = (baseTransform?.data.rotation as number) ?? 0
    if (transform) {
      const tsx = (transform.data.scaleX as number) ?? 1
      const tsy = (transform.data.scaleY as number) ?? 1
      const trot = (transform.data.rotation as number) ?? 0
      transformStr += `scale(${bsx * tsx}, ${bsy * tsy}) rotate(${brot + trot}deg) `
    } else {
      transformStr += `scale(${bsx}, ${bsy}) rotate(${brot}deg) `
    }
  }

  const position = lastOfType(mods, 'position')
  const basePosition = baseMods && lastOfType(baseMods, 'position')
  if (position || basePosition) {
    const bx = (basePosition?.data.x as number) ?? 0
    const by = (basePosition?.data.y as number) ?? 0
    let x = bx
    let y = by
    if (position) {
      if (position.data.x != null || basePosition) x = bx + ((position.data.x as number) ?? 0)
      if (position.data.y != null || basePosition) y = by + ((position.data.y as number) ?? 0)
    }

    const targetPos = position || basePosition
    const mode = (targetPos?.data.mode as string) || 'absolute'
    const anchor = (targetPos?.data.anchor as string) || 'top-left'

    if (mode === 'absolute') {
      style.position = 'absolute'
      if (anchor.includes('top')) style.top = y
      if (anchor.includes('bottom')) style.bottom = y
      if (anchor.includes('left')) style.left = x
      if (anchor.includes('right')) style.right = x

      if (anchor === 'center' || anchor === 'top-center' || anchor === 'bottom-center') {
        style.left = '50%'
        style.marginLeft = x
        transformStr += 'translateX(-50%) '
      }
      if (anchor === 'center' || anchor === 'center-left' || anchor === 'center-right') {
        style.top = '50%'
        style.marginTop = y
        transformStr += 'translateY(-50%) '
      }
    } else if (mode === 'relative') {
      transformStr += `translate(${x}px, ${y}px) `
    }
  }

  if (transformStr) {
    style.transform = transformStr.trim()
  }

  const opacity = lastOfType(mods, 'opacity')
  const baseOpacity = baseMods && lastOfType(baseMods, 'opacity')
  if (opacity || baseOpacity) {
    const bOp = (baseOpacity?.data.value as number) ?? 100
    if (opacity) {
      const tOp = (opacity.data.value as number) ?? 100
      style.opacity = (bOp / 100) * (tOp / 100)
    } else {
      style.opacity = bOp / 100
    }
  }

  const shadow = lastOfType(mods, 'shadow')
  if (shadow) {
    const color = hexToRgba((shadow.data.color as string) || '#000000', (shadow.data.opacity as number) ?? 60)
    const offsetX = (shadow.data.offsetX as number) ?? 0
    const offsetY = (shadow.data.offsetY as number) ?? 2
    const blur = (shadow.data.blur as number) ?? 6
    style.filter = `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${color})`
  } else if (baseMods) {
    const baseShadow = lastOfType(baseMods, 'shadow')
    if (baseShadow) {
      const color = hexToRgba((baseShadow.data.color as string) || '#000000', (baseShadow.data.opacity as number) ?? 60)
      const offsetX = (baseShadow.data.offsetX as number) ?? 0
      const offsetY = (baseShadow.data.offsetY as number) ?? 2
      const blur = (baseShadow.data.blur as number) ?? 6
      style.filter = `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${color})`
    }
  }

  const hide = lastOfType(mods, 'hide')
  const baseHide = baseMods && lastOfType(baseMods, 'hide')
  if (hide) {
    if (hide.data.hidden !== false) style.display = 'none'
  } else if (baseHide) {
    if (baseHide.data.hidden !== false) style.display = 'none'
  }

  return style
}


/** A node's own border fields (borderEnabled/borderWidth/borderColor — same shape as BoxNode's) as a CSS border value, or undefined when off. Shared by ImageView/VideoView; BoxView computes its own inline since it also needs the fields for other purposes. */
export function borderStyle(node: Node): string | undefined {
  if (!node.data.borderEnabled) return undefined
  return `${(node.data.borderWidth as number) ?? 2}px solid ${(node.data.borderColor as string) || '#ffffff'}`
}


/** Ordering modifier node wired into a target (Box or Scene), expressed as a tailwind flex-direction class. */
export function orderingClass(mods: Node[]): string {
  const ordering = mods.find((m) => m.type === 'ordering')
  if (!ordering) return 'flex-col'

  const layout = (ordering.data.layout as string) || 'vertical'
  const direction = (ordering.data.direction as string) || 'direct'

  if (layout === 'horizontal') {
    return direction === 'revert' ? 'flex-row-reverse' : 'flex-row'
  } else {
    return direction === 'revert' ? 'flex-col-reverse' : 'flex-col'
  }
}


/** Spacing (px) between a Box/Scene's children, from the same Ordering modifier orderingClass reads — mirrors orderingGap in overlays/custom.html. 8px (the old hardcoded CSS value) when no Ordering node is wired, so every scene predating this field keeps its exact old spacing. */
export function orderingGap(mods: Node[]): number {
  const ordering = mods.find((m) => m.type === 'ordering')
  return (ordering?.data.gap as number) ?? 8
}


/** Which axis is the CROSS axis for a Box/Scene's children, from the same Ordering modifier orderingClass reads — 'vertical' for a horizontal/row layout, 'horizontal' for the default vertical/column one. Mirrors crossAxisFor in overlays/custom.html; see TextView's own doc comment for what this is used for. */
export function crossAxisFor(mods: Node[]): 'horizontal' | 'vertical' {
  const ordering = mods.find((m) => m.type === 'ordering')
  const layout = (ordering?.data.layout as string) || 'vertical'
  return layout === 'horizontal' ? 'vertical' : 'horizontal'
}


/**
 * A Random Widget's own Ordering wire (see RANDOM_WIDGET_SOCKETS in
 * components/nodes/constants.ts) resolved into a raw flex direction/gap —
 * unlike orderingClass/orderingGap above (Tailwind classes, for Box/Scene's
 * own children), this widget uses inline styles throughout, and its
 * un-wired DEFAULT is a row (numbers side by side, wrapping if there's not
 * enough width) rather than Box/Scene's own column default — a roll result
 * reads far more naturally left-to-right than stacked, and this widget
 * never had any prior scene depending on a column default to preserve.
 * Mirrors randomWidgetOrdering in overlays/custom.html.
 */
export function randomWidgetOrdering(mods: Node[]): { flexDirection: 'row' | 'row-reverse' | 'column' | 'column-reverse'; gap: number } {
  const ordering = mods.find((m) => m.type === 'ordering')
  if (!ordering) return { flexDirection: 'row', gap: 12 }
  const layout = (ordering.data.layout as string) || 'vertical'
  const direction = (ordering.data.direction as string) || 'direct'
  const flexDirection = layout === 'horizontal' ? (direction === 'revert' ? 'row-reverse' : 'row') : direction === 'revert' ? 'column-reverse' : 'column'
  return { flexDirection, gap: (ordering.data.gap as number) ?? 8 }
}


/** A Box's corner treatment (see BOX_SHAPE_IDS' own doc comment in components/nodes/index.tsx) as borderRadius/clipPath — mirrors boxShapeStyle in overlays/custom.html. */
export function boxShapeStyle(node: Node): { borderRadius: string; clipPath?: string } {
  const shape = (node.data.shape as string) || 'rectangle'
  if (shape === 'circle') return { borderRadius: '50%' }
  if (shape === 'pill') return { borderRadius: '9999px' }
  if (shape === 'hexagon') return { borderRadius: '0px', clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }
  if (shape === 'diamond') return { borderRadius: '0px', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }
  return { borderRadius: `${(node.data.borderRadius as number) ?? 10}px` }
}
