import { useLayoutEffect, type RefObject } from 'react'
import gsap from 'gsap'

/** Fades a panel in when its key changes. Skipped entirely under prefers-reduced-motion. */
export function useEntrance(ref: RefObject<HTMLElement | null>, key: string | null) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || key === null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tween = gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.24, ease: 'power2.out' })
    return () => {
      tween.kill()
    }
  }, [ref, key])
}
