/** Button id to the code tree it must load. The button labels stay גרסה 1 / 2 / 3. */
export const CAD_VIEWER_TREES = {
  v1: 'pf-cad-v3',
  v2: 'pf-cad',
  v3: 'pf-cad-v1',
} as const;

export type CadViewerButton = keyof typeof CAD_VIEWER_TREES;

export function cadViewerTree(button: CadViewerButton): (typeof CAD_VIEWER_TREES)[CadViewerButton] {
  return CAD_VIEWER_TREES[button];
}
