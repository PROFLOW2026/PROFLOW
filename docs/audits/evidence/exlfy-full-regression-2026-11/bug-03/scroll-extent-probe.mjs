/**
 * Models PdfJsViewer zoom: CSS transform scale does not grow layout scroll size.
 * Run: node docs/audits/evidence/exlfy-full-regression-2026-11/bug-03/scroll-extent-probe.mjs
 */

const layoutPageWidth = 800;
const layoutPageHeight = 1100;
const zoomFactor = 1; // committed layout zoom
const gestureScale = 2.5; // pinch preview transform

const layoutScrollWidth = layoutPageWidth * zoomFactor;
const layoutScrollHeight = layoutPageHeight * zoomFactor;
const visualWidth = layoutPageWidth * zoomFactor * gestureScale;
const visualHeight = layoutPageHeight * zoomFactor * gestureScale;

const unreachableHorizontalPx = visualWidth - layoutScrollWidth;
const unreachableVerticalPx = visualHeight - layoutScrollHeight;

const result = {
  title: 'BUG-03 scroll extent vs visual transform',
  layoutScrollWidth,
  layoutScrollHeight,
  visualWidth,
  visualHeight,
  unreachableHorizontalPx,
  unreachableVerticalPx,
  verdict:
    unreachableHorizontalPx > 0 || unreachableVerticalPx > 0
      ? 'PROVEN_MODEL: transform preview creates visual pixels outside scrollable layout box'
      : 'OK',
  note: 'Real device Android/iOS still UNVERIFIED; this proves the geometric mismatch in the viewer model.',
};

console.log(JSON.stringify(result, null, 2));
