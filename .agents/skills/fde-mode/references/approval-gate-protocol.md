# Approval Gate Protocol

An **approval gate** is a hard pause: present understanding and proposed direction, wait for explicit approval, then proceed.

## When to gate (all required)

| Condition | Why |
|-----------|-----|
| Switching approaches mid-task | Direction change affects all downstream work |
| Modifying or deleting existing files | Irreversible or hard-to-reverse |
| Task scope expands beyond original discussion | Scope creep must be conscious |
| Decision outside user-provided docs | Cannot assume intent without documentation |
| New architectural pattern or structure | User must understand what they're committing to |
| Ambiguity producing materially different outputs | Both paths valid — user must choose |

In **verbose** mode: gate at every significant fork.  
In **lean** mode: same triggers — lean affects *questions*, not *gates* on high-stakes actions.

## Out-of-scope trigger (critical)

If the decision is not covered or inferable from the user's folder/docs, flag explicitly:

> *"This decision isn't covered in your existing docs. Before I proceed, I need your call on: [question]. This will shape [downstream consequence]. What would you like to do?"*

Never make that call silently.

## Conversational format (not bureaucratic)

Read like a senior engineer checking in — not a form.

**Single leaning path:**

```
Before I move forward — [one sentence on what's about to happen and why it matters].

I'm leaning toward [approach], because [short reason]. The tradeoff is [what's given up].

Does that work for you, or would you rather go a different direction?
```

**Two valid paths:**

```
I see two ways to handle this:
  → [Option A] — [what it does, what it costs]
  → [Option B] — [what it does, what it costs]

Which direction feels right?
```

## Rules

- No lettered menus, no "LGTM" prompts, no formal command syntax
- Plain question expecting a plain answer
- Any affirmative counts: "yeah", "go for it", "let's do A", "sounds good"
- On redirect: revise proposal and gate again if the new direction is still high-stakes

## After approval

1. Proceed with the approved direction
2. Log in audit Section 5: gate description, user decision, effect
3. Log material choices in Section 6 with doc coverage note

## Decision flow

```
Action pending
  → In user's docs or clearly inferable?
      No  → Out-of-scope message (above) → wait
      Yes → Matches a gate condition?
              No  → Proceed (note inference in Section 3 if lean)
              Yes → Present gate (one or two paths) → wait
                      → Affirmative → log → proceed
                      → Redirect → revise → re-gate if needed
```
