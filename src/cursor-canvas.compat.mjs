import * as shim from "@thisismydesign/cursor-canvas-web";

// Re-export the full reference shim surface so canvases written against the
// real `cursor/canvas` SDK keep working.
export * from "@thisismydesign/cursor-canvas-web";

/**
 * The reference shim's `CanvasHostTheme` does not carry a `category` group,
 * while canvases written for the real Cursor SDK read tokens such as
 * `theme.category.yellow`. Map `category` to the shim's shared 7-hue
 * `colorPalette` so those canvases render without changes.
 */
export function useHostTheme() {
  const theme = shim.useHostTheme();
  const compat = {
    ...theme,
    kinds: theme.kind,
    category: shim.colorPalette,
  };
  return compat;
}
