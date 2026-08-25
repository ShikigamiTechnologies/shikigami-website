ALTER TABLE shirabe_intakes ADD COLUMN claimed_loss_minor INTEGER NOT NULL DEFAULT 0 CHECK (claimed_loss_minor >= 0);
ALTER TABLE shirabe_intakes ADD COLUMN loss_currency TEXT NOT NULL DEFAULT 'USD' CHECK (loss_currency = 'USD');
ALTER TABLE shirabe_intakes ADD COLUMN loss_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (loss_basis IN ('measured','estimated','reported','unknown'));
ALTER TABLE shirabe_intakes ADD COLUMN integrity_concern TEXT NOT NULL DEFAULT 'none' CHECK (integrity_concern IN ('none','unexplained_discrepancy','allegation','internal_investigation','external_investigation','unknown'));
ALTER TABLE shirabe_intakes ADD COLUMN workforce_constraint TEXT NOT NULL DEFAULT 'unknown' CHECK (workforce_constraint IN ('adequate','understaffed','contractor_dependency','unknown'));
ALTER TABLE shirabe_intakes ADD COLUMN evidence_conflict TEXT NOT NULL DEFAULT 'unknown' CHECK (evidence_conflict IN ('yes','no','unknown'));
ALTER TABLE shirabe_intakes ADD COLUMN disruption TEXT NOT NULL DEFAULT 'unknown' CHECK (disruption IN ('none','vendor_outage','cyber_outage','natural_disaster','labor_disruption','other','unknown'));

CREATE TABLE shirabe_routing_queue_v2 (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES shirabe_intakes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  routing_tier TEXT NOT NULL CHECK (routing_tier IN ('clarification_required','qualified_review','high_risk_governed_review')),
  status TEXT NOT NULL CHECK (status IN ('pending','claimed','completed','failed')),
  payload_hash TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT,
  error TEXT,
  UNIQUE(intake_id)
);
INSERT INTO shirabe_routing_queue_v2 SELECT * FROM shirabe_routing_queue;
DROP TABLE shirabe_routing_queue;
ALTER TABLE shirabe_routing_queue_v2 RENAME TO shirabe_routing_queue;
