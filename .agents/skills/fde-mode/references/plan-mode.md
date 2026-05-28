# Plan Mode

**Triggered by:** plan, design, think through, make a plan for, help me figure out

**Philosophy:** Observe the environment before you build in it. Do not skip Plan Mode for complex or multi-step work — even when confident.

**Output:** `.audits/[task-slug]_plan_audit.md` using [audit-template.md](audit-template.md)

---

## Workflow

### 1. Read the environment

- Scan the user's project folder for relevant docs, configs, and code
- Note what exists vs what is missing
- Record consulted files in audit Section 2

### 2. Surface known / unknown / assumed

Present clearly:

- **Known** — facts from docs or codebase
- **Unknown** — gaps that affect the approach
- **Assumed** — working hypotheses (flag for lean; ask in verbose)

### 3. Present 2–3 approaches with tradeoffs

Not just your preferred option. For each:

- What it does
- Pros and cons
- Fit with user's constraints

Mark your recommendation and why — user still chooses.

### 4. Clarifying questions (verbosity-dependent)

| Mode | Behavior |
|------|----------|
| **verbose** | One highest-impact question per turn until blocking ambiguities are resolved |
| **lean** | Ask only when ambiguity is unbridgeable from available context |

Rank questions by impact — not volume.

Good first questions:
- "What does success look like for this?"
- "What's the constraint that matters most — time, compatibility, or simplicity?"
- "Is [X] in scope or explicitly out?"

### 5. Approval gate before execution

Before any build or file changes, gate per [approval-gate-protocol.md](approval-gate-protocol.md).

Plan Mode ends when the user approves direction — then transition to Build Mode.

### 6. Write plan audit

Create `.audits/[task-slug]_plan_audit.md` with:
- Sections 1–4 complete
- Section 5 if gates fired
- Sections 9–11 with feasibility risks and proposed next steps
- Section 7 may describe *planned* work, not built work yet

---

## Question strategy

**One per turn in verbose.** Do not batch five questions.

Priority order:
1. Success criteria / real problem
2. Hard constraints (stack, deadline, must-not-break)
3. Scope boundaries (in / out)
4. Preference between materially different architectures
5. Nice-to-haves (only if still blocking)

**In lean:** resolve items 1–3 from docs when possible; log in Section 3 as "Inferred from [file]".

---

## Transition to Build Mode

After gate approval:
1. Announce transition: milestones expected
2. Open or continue build audit (may reference plan audit)
3. Follow [build-mode.md](build-mode.md)

Do not start file edits in Plan Mode except creating the audit file and reading existing files.

---

## Checklist

```
Plan Mode:
- [ ] Relevant docs and code read
- [ ] Known / unknown / assumed surfaced
- [ ] 2–3 approaches with tradeoffs presented
- [ ] Clarifications resolved per verbosity mode
- [ ] Approval gate passed
- [ ] [task-slug]_plan_audit.md written to .audits/
```
