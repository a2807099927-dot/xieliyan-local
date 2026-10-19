# Agent Instructions

## Scope

- Main workspace: `E:\梨眼\tauri2`.
- Treat other root-level folders, IDE metadata, caches, and generated outputs as out of scope unless the user explicitly points to them.
- Development maintenance records must be written only to `DEV_LOG.md` at the project root. `CHANGELOG.md` is for user-facing release notes, and `docs/项目变更日志.md` is only a redirect/legacy note.

## Requirement Interpretation

- Start from product intent. The user may not use technical vocabulary and may describe issues vaguely or emotionally.
- Translate each request into:
  - the user goal,
  - the relevant workflow,
  - the expected visible behavior,
  - the acceptance criteria,
  - and only then the engineering tasks.
- Do not block on missing technical terms. Infer from the app context and existing behavior.
- Ask clarification only when competing interpretations would cause different product outcomes or risk data.
- Implement within the existing Tauri 2 / React / Rust / Zustand / TipTap patterns.
- Verify against user-facing behavior, not just code-level success.

## Response Style

- Communicate in plain Chinese.
- Keep explanations practical and product-facing.
