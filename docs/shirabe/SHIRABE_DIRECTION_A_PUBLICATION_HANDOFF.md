# SHIRABE Direction A - Evidence Cartography

Status: Owner approved production integration, merge, deployment, benchmark PDF publication, and governed intake activation
Selection date: 2026-08-25
Visual approval date: 2026-08-25
Publication, merge, and deployment approval date: 2026-08-25

## Placement

SHIRABE is a bilingual diagnostic service. It must remain separate from commercial software products, research systems, and Foundry/M.A.G.I. internal infrastructure.

## Visual concept

Direction A extends the approved Shikigami dark editorial system with a restrained trace-cyan accent. Fragmented evidence enters as separately classified records, becomes a reconstructed workflow, retains conflicts and unknowns, and reaches a visible named-human approval gate.

Avoid chatbot imagery, autonomous-authority imagery, fake operational dashboards, fraud imagery, unverified customer data, and decorative metrics.

## Routes

- `/services/shirabe/`
- `/es/servicios/shirabe/`
- `/research/shirabe-process-diagnostic-comparison/`
- `/es/investigacion/comparacion-diagnostico-procesos-shirabe/`
- `/evidence/shirabe-synthetic-benchmark/`
- `/es/evidencia/benchmark-sintetico-shirabe/`

## Responsive behavior

- Desktop: two-column hero with evidence cartography visualization.
- Tablet: stacked hero; cards reduce to two columns.
- Mobile: single-column content and evidence cards; tables remain semantic and scroll within a labeled container.
- Minimum supported content width: 320 CSS px without page-level horizontal overflow.

## Motion

Only evidence relationship lines pulse. Motion does not delay or obscure reading. Under `prefers-reduced-motion: reduce`, all trace animation stops and content remains visible.

## Intake

The public service pages route customers to the established governed SHIRABE intake at `/shirabe`, which preserves the production `POST /api/shirabe-intake` contract. Public intake does not accept files, credentials, CUI, customer or resident records, health, banking, tax, or other sensitive data.

## Evidence and copy boundaries

- Public maturity: `CONTROLLED DIAGNOSTIC SERVICE · DESIGN-PARTNER INTAKE`.
- Results must say `synthetic internal validation`.
- The 98.4 value is an internal mean rubric score, not real-world accuracy.
- Reported losses remain unverified self-report.
- SHIRABE does not infer fraud, guilt, misconduct, or causation.
- Competitor statements retain sources, retrieval date, non-equivalence disclosure, trademarks, and quarterly revalidation.
- The approved synthetic benchmark PDF is published with an HTML accessible equivalent and an explicit disclosure that the PDF is not tagged/PDF-UA.
- The prospect ledger and artifact hashes remain internal.

## Approval gates

1. Owner reviews desktop, tablet, and mobile renders. **Completed: Ricardo visually approved Direction A on 2026-08-25.**
2. Owner confirms the exact public copy, Spanish publication, PDF publication, governed intake activation, merge, and deployment. **Completed: 2026-08-25.**
3. Production repository and intake contract are inspected. **Completed: the existing `/api/shirabe-intake` contract is preserved.**
4. Comparative sources and prices retain their 2026-08-25 retrieval date and quarterly revalidation requirement. **Completed for this publication.**
5. Accessibility, performance, structured data, crawlability, link, and sensitive-path checks pass. **Pre-deployment checks completed; sensitive-path checks repeat after deployment.**

## Current stop state

Direction A has exact owner approval for production integration, merge, deployment, benchmark PDF publication, and use of the existing governed SHIRABE intake. Final closure requires post-deployment live verification.
