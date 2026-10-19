# Accessibility

Target: WCAG 2.2 AA for the start page, report screen, and workspace.

## Checked automatically

| Check | How | Where |
| --- | --- | --- |
| Color contrast of text and accent colors against surfaces (at least 4.5:1) | Calculated from `tokens.css` | `src/test/tokens.test.ts` |
| No purple-family hues in the palette | Hue check on every token | `src/test/tokens.test.ts` |
| Roles, names, labels, list and description-list structure, landmarks | `axe-core` on rendered components | component tests (`*.test.tsx`) |
| Keyboard operation of the file tree, save panel, shortcuts, and path and cycle controls | Real key events through Testing Library | component tests |
| Escape order: drawer, then path or cycle, then selection | Workspace test | `Workspace.test.tsx` |
| Focus moves to the heading on screen changes, into the save panel when it opens, and back to its trigger on Escape | Component tests | various |
| Hostile source text renders as inert text | Source preview test | `explorer.test.tsx` |
| Export menu: arrow, Home, End, Escape, Tab, click-away, focus return, busy state, announced result, axe in three states | Component tests | `export-ui.test.tsx` |

Real bugs found by these checks and fixed: a malformed description list on the report screen, and a save panel that could not be dismissed from the keyboard.

## Design choices that support access

- Relationship and state are never carried by color alone: edge type uses line style (solid, dashed, dotted) and labels, and node state uses text chips such as "in a cycle" and "imported by selection".
- A file list in the sidebar is a keyboard and screen reader alternative to the canvas.
- Animation is skipped under `prefers-reduced-motion`.
- Closed drawers use `inert`, so they are not in the tab order.
- Status changes use polite live regions.

## Needs a human in a real browser

These cannot be verified in jsdom, and none has been done yet:

- [ ] Visible focus ring on every control, in every state, on a dark background.
- [ ] Contrast in the browser (the Playwright suite runs axe with contrast, but has not been run).
- [ ] Keyboard-only walk through: import, report, workspace, select, path, export, save, delete.
- [ ] Export menu with a screen reader: the result message is announced and focus returns to the Export button.
- [ ] Tab order through the workspace, and whether canvas nodes are reachable and operable with Enter.
- [ ] Screen reader pass (NVDA or VoiceOver) on the workspace and the save panel.
- [ ] Mobile layouts at 360 px and 390 px: drawers, banners, touch target size, no horizontal scroll.
- [ ] 200% zoom and 400% reflow.
- [ ] Windows High Contrast / forced colors.
