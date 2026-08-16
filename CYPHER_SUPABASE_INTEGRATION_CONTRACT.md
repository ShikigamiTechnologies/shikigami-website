# Cypher Supabase integration contract

Frozen source commit: `407aa2186cc4e2fefc31b4bb248ae20e2bb50d7c`

- Supabase Postgres, Auth, and private Storage are the only mutable product authority.
- D1 and R2 are read-only migration sources during a bounded cutover rehearsal.
- Dual writes and legacy mutation retries are prohibited.
- Every imported record and object must retain its source identifier and SHA-256 receipt.
- Cross-tenant reads and writes must fail through public user APIs without service-role access.
- Source changes, remote migrations, secrets, customer data, pushes, merges, and deployments require a new exact owner approval.
