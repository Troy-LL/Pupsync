# Audit Document Template

Curated decision record — a teammate who wasn't in the room reads this in under 3 minutes. Not a log dump.

**Location:** `.audits/` at project root  
**Naming:** `[output-filename]_audit.md` | `[task-slug]_plan_audit.md` | `[filename]_review_audit.md` | `session_YYYY-MM-DD_[slug]_audit.md`

---

## Template

Copy and fill. Delete guidance lines in brackets when writing the real audit.

```markdown
# Audit: [Task Name]
**Date:** YYYY-MM-DD
**Session Phase:** [Plan / Build / Review / Commit]
**Verbosity Mode:** [verbose / lean]
**Audit Version:** [1 — increment on re-open]

---

## 1. Mission Brief

[One paragraph: what was asked and what problem this solves for the user.]

## 2. Environment & Constraints

- **Consulted:** [files/docs read]
- **Not available:** [gaps — assumed or gated]
- **Constraints:** [stack, conventions, scope, timeline]

## 3. Clarifications & Assumptions

| Item | Resolution | How |
|------|------------|-----|
| [Ambiguity] | [How resolved] | [Asked / Inferred from doc — cite file / Assumed — reason] |

## 4. Approaches Considered

| # | Approach | Pros | Cons | Selected |
|---|----------|------|------|----------|
| A | [description] | [pros] | [cons] | ✅ |
| B | [description] | [pros] | [cons] | ❌ — [reason] |

## 5. Approval Gates Triggered

1. **Gate:** [What required approval]
   **User decision:** [What they chose / said]
   **Effect:** [What changed as a result]

## 6. Key Decisions

1. **Decision:** [Used X over Y]
   **Why:** [reasoning]
   **Tradeoff accepted:** [what was given up]
   **Covered by docs?** [Yes — ref: filename.md / No — user approved explicitly]

## 7. What Was Built / Changed

[High-level summary: files created/modified, structure, key logic. Not a line-by-line diff.]

## 8. What Was Left Out (Intentionally)

[Scope boundaries — what wasn't done and why.]

## 9. Risks & Open Questions

[Things that could go wrong, unhandled edge cases, decisions still needed.]

## 10. Feedback Loop — Patterns to Generalize

[Recurring patterns worth reusing or standardizing in this project.]

## 11. Next Steps

[Concrete, prioritized actions for next session or phase.]
```

---

## Section guidance

| Section | When to write | Notes |
|---------|---------------|-------|
| 1. Mission Brief | Open audit | Restate the real problem, not just the literal ask |
| 2. Environment | Open audit | List what you read; explicit gaps matter |
| 3. Clarifications | During plan/build | Every inference in lean mode gets a row |
| 4. Approaches | Plan phase | Minimum 2 options; mark selected and rejected |
| 5. Gates | As gates fire | One entry per gate — proposal + decision + effect |
| 6. Key Decisions | During execution | Meaningful forks only, not every line of code |
| 7. Built / Changed | On complete or commit | Summary level |
| 8. Left Out | On complete or commit | Intentional scope boundaries |
| 9. Risks | On complete or commit | Honest; include edge cases |
| 10. Feedback Loop | On complete or commit | FDE insight capture — reusable patterns |
| 11. Next Steps | On complete or commit | Actionable, ordered |

## Phase-specific focus

- **Plan audit:** Sections 1–4 and 5 (if gated) are primary; 7–8 may be "planned, not built"
- **Build audit:** Sections 5–7 heavy; keep 3 updated for late clarifications
- **Review audit:** Section 7 = findings summary; use severity labels from review-mode.md
- **Commit audit:** All sections; emphasize 7, 9, 10, 11 as handoff for next session

## Quality bar

- Under 3 minutes to read
- A stranger understands *why*, not just *what*
- No raw tool output or conversation paste
- `Audit Version` increments when reopening the same task in a new session
