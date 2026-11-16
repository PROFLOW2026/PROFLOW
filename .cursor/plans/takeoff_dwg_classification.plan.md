---
name: DWG fixture classification
overview: The takeoff engine already finds the electrical inserts in 1545-all-01.dwg. It cannot name them, because classification is allowed only from a planner library or from a real legend phrase, and this file has neither. The 27 labels it did assign contradict the text beside the symbol. Improve the existing engine and library; do not build a second engine.
todos:
  - id: stop-false-panel-match
    content: Stop stacked prefix matches so a shared word like לוח cannot become לוח ראשי
    status: completed
  - id: legend-must-be-a-legend
    content: Accept a legend row only when the text is a symbol description, not a nearby note
    status: completed
  - id: confirm-once-per-planner
    content: Keep one confirmed block identity per planner, and refuse it when the geometry changed
    status: completed
  - id: geometry-as-guard
    content: Store the existing geometry fingerprint beside a confirmed DWG block and use it only as a guard or a review suggestion
    status: completed
  - id: measure-on-real-files
    content: The 21 blocks in 1545-all-01.dwg are not hand-labeled, so there is no precision/recall gold set. The acceptance check is 1394 unique, no false da3 panel, and library match only for the same planner, block, and shape.
    status: completed
isProject: true
---

# DWG classification — findings and the order to build

Read-only investigation of `1545-all-01.dwg` on 2026-11-16. No engine, UI, SQL, commit, or deploy change.

## What the file actually contains

1,394 electrical inserts were found. They are 21 block definitions. 1,367 have no type. The other 27 were labeled לוח ראשי from a nearby note that reads לוח גנרטור. That label is not evidence of a correct type.

Nothing in the block name, the layer name, attributes, or text inside the block matched the catalog. All 21 shapes are distinct, so geometry cannot copy a type from one block to another inside this file. The organization library was not applied in the local run because no planner entries were supplied; a brand-new planner has the same empty library in production.

## Build order

1. Make the catalog matcher require a distinguishing phrase. This removes the false לוח ראשי. It does not increase coverage on this file.
2. Tighten legend pairing so floor notes and cable notes are not treated as a legend. This file then stays unclassified, which is the honest result.
3. Use the planner library that already exists. One confirmed instance of a block classifies the later files of that same planner only. A correction replaces the saved type. Do not copy the type to another planner.
4. Save the geometry fingerprint that already exists in the DWG engine next to that confirmation. If the same block name later has a different shape, do not auto-apply the old type.
5. Measure on real labeled files. An assignment is a success only when a person agrees. Synthetic tests do not count.

AI stays off the automatic count. The current AI path reads legend crops only, is off unless configured, and this file has no real legend crop to read. Guessing a type from a symbol image was not tested and must not be treated as proven.
