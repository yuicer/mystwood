# AGENTS.md

Durable context for coding agents working in this repo. Keep product facts in `README.md`; keep this file focused on how to work safely and reliable.

## Project Shape

- Mystwood is a native WeChat Mini Program backed by WeChat Cloud Functions.
- There is no standalone HTTP backend. Business calls go through `wx.cloud.callFunction` via `miniprogram/utils/api.js`.
- Cloud functions live in `cloudfunctions/space-service` and `cloudfunctions/task-service`.
- The cloud database is the source of truth for spaces, tasks, memories, sync events, and hidden score/theme state.

## Working Habits

- Read `README.md` before changing user flows, data models, cloud actions, routing, or sync behavior.
- Keep changes small and native Mini Program style; do not introduce a framework, build system, or HTTP service unless explicitly asked.
- Update `README.md` when changing cloud actions, page flows, data schemas, sync events, or WeChat API usage.
- Use ASCII for code/config unless editing existing Chinese product copy or docs.
- Preserve user changes in the worktree; do not revert unrelated files.

## Mini Program Rules

- Add or update wrappers in `miniprogram/utils/api.js` before calling a cloud function from a page.
- Do not scatter raw `wx.cloud.callFunction` calls across pages.
- Use `wx.showToast({ icon: "none" })` for user-facing errors unless the page already has another pattern.
- Keep routes consistent with the current non-tabBar structure and register new pages in `miniprogram/app.json`.
- Prefer WeChat-native APIs for share, media, cloud storage, location, and subscription messages.

## Cloud Function Rules

- Treat `cloud.getWXContext().OPENID` as the authority for the current user.
- Never trust client-provided `spaceId`, `creator`, members, score, theme, or other security-sensitive fields.
- Validate that write operations belong to the current user's space before mutating data.
- Keep success responses shaped as `{ code: 0, data }` and errors as `{ code, message }`.
- For collaboration changes, write the database first, append a `spaces.sync.changes` event, and let `getState()` aggregate the client view.

## Verification

- Documentation/style-only changes: inspect Markdown mentally and run `git diff --check` when practical.
- JavaScript/cloud changes: run `node --check` on affected `.js` files or the whole `miniprogram`/`cloudfunctions` tree.
- Cloud action changes: verify the client wrapper action name and return shape still match.
