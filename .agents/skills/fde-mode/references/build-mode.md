# Build Mode

**Triggered by:** after plan approval; or directly for clear, scoped implement tasks

**Output:** `.audits/[filename]_audit.md` on completion or commit

---

## Workflow

### 1. Announce start

State:
- What you're building
- Expected milestones (e.g., "4 steps: schema → API → UI → smoke test")
- Which audit file you're tracking in `.audits/`

Open the audit early — fill Sections 1–2 immediately.

### 2. Execute with milestone check-ins

After each meaningful step:

> *"Step [N] of [M] done — [what was done]. Moving to [next step]. Any issues before I continue?"*

Update audit Section 6 for significant decisions as they happen.

### 3. Gate on scope shift or doc gaps

If during build:
- Scope expands beyond original discussion
- Required decision isn't in user docs
- Approach switch or new architecture
- File modify/delete on existing assets

→ Stop and gate per [approval-gate-protocol.md](approval-gate-protocol.md).

### 4. Complete or commit

On task completion:
- Finalize audit Sections 7–11
- Deliver primary artifact (code, doc, etc.) — audit is companion, not replacement

---

## Verbosity during build

| Mode | Behavior |
|------|----------|
| **verbose** | Flag ambiguities one per turn; gate at significant forks |
| **lean** | Infer from context; log in Section 3; ask only when blocking |

Both modes: full audit with inferences documented.

---

## Session commits

Trigger when any of:

1. **Context pressure** — approaching reliable tracking limits  
   - Warn user: quality may degrade; recommend checkpoint  
2. **Milestone** — logical chapter complete (all routes done, scaffolding finished, first working version)  
3. **User request** — "save progress", "commit this", "checkpoint", "let's checkpoint"

### On commit

1. Finalize current audit (Sections 7–11)
2. Close file in `.audits/`
3. If session-wide handoff needed: write `.audits/session_YYYY-MM-DD_[slug]_audit.md`
4. Announce:

> *"I've committed the audit for this phase to `.audits/`. Here's where we are and what's next..."*

5. Open fresh tracking for next phase (new audit or increment `Audit Version`)

---

## Commit Mode (manual trigger)

Same as session commit above. Also used when user explicitly ends a work chapter without finishing the full task.

Steps:
1. Finalize and close current open audit
2. Write session-level summary audit if multi-task session
3. Hand off: completed / in progress / blocked / next session priorities

---

## Checklist

```
Build Mode:
- [ ] Start announced with milestones
- [ ] Audit opened in .audits/
- [ ] Milestone check-ins during execution
- [ ] Gates on scope shift / doc gaps / file changes
- [ ] Sections 5–6 updated during work
- [ ] Sections 7–11 finalized on complete or commit
```

---

## Direct-to-build (no plan)

Allowed only when:
- Task is clearly scoped
- User docs cover the approach
- Single artifact or small change

Still create audit. If complexity emerges mid-build → pause and run Plan Mode subset (surface options + gate).
