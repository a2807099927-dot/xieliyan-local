# Claude Project Instructions

## Primary Project Directory

- Work primarily in `E:\梨眼\tauri2`.
- Ignore unrelated root-level mirrors, IDE helper folders, generated caches, and build artifacts unless the user explicitly asks about them.
- Development maintenance records must be written only to `DEV_LOG.md` at the project root. `CHANGELOG.md` is for user-facing release notes, and `docs/项目变更日志.md` is only a redirect/legacy note.

## User Request Interpretation

- Treat user requests as product requirements first, not as technical specifications.
- The user may describe needs with non-technical wording, rough examples, emotion, or incomplete details. Convert that into product intent before choosing an implementation.
- Identify the user goal, usage scenario, expected visible behavior, edge cases, and acceptance criteria.
- Do not require component names, file paths, framework terms, or implementation details from the user before making progress.
- If the request is ambiguous, infer the most likely intent from the current app behavior and existing code. Ask only when different interpretations would create materially different outcomes or risk user data.
- Keep implementation consistent with the existing Tauri 2, React, Rust, Zustand, and TipTap architecture.
- Verify the final result against the product-level outcome, not only compile or test success.

## Communication

- Use plain Chinese for progress and completion notes.
- Explain technical findings through user-visible impact first, then mention files or commands when useful.
