# AGENTS.md

This file gives Codex and other coding agents durable project context. Keep it short and practical. Product facts and roadmap details live in `README.md`; this file focuses on how to work in this repository.

## Project Shape

- Mystwood is a native WeChat Mini Program backed by WeChat Cloud Functions.
- There is no standalone HTTP backend. Business calls should go through `wx.cloud.callFunction` via `miniprogram/utils/api.js`.
- Cloud functions live in `cloudfunctions/space-service` and `cloudfunctions/task-service`.
- The product is a two-person intimacy space: create space, invite partner, create tasks, complete tasks, update hidden intimacy score, and turn completed/overdue tasks into memories.

## Working Habits

- Read `README.md` before changing product behavior, data models, APIs, or collaboration flows.
- Keep README current when changing user flows, cloud function actions, data schemas, or the two-person sync strategy.
- Prefer small, reviewable changes that follow the existing native Mini Program style.
- Do not introduce a new framework, build system, or HTTP service unless the user explicitly asks for that direction.
- Use ASCII for code and config unless editing existing Chinese product copy or documentation.

## WeChat Mini Program Rules

- Add or change client API wrappers in `miniprogram/utils/api.js` before using a cloud function from a page.
- Do not scatter raw `wx.cloud.callFunction` calls across pages.
- Use `wx.showToast({ icon: "none" })` for user-facing error messages unless a page already has a stronger pattern.
- Keep route changes consistent with the current non-tabBar app structure.
- Use WeChat-native capabilities for share, media, cloud storage, location, and subscription messages.

## Cloud Function Rules

- Treat `cloud.getWXContext().OPENID` as the authority for the current user.
- Never trust client-provided `spaceId`, `creator`, score, theme, member list, or other security-sensitive fields.
- Validate that write operations belong to the current user's space before mutating data.
- Keep success responses shaped as `{ code: 0, data }` and errors as `{ code, message }`.
- When adding two-person collaboration features, make the cloud database the source of truth and let `getState()` aggregate the client-facing view.

## Data Collaboration Direction

- Preserve the one-user-one-space and two-members-per-space product constraint.
- Hidden intimacy score should remain hidden from the UI; expose theme and UI state, not raw score as a product feature.
- For future sync work, prefer explicit state machines, append-only sync events, idempotent writes, and subscription-message fallback.
- Important future hardening tasks are documented in the README: ownership checks, active-space checks, cascade cleanup, score updates, task invite receipts, and sync events.

## Verification

- For documentation-only changes, inspect the rendered Markdown mentally and run lightweight checks such as `git diff --check` when practical.
- For cloud function changes, at minimum inspect affected actions and verify the client wrapper still matches the cloud action name and return shape.
- For page changes, verify the page is registered in `miniprogram/app.json` when adding routes.
