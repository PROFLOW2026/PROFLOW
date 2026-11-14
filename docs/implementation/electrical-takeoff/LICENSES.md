# Electrical takeoff — license inventory (runtime)

Verified from package metadata / upstream licenses (Nov 2026). **PyMuPDF (AGPL) is forbidden in runtime.**

| Component | License | Use | SaaS verdict |
|-----------|---------|-----|--------------|
| fastapi | MIT | Worker HTTP | OK |
| uvicorn | BSD-3 | Worker server | OK |
| pydantic | MIT | Worker models | OK |
| numpy | BSD-3 | Worker numeric | OK |
| opencv-python-headless | Apache-2.0 | Worker image ops | OK |
| pypdfium2 / pdfium | Apache-2.0 / BSD | PDF render | OK |
| ezdxf | MIT | DXF parse | OK |
| reportlab | BSD-3 | PDF export | OK |
| pypdf | BSD-3 | PDF utilities | OK |
| LibreDWG `dwg2dxf` | GPL-3.0 | **External CLI only** (aggregate) | OK if not linked |
| PyMuPDF | AGPL-3.0 | **Not in requirements.txt** | **Forbidden runtime** |
| zod (npm) | MIT | App contracts | OK |

Fonts in exports: use OFL fonts only (Agent 1 export).