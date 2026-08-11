# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Express + TypeScript + MongoDB API for a hospital appointment system. This repo is the backend half of a two-repo workspace; see the parent directory's `CLAUDE.md` for the cross-repo contract, and `README.md` here for the full endpoint list and curl examples.

## Commands

```bash
yarn dev                # nodemon src/server.ts — http://localhost:5000
yarn build              # npx tsc → build/
yarn start              # node build/server.js (requires build first)
npx tsc --noEmit        # type-check only — currently clean, keep it that way
```

There is **no test framework and no linter** in this repo. `yarn build` is the only automated check; `npx tsc --noEmit` is the fast form of it. Verify behaviour by running `yarn dev` and hitting the endpoint (curl examples are in `README.md`).

`.env` is required — copy `env.example`. On first boot against an empty database, `seedDataBaseIfRequired()` creates `admin@hospital.com` / `Abc1234#`.

## Architecture

### Request lifecycle

`src/server.ts` connects Mongoose and seeds, then starts `src/app.ts`, which mounts `src/app/routes/index.ts` at `/api/v1`, followed by `not-found` and `error-handler` middleware.

Routers use **`express-promise-router`**, not `express.Router`. This is load-bearing: it forwards rejected promises to the error middleware, which is why controllers are written as bare `async` functions that **throw** instead of wrapping everything in try/catch. Keep that style — a plain `express.Router` would swallow async throws and hang the request.

Errors are the `CustomAPIError` hierarchy in `src/app/errors/` (`BadRequestError`, `NotFoundError`, `ForbiddenError`, `UnauthenticatedError`). `error-handler.ts` maps a `CustomAPIError` to its `statusCode` and anything else to a 500.

Every response — success or failure — goes through `sendResponse(res, { statusCode, success, message, data })` from `src/app/shared/sendResponse.ts`. Never call `res.json()` directly.

### Module layout

Domain modules live in `src/app/modules/<domain>/` and follow a fixed file naming convention:

```
<domain>.route.ts        route definitions + inline validation middleware
<domain>.controller.ts   business logic, exported as a single `XController` object
<domain>.model.ts        mongoose schema, statics, virtuals, hooks
<domain>.type.ts         I-prefixed interfaces + the Model type
<domain>.validation.ts   hand-rolled validators (see below)
```

Modules: `auth`, `user`, `patient`, `doctor`, `schedule`, `appointment`, `admin`.

To add a module: create the directory with those files, then register it in the `moduleRoutes` array in `src/app/routes/index.ts`. Routers are exported as a named const (`export const AppointmentRoute = router`) except `schedule.route.ts`, which is a default export — match whatever the file already does.

**There is no service layer.** Business logic lives in controllers, and they are large (`appointment.controller.ts` is ~880 lines, `schedule.controller.ts` ~915). The single exception is `schedule/schedule-generation.service.ts`, a static-method class. Follow the existing placement rather than introducing a service layer mid-feature; if a refactor is warranted, raise it separately.

### Route ordering is the authorization mechanism

Within a route file, `router.use(auth)` and `router.use(hasRole(...))` act as **section dividers**. Everything declared *after* them inherits that guard. A typical file reads:

```ts
router.get("/", Controller.publicList);        // public — before any guard

router.use(auth);                              // ↓ everything below requires a valid token
router.get("/me", Controller.getMyProfile);

router.use(hasRole("admin", "superadmin"));    // ↓ everything below is admin-only
router.delete("/:id", Controller.remove);
```

**Where you place a route determines who can call it.** Adding a route at the bottom of `appointment.route.ts` silently makes it admin-only; adding one at the top makes it public. Always check which guards precede your insertion point.

`hasRole(...roles)` matches *any* of the listed roles and short-circuits `superadmin` past every check. Note that controllers frequently *also* re-check roles inline (`currentUser.roles.includes("admin")`) to filter results by role rather than just permit/deny — so a route-level guard is usually not the whole story.

Four middlewares in `src/app/middlewares/` are dead code and applied to no route: `onlyAllowApprovedUser`, `requirePrivilegedAdmin`, `onlyCheckAuthStatus`, and `authWithoutStatusCheck` (imported by `auth.route.ts` but never used). Do not assume they work.

