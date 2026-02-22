# Odesa Barrier-Free Map — Objective Gap Plan (v1)

## 0) Current baseline (fact)
- Core flows already exist: auth, points CRUD, routes CRUD, news CRUD, map filters, Supabase mode, point photos.
- New capability exists: point detailed sections with photos.
- Build status: passes (`vite build`).

## 1) Critical gaps (must close first)

### 1.1 UX clarity for non-technical specialists
Problem:
- Users often do not understand whether an action succeeded, failed, or is still running.
- Mode switching is not explicit enough (what exactly can be done in current mode).

Impact:
- Operational errors, duplicate actions, frustration, support load.

Required outcome:
- Every action gives explicit visual feedback (loading/success/error).
- Active mode has a clear plain-language instruction block.

Acceptance criteria:
- After any create/update/delete action, user sees clear status and result.
- When changing mode, UI explains allowed actions in 1-2 sentences.

### 1.2 Data integrity for point media content
Problem:
- Main photo + section photos are possible, but cleanup/consistency can break if policies are missing.

Impact:
- Broken images, storage garbage, inconsistent cards.

Required outcome:
- Predictable create/update/delete behavior for all point media.

Acceptance criteria:
- No orphan media in normal edit/delete flows.
- Graceful fallback when Supabase section table is not yet migrated.

### 1.3 Operational safety and rollout control
Problem:
- Changes are mostly manual; no formal release checklist for SQL policies/migrations.

Impact:
- “Works locally, breaks in production” risk.

Required outcome:
- One clear deployment checklist for SQL + env + smoke tests.

Acceptance criteria:
- Repeatable rollout script/checklist in repo.

## 2) High-priority gaps (next wave)

### 2.1 Role model and permissions hardening
- Separate capabilities by role in UI and backend responses.
- Add admin-only controls for irreversible operations.

### 2.2 Route quality workflow
- Add route validation: minimum points, duplicate-point warnings, broken-point detection.
- Add publish gate with visible checklist.

### 2.3 News module maturity
- Add image support + publication states (`draft/published`).
- Add sorting/filtering and pinned announcements.

### 2.4 Discoverability and navigation
- Improve map-level search semantics (district/community/point unified search).
- Add direct jump and visible “you are here” context in filters.

## 3) Medium-term product gaps

### 3.1 Accessibility and performance
- Keyboard navigation, focus states, contrast audit, reduced-motion mode.
- Image optimization strategy and lazy loading for card media.

### 3.2 Observability and supportability
- Client error logging, structured server logs, request tracing IDs.
- Basic analytics for key specialist actions.

### 3.3 Data governance
- Soft-delete/audit trail for critical objects (points/routes/news).
- Restore workflow for accidental deletions.

## 4) Engineering and QA gaps

### 4.1 Automated tests
- API integration tests for points/routes/news permissions.
- UI smoke tests for specialist critical flows.

### 4.2 Contract stability
- Define API contracts for all CRUD payloads (including point sections).
- Add schema validation layer.

### 4.3 Release confidence
- Add pre-release smoke script:
  - login
  - create/edit/delete point
  - upload/remove photos
  - create/edit/delete route
  - create/edit/delete news

## 5) Objective readiness score (now)
- Product completeness: 7.8/10
- UX readiness for field specialists: 7.1/10
- Data and backend reliability: 8.0/10
- Security/ops maturity: 6.9/10
- Release confidence: 6.8/10

## 6) Execution order
1. UX clarity + explicit status feedback (immediate).
2. Deployment checklist + SQL/runtime sanity checks.
3. Role hardening + route validation gates.
4. News publication workflow.
5. Tests + observability baseline.

## 7) “Done means done” for next milestone
- Specialist can complete full shift workflow without instruction:
  - login
  - create/edit/delete point with photos and sections
  - create/edit/delete route
  - create/edit/delete news
- Every destructive action has confirmation and explicit outcome state.
- Supabase rollout documented and reproducible end-to-end.
