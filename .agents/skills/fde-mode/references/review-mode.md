# Review Mode

**Triggered by:** review, audit, check this, what's wrong with, evaluate

**Philosophy:** Post-deployment FDE — verify the work fits the user's real workflow, not just the spec.

**Output:** `.audits/[filename]_review_audit.md` using [audit-template.md](audit-template.md)

---

## Workflow

### 1. Read existing files

- Read the target artifact(s) and surrounding context (imports, callers, related configs)
- Consult user docs for intended behavior and constraints
- Record consulted files in audit Section 2

### 2. Produce structured findings

Organize by severity. Each finding includes:
- **What** — specific issue or observation
- **Where** — file/line or component
- **Why it matters** — impact on correctness, security, adoption, or maintainability
- **Suggestion** — optional fix direction (not a full rewrite unless asked)

### 3. Gate before rewrites

- Surface findings first
- Do **not** apply fixes without approval
- If fixes are warranted, gate per [approval-gate-protocol.md](approval-gate-protocol.md):

> *"I found [N] issues — [summary]. Want me to fix [subset], or walk through them one at a time?"*

### 4. Write review audit

Map findings into audit:
- Section 7: findings summary by severity
- Section 6: any decisions about what to fix vs defer
- Section 9: risks if left unaddressed
- Section 11: recommended next steps

Filename: `.audits/[filename]_review_audit.md`

---

## Severity framework

| Severity | Definition | Examples |
|----------|------------|----------|
| **Critical** | Blocks correctness, security, or data integrity; fix before use | Auth bypass, data loss, crash in core path |
| **Major** | Significant bug or mismatch with stated requirements | Wrong behavior for primary flow, broken integration |
| **Minor** | Bug or smell with workaround or limited blast radius | Edge case failure, inconsistent naming |
| **Suggestion** | Improvement, not a defect | Readability, performance optimization, DRY |

Order findings: Critical → Major → Minor → Suggestion.

---

## Review focus areas

Check against user's **actual** environment:

- Does it match existing patterns in the codebase?
- Does it work for the user's stated workflow?
- Are doc gaps creating hidden assumptions?
- Adoption: would a teammate understand and maintain this?

Avoid generic lint-style noise unless it maps to a real risk.

---

## Verbosity during review

| Mode | Behavior |
|------|----------|
| **verbose** | Ask when intent is unclear before classifying severity |
| **lean** | Infer intent from docs; flag assumptions in Section 3 |

---

## Checklist

```
Review Mode:
- [ ] Target files and context read
- [ ] Findings with severity (Critical / Major / Minor / Suggestion)
- [ ] Findings presented before any edits
- [ ] Gate before rewrites
- [ ] [filename]_review_audit.md in .audits/
```
