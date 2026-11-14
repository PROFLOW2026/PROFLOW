# BUG-03 — PdfJsViewer consumer map

All paths use `StorageFilePreviewShell` unless noted.

| Module | Component | PDF URL source | `pageOverlay` |
|--------|-----------|----------------|---------------|
| `external-storage/ui/storage-file-preview-dialog.tsx` | `StorageFilePreviewDialog` | Scoped browser download URL | No |
| `external-storage/ui/authorized-file-preview-dialog.tsx` | `AuthorizedFilePreviewDialog` | `file.contentUrl` (revision stream) | No |
| `project-plans/ui/drawing-revision-pdf-workspace.tsx` | `DrawingRevisionPdfWorkspace` | `INTERNAL_REVISION_DOWNLOAD_PATH` | Yes (sheet marks) |
| `project-plans/ui/drawing-revision-compare-dialog.tsx` | `DrawingRevisionCompareDialog` | Compare URL | No |
| `documents/ui/document-preview-dialog.tsx` | Document preview | Document stream | No |
| `invoicing-integration/ui/external-statutory-panel.tsx` | Statutory PDF | Authorized URL | No |

Contractor portal wiring:

- `contractor-portal/ui/portal-drawing-detail.tsx` opens `AuthorizedFilePreviewDialog` with `EXTERNAL_REVISION_DOWNLOAD_PATH` — same `PdfJsViewer` stack.

Employee / main app storage browsers use `StorageFilePreviewDialog` directly.

**Conclusion:** Bug-03 is not specific to “cloud storage linked” vs “project plans module”; both are thin shells around the same viewer.
