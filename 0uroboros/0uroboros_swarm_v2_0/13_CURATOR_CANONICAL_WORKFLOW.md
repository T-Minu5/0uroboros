# Canonical Curator Workflow

Structured canonical JSON remains the machine-editable source. Markdown is generated/synchronized human-readable documentation.

```text
Approved change
  ↓
Structured patch proposal
  ↓
Schema validation
  ↓
Canonical ID + authority + staleness validation
  ↓
Human approval when required
  ↓
Deterministic patch application
  ↓
Canonical JSON
  ↓
Generated/synchronized Markdown
  ↓
Changelog
```

An LLM may formulate or explain a patch but may not organically rewrite canonical Markdown as the primary mutation path or infer approval.

Prefer RFC 6902 JSON Patch or equivalent deterministic structured patch against structured canonical data, not raw Markdown.

When canonical mutation is exposed as an Agents SDK tool, the tool is approval-gated when policy requires it and still performs deterministic authorization before mutation. SDK approval complements rather than replaces application governance.
