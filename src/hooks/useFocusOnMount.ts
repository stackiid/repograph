import { useEffect, useRef } from 'react'

/**
 * Moves focus to an element when a screen appears after the user pressed a control that is now gone.
 * Without this, keyboard and screen reader focus falls back to the top of the page.
 */
export function useFocusOnMount<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (enabled) ref.current?.focus()
  }, [enabled])
  return ref
}