### Validation

`zod` is a dependency but **unused**. Validation is hand-rolled: `<domain>.validation.ts` exports functions taking `data: any` and returning `string[]` of error messages (or a single `string | null` for scalar params). Each route file then defines local `validateXMiddleware` wrappers at the top that run the validator and `sendResponse` a 400 with `data: { errors }` on failure.

This is verbose and duplicated across route files, but it is the convention — match it rather than introducing zod into a single module. Migrating to zod is a deliberate cross-module change worth proposing separately.

### Auth

`authentication.ts` verifies the Bearer token, loads the `User` document, rejects `blocked` / `pending` / `declined` status, and assigns `req.user`. The `Express.Request.user` augmentation is declared in **two** places — `src/@types/index.d.ts` and a `declare global` block at the top of `src/app.ts`. If you change the shape, change both.

Tokens are minted by `userSchema.methods.createJWT(refresh?)` in `user.model.ts` — access tokens expire in 7d, refresh in 365d (`src/app/config/index.ts`). The JWT payload uses `userID` and `roles` (plural). Passwords are hashed by a `pre("save")` hook and blanked by a `post("save")` hook; `password` has `select: false`, so reading it requires `User.getUser(email)`, which explicitly selects it.

Config is centralized in `src/app/config/index.ts` — read env vars from there, never `process.env` directly in a module.

### Scheduling and booking

The most coupled part of the codebase. `Schedule` holds one document per doctor per date (unique compound index on `{ doctor, date }`) with an array of one-hour `timeSlots`, each carrying `maxAppointments` and a denormalized `currentAppointments` counter.

Schedules are created from three entry points:
- `ScheduleGenerationService.generateInitialSchedules()` — 30 weekdays ahead, on doctor creation.
- `ScheduleGenerationService.ensureFutureSchedules()` — 7 days ahead, on every booking attempt.
- `Schedule.createDefaultSchedule()` — last-resort fallback inside `createAppointment`.

Booking (`createAppointment`) then calls `Appointment.checkSlotAvailability()` and, on success, **manually increments** the matching slot's `currentAppointments` and calls `schedule.updateSlotAvailability()`. Cancellation and deletion decrement it. **The counter is maintained by hand in three places in `appointment.controller.ts` — any change to one must be mirrored in the others.** There is no transaction wrapping appointment save + counter update.

Constraints enforced on booking: date not in the past, within 90 days, slot must exist in the schedule and be under capacity, and the patient must not already hold that exact slot.

A `pre("save")` hook on `Schedule` rejects past dates and enforces that every slot is *exactly* one hour — `ScheduleGenerationService`'s `slotDuration` preference is therefore only safe at `60`.

## Known issues

Documented so you don't rediscover them or mistake them for your own regressions.

- **Date normalization is inconsistent.** Writes normalize to local midnight via `setHours(0,0,0,0)`, but `Schedule.getAvailableSlots()` looks up `new Date(date + "T00:00:00.000Z")` — UTC midnight. These agree only when the process runs in UTC. Anything touching schedule date lookup should pick one convention deliberately.
- **`getAvailableSlots` and the generation service log verbosely to stdout** on every call (`console.log` with `[getAvailableSlots]` prefixes). Intentional debugging, not yours.
- **CORS origin is hardcoded** to `http://localhost:3000` in `src/app.ts` — not configurable by env, despite `config.frontend_url` existing.
- **Dependencies pulled in but unused:** `zod`, `resend`, `nodemailer`, `otp-generator`, `@aws-sdk/*`, `multer`, `facebook-nodejs-business-sdk`, `node-cron`. `config` also declares OTP/SMTP settings nothing reads. Their presence does not mean email, uploads, or cron are wired up.
- **`package-lock.json` and `yarn.lock` are both committed**, and `.gitignore`'s `./package-lock.json` entry doesn't match (the `./` prefix is wrong). Use yarn; don't regenerate lockfiles unless asked.
- **Default seeded admin credentials are in source** at `src/defaults/users.ts`.
