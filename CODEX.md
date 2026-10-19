# Codex Collaboration Guide

## Working Directory

- Treat `E:\梨眼\tauri2` as the primary project directory.
- Ignore unrelated IDE helper folders, root-level mirrors, generated caches, and build artifacts unless the user explicitly asks about them.
- Development maintenance records must be written only to `DEV_LOG.md` at the project root. `CHANGELOG.md` is for user-facing release notes, and `docs/项目变更日志.md` is only a redirect/legacy note.

## Understanding User Requests

- Assume the user describes needs in product language, daily language, or emotional shorthand rather than technical terminology.
- First interpret the request as a product manager would: identify the user goal, usage scenario, expected visible behavior, and success criteria.
- Do not require the user to provide implementation details, component names, file paths, or framework-specific terms before making progress.
- When the request is ambiguous, infer the most likely product intent from the current app context and existing behavior. Ask only when multiple interpretations would lead to meaningfully different outcomes or risk damaging data.
- Translate vague requests into concrete engineering tasks before editing code. Keep the implementation aligned with the existing Tauri 2, React, Rust, Zustand, and TipTap architecture.
- Be patient with frustrated or imprecise wording. Respond by clarifying the goal and proposing/implementing the likely fix, not by correcting the wording.
- Before finalizing, verify against the product-level outcome, not just whether code compiles.

## Communication Style

- Use plain Chinese explanations by default when discussing product behavior or progress.
- Summarize technical findings in user-facing terms first, then mention files or commands only when useful.
- When reporting completion, state what changed, what was verified, and any remaining risk.
