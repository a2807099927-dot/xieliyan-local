# Gemini Project Instructions

## Primary Project Directory

- Use `E:\梨眼\tauri2` as the real project root.
- Do not spend effort on unrelated IDE folders, root-level mirrors, generated caches, or build artifacts unless explicitly requested.
- Development maintenance records must be written only to `DEV_LOG.md` at the project root. `CHANGELOG.md` is for user-facing release notes, and `docs/项目变更日志.md` is only a redirect/legacy note.

## Product-First Requirement Handling

- Interpret user messages as product needs before translating them into engineering tasks.
- The user may use informal, imprecise, emotional, or non-technical language. Extract the intended workflow, visible behavior, and success criteria.
- Avoid asking for technical terminology. The assistant should map the request onto the app's existing modules and architecture.
- When details are missing, make the most reasonable product assumption based on current context. Ask only if the ambiguity changes the outcome significantly or risks data loss.
- Preserve the existing architecture: Tauri 2 backend, React frontend, Rust commands, Zustand state, TipTap editor, and current UI conventions.
- Validate completion by checking that the intended user-facing behavior is satisfied.

## Communication

- Prefer clear Chinese explanations.
- Put product impact before implementation detail in status updates and final summaries.
