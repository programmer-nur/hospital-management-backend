# AGENTS.md

Guidance for AI coding agents working in this repository.

**The full instructions live in [CLAUDE.md](CLAUDE.md) — read that file.** This pointer exists so non-Claude agents find it too. Content is kept in one place to avoid drift.

Quick orientation:

- Express + TypeScript + MongoDB API. `yarn dev` (port 5000, routes under `/api/v1`), `yarn build`, `npx tsc --noEmit` to type-check.
- **No test framework and no linter.** `npx tsc --noEmit` is the only automated check; it currently passes. Verify behaviour by running the server (`README.md` has curl examples).
- Domain code is `src/app/modules/<domain>/<domain>.{route,controller,model,type,validation}.ts`; register new modules in `src/app/routes/index.ts`.
- Controllers throw instead of catching — `express-promise-router` routes rejections to the error middleware. All responses go through `sendResponse()`.
- Within a route file, `router.use(auth)` and `router.use(hasRole(...))` are section dividers: **where you place a route determines who can call it.**
- This is one half of a two-repo workspace; the parent directory's `CLAUDE.md` documents the API contract with the frontend.
