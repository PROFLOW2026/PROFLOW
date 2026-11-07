import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_SCALE,
  IDENTITY_VIEW,
  MAX_VIEW_SCALE,
  clampView,
  panView,
  zoomView,
} from '@/modules/infra-mapping/ui/live-share-view';
import { LIVE_SHARE_TEXT, liveBadgeText } from '@/modules/infra-mapping/ui/live-share-texts';

const W = 390;
const H = 844;

describe('viewer zoom (display only, on the watching phone)', () => {
  it('does not pan while not zoomed', () => {
    expect(panView(IDENTITY_VIEW, 50, 50, W, H)).toBe(IDENTITY_VIEW);
  });

  it('zooms about a point and keeps that point in place', () => {
    const pivot = { x: 100, y: -200 }; // relative to the stage centre
    const zoomed = zoomView(IDENTITY_VIEW, 2, pivot, { x: 0, y: 0 }, W, H);
    expect(zoomed.scale).toBeCloseTo(2, 9);
    // picture point under the pivot before = pivot; after: translate + scale * point
    const after = { x: zoomed.x + zoomed.scale * pivot.x, y: zoomed.y + zoomed.scale * pivot.y };
    expect(after.x).toBeCloseTo(pivot.x, 6);
    expect(after.y).toBeCloseTo(pivot.y, 6);
  });

  it('never zooms out past the original picture nor in beyond the limit', () => {
    expect(zoomView(IDENTITY_VIEW, 0.2, { x: 0, y: 0 }, { x: 0, y: 0 }, W, H)).toEqual(IDENTITY_VIEW);
    expect(zoomView(IDENTITY_VIEW, 100, { x: 0, y: 0 }, { x: 0, y: 0 }, W, H).scale).toBe(MAX_VIEW_SCALE);
  });

  it('keeps the picture covering the stage while panning', () => {
    const zoomed = zoomView(IDENTITY_VIEW, DOUBLE_TAP_SCALE, { x: 0, y: 0 }, { x: 0, y: 0 }, W, H);
    const dragged = panView(zoomed, 10_000, -10_000, W, H);
    expect(dragged.x).toBeCloseTo(((DOUBLE_TAP_SCALE - 1) * W) / 2, 9);
    expect(dragged.y).toBeCloseTo((-(DOUBLE_TAP_SCALE - 1) * H) / 2, 9);
    expect(clampView({ scale: 1, x: 80, y: 80 }, W, H)).toEqual(IDENTITY_VIEW);
  });
});

describe('broadcaster chip also reports a dropped viewer', () => {
  it('keeps the existing wording and adds the dropped state', () => {
    expect(liveBadgeText(true)).toBe(LIVE_SHARE_TEXT.liveBadgeViewer);
    expect(liveBadgeText(false)).toBe(LIVE_SHARE_TEXT.liveBadgeWaiting);
    expect(liveBadgeText(false, true)).toBe(LIVE_SHARE_TEXT.liveBadgeViewerLeft);
    expect(liveBadgeText(true, true)).toBe(LIVE_SHARE_TEXT.liveBadgeViewer);
  });
});
