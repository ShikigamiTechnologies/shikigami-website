const common = {
  schema: "shirabe-intake/v1", mode: "guided", started_at: 1, website: "", name: "Synthetic Analyst",
  company: "Fictional Organization", email: "synthetic@example.test", role: "Operations lead", industry: "Public services",
  company_size: "50–199", problem_category: "mixed", frequency: "daily", monthly_volume: 20,
  claimed_loss_amount: 0, loss_currency: "USD", loss_basis: "unknown", integrity_concern: "none",
  workforce_constraint: "adequate", evidence_conflict: "no", disruption: "none", sensitivity: "none", consent: true,
};

export const comparativeCases = [
  {
    id: "CASE-A-CLEAN-LOG", title: "Clean structured approval log", language: "en",
    payload: { ...common, language: "en", problem: "A clean synthetic event log shows approval cases with measurable waiting time before final disposition.", last_example: "Case A-003 waited between review and approval.", trigger: "A request is received.", participants: "Requester and approver.", tools: "Structured case system.", source_of_truth: "Synthetic event log.", failure_point: "The approval queue contains a measurable waiting interval.", consequence: "Cycle time is longer for one synthetic variant.", evidence_available: "Complete synthetic identifiers, activities, timestamps, and source-row identifiers.", desired_outcome: "Measure variants and approval cycle time.", attempts: "No prior intervention.", constraints: "Synthetic benchmark only." },
    sources: ["A-LOG-001"], conflicts: [], expected_events: 12,
    event_rows: [
      ["A-001","received","2026-01-01T09:00:00Z","A-01"],["A-001","reviewed","2026-01-01T10:00:00Z","A-02"],["A-001","approved","2026-01-01T11:00:00Z","A-03"],
      ["A-002","received","2026-01-02T09:00:00Z","A-04"],["A-002","reviewed","2026-01-02T10:00:00Z","A-05"],["A-002","returned","2026-01-02T11:00:00Z","A-06"],["A-002","reviewed","2026-01-02T13:00:00Z","A-07"],["A-002","approved","2026-01-02T14:00:00Z","A-08"],
      ["A-003","received","2026-01-03T09:00:00Z","A-09"],["A-003","reviewed","2026-01-03T10:00:00Z","A-10"],["A-003","approved","2026-01-03T17:00:00Z","A-11"],
      ["A-004","received","2026-01-04T09:00:00Z","A-12"],
    ],
  },
  {
    id: "CASE-B-FRAGMENTED", title: "Fragmented evidence with conflicting timestamps", language: "en",
    payload: { ...common, language: "en", evidence_conflict: "yes", problem: "Email, PDF, spreadsheet, and interview evidence describe the same synthetic handoff with conflicting timestamps.", last_example: "The spreadsheet records approval before the email request was sent.", trigger: "A request arrives by email.", participants: "Requester, coordinator, and approver.", tools: "Email, PDF, spreadsheet, and interview notes.", source_of_truth: "No agreed source of truth.", failure_point: "Ownership and event order conflict across the four synthetic sources.", consequence: "The organization cannot establish a trustworthy cycle time.", evidence_available: "Four synthetic sources with partial identifiers and one timestamp conflict.", desired_outcome: "Preserve the conflict and identify what must be verified.", attempts: "A spreadsheet was added without reconciliation rules.", constraints: "No connector or production access." },
    sources: ["B-EMAIL-001","B-PDF-001","B-SHEET-001","B-INTERVIEW-001"], conflicts: [{ id: "B-CONFLICT-01", sources: ["B-EMAIL-001","B-SHEET-001"] }], expected_events: 8,
    event_rows: [
      ["B-001","requested","2026-02-01T10:00:00Z","B-EMAIL-ROW-1"],["B-001","approved","2026-02-01T09:30:00Z","B-SHEET-ROW-1"],
      ["B-002","requested","2026-02-02T10:00:00Z","B-EMAIL-ROW-2"],["B-002","approved","2026-02-02T12:00:00Z","B-SHEET-ROW-2"],
      ["B-003","requested","2026-02-03T10:00:00Z","B-EMAIL-ROW-3"],
      [null,"verbal approval",null,"B-INTERVIEW-ROW-1"],["B-004",null,"2026-02-04T10:00:00Z","B-PDF-ROW-1"],[null,null,null,"B-PDF-ROW-2"],
    ],
  },
  {
    id: "CASE-C-BILINGUAL-RESTRICTED", title: "Bilingual fragmented evidence and restricted-data boundary", language: "es",
    payload: { ...common, language: "es", evidence_conflict: "yes", sensitivity: "regulated", workforce_constraint: "understaffed", problem: "Correos, entrevistas bilingües y documentos restringidos describen un traspaso ficticio sin dueño confirmado.", last_example: "La entrevista corregida contradice la hora indicada en el correo sintético.", trigger: "Se recibe una solicitud bilingüe.", participants: "Solicitante, coordinador y revisor sin dueño confirmado.", tools: "Correo y notas de entrevista; el documento restringido fue rechazado.", source_of_truth: "No existe una fuente autorizada única.", failure_point: "Faltan propiedad confirmada, secuencia completa y acceso permitido a una fuente.", consequence: "No se puede sostener una conclusión causal ni un tiempo de ciclo completo.", evidence_available: "Dos fuentes admitidas, una corrección y una fuente restringida rechazada.", desired_outcome: "Separar hechos, correcciones, conflicto y datos no disponibles.", attempts: "Se corrigió una entrevista sin borrar la versión anterior.", constraints: "Sin cargar datos restringidos ni otorgar credenciales." },
    sources: ["C-EMAIL-001","C-INTERVIEW-V1","C-INTERVIEW-V2","C-RESTRICTED-REJECTED"], rejected_sources: ["C-RESTRICTED-REJECTED"], conflicts: [{ id: "C-CONFLICT-01", sources: ["C-EMAIL-001","C-INTERVIEW-V2"] }], corrections: [{ from: "C-INTERVIEW-V1", to: "C-INTERVIEW-V2" }], expected_events: 0, event_rows: [],
  },
];
