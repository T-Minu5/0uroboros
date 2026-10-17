# 0uroboros v3 (experiment)

This branch explores a new game mechanic. The shipping game stays on `main`, tagged **`v2-standard-deck`**.

## How to work

- **Ship / fix the live game:** stay on `main` (or check out tag `v2-standard-deck`). Deploy from there.
- **Explore the new mechanic:** work on branch `0uroboros_v3`. Until the code diverges enough to split, keep changing `0uroboros_v2/` here — same engine and client, different rules.
- **Side-by-side folders:** a git worktree can check this branch out next to the main project (see below). Do not copy the whole tree into git; that doubles assets.

## Side-by-side checkout

From the repo root on any machine:

```bash
git fetch origin
git worktree add "../0uroboros_v3" 0uroboros_v3
```

Open that folder in Cursor for the experiment; keep the original project on `main` for the shipping build.

## When this becomes a different game

If the mechanic graduates into a separate product, extract or fork then — not at the start of the experiment.
