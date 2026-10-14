# E2E skip registry (O06)

Playwright specs that use `test.skip`, `describe.skip`, or `skipIf` are intentional until EB-8 harness coverage expands.

| Spec | Reason |
| --- | --- |
| `tests/e2e/authenticated/hebrew-runtime-closure.spec.ts` | Full Hebrew runtime closure; manual wave |
| `tests/e2e/authenticated/billing-plan.spec.ts` | Live billing fixtures |
| `tests/e2e/authenticated/capture-marketing-screenshots.spec.ts` | Marketing only |
| `tests/e2e/shell.spec.ts` | Environment-specific shell |
| `tests/e2e/regression/homepage-public.spec.ts` | Public marketing regression |
| `tests/e2e/regression/legal-public-routes.spec.ts` | Public legal routes |
| `tests/e2e/regression/overflow-public.spec.ts` | Layout overflow probe |
| `tests/e2e/regression/seo-public-runtime.spec.ts` | SEO runtime |
| `tests/e2e/regression/marketing-locales-public.spec.ts` | Locale marketing |
| `tests/e2e/dg-tender-to-claim.spec.ts` | K04 tender→claim chain; EB-8 seed |

CI runs unit + integration gates; Playwright remains manual per `.github/workflows/ci.yml`.
