# How to capture a feature

The whole point is that adding the *next* feature is one sentence of effort.

## The 6 steps
1. **Pick the unit.** One feature = one reusable capability (a referral system, a
   paywall, a streak). Not a whole page, not a single function.
2. **Make the folder.** `features/<kebab-slug>/` with a `code/` subfolder.
3. **Copy the SPEC template.** `_template/SPEC.md` → `features/<slug>/SPEC.md`.
4. **Fill the SPEC from the real code**, read the source before writing. The
   sections that earn their keep: *When to reach for this*, *Key decisions &
   gotchas*, *Adaptation notes*. Don't skip provenance.
5. **Copy source verbatim** into `code/`. Do not edit it, faithfulness to origin
   is the value. Note the import deps in the Code layer table.
6. **Add one row to `INDEX.md`** (top of the table).

## What makes a good entry
- **Structure over skin.** Capture the idea, not the look: data model, logic,
  contracts, flow. Treat visuals as disposable, to be regenerated to fit the
  destination project so the design stays cohesive with its new home. Every SPEC has
  a "Structure to keep, skin to drop" section that says what is load-bearing and what
  to restyle from scratch.
- The SPEC explains the **decisions**, not just the what. If it only restates the
  code, it adds nothing, the code is already there.
- **Reuse confidence** is honest: drop-in / adapt-the-shape / reference-only.
- **Adaptation notes** are specific: name the imports, env vars, and schema fields a
  future session must change. Styling is always rebuilt natively, never pasted.

## What NOT to capture
- One-off glue with no reuse value.
- Anything that only makes sense inside its origin app's exact context.
- Backend code you don't own or shouldn't lift, route it to a spec instead.
