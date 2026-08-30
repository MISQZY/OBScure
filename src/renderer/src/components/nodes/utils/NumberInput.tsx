import { useEffect, useRef, useState } from 'react'

/**
 * Text-backed replacement for `<input type="number">`. A controlled native
 * number input snaps its DOM value back to `Number(x) || fallback` on every
 * keystroke, so intermediate states while typing — "-" before a negative
 * number, "" while clearing the field, "1." before a decimal — get erased
 * mid-type instead of staying editable (the "can't erase/type a negative
 * value" bugs). Keeping a local text buffer while focused lets those
 * intermediate states survive; a syntactically valid number commits (clamped
 * to min/max) live so the canvas preview stays in sync while typing, and
 * blur/Enter always resolves the field to a concrete number (or `null` when
 * `allowEmpty`, e.g. Size's "auto") — never leaves it stuck on garbage.
 * Clearing the field and blurring restores `savedValue` — this field's value
 * as of the last Save (see useSavedNodeData below), not merely the live
 * in-editor `value`, so undoing an in-progress edit by clearing it doesn't
 * quietly keep an unsaved number around either. `fallback` only kicks in
 * when nothing's ever been saved for this field.
 */
// A node's `data` should already hold this field's default the moment it's
// placed (see NODE_DEFAULTS in addNode, SceneBuilderPage.tsx), but this
// still falls back to `fallback` for a nullish `value` regardless (a node
// type not yet covered there, a hand-edited/older saved scene) so the field
// never displays blank when it isn't meant to. Module-level, not a closure
// inside NumberInput, so its own effect can list it without an
// exhaustive-deps warning over a function that's recreated every render.
export function displayValue(value: number | null | undefined, allowEmpty: boolean, fallback: number): string {
  if (value !== null && value !== undefined) return String(value)
  return allowEmpty ? '' : String(fallback)
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  className,
  allowEmpty = false,
  fallback = 0,
  savedValue
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  min?: number
  max?: number
  placeholder?: string
  className?: string
  /** Empty commits `null` instead of snapping back to `fallback` — for optional fields like Size's width/height ("auto"). */
  allowEmpty?: boolean
  /** What an empty/unparsable field resolves to on blur when `allowEmpty` is false AND there's no saved value to restore instead (see NumberInput's doc comment). */
  fallback?: number
  /** This field's value as of the last Save (from useSavedNodeData) — what clearing the field restores, since `value` alone is just the live, possibly-never-saved edit. `undefined` before anything's ever been saved. */
  savedValue?: number | null
}) {
  const [text, setText] = useState(displayValue(value, allowEmpty, fallback))
  const isFocused = useRef(false)

  useEffect(() => {
    if (isFocused.current) return
    setText(displayValue(value, allowEmpty, fallback))
  }, [value, allowEmpty, fallback])

  const clamp = (n: number): number => {
    let out = n
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    return out
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      className={className}
      value={text}
      onFocus={() => {
        isFocused.current = true
      }}
      onChange={(e) => {
        const raw = e.target.value
        // Reject anything that isn't a (possibly partial) signed decimal —
        // keeps stray letters out while still allowing "-", ".", "-." mid-type.
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
        setText(raw)
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
        const parsed = Number(raw)
        if (!Number.isNaN(parsed)) onChange(clamp(parsed))
      }}
      onBlur={() => {
        isFocused.current = false
        // Restore to what was actually Saved for this field, not the
        // generic per-field `fallback` — so clearing a field you'd already
        // saved puts back what you had, not the type's blank-slate default.
        // Only when nothing's ever been saved (a brand-new node/field) does
        // this fall through to `fallback`.
        const restoreTo = savedValue !== null && savedValue !== undefined ? savedValue : fallback
        if (text.trim() === '') {
          if (allowEmpty) {
            onChange(null)
          } else {
            onChange(restoreTo)
            setText(String(restoreTo))
          }
          return
        }
        const parsed = Number(text)
        const resolved = Number.isNaN(parsed) ? restoreTo : clamp(parsed)
        onChange(resolved)
        setText(String(resolved))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}
