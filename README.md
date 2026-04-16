# Hospital Management Backend

A TypeScript + Express + MongoDB backend for managing patients, doctors, schedules, appointments, and admin operations in a hospital workflow.

This API provides:
- JWT-based authentication and refresh-token flow
- Role-based access control (`patient`, `doctor`, `admin`, `superadmin`)
- Patient and doctor profile management
- Appointment booking with slot-availability checks
- Doctor schedule generation and analytics
- Admin dashboard and user moderation endpoints

## Tech Stack

- Runtime: `Node.js`
- Framework: `Express` + `express-promise-router`
- Language: `TypeScript`
- Database: `MongoDB` with `Mongoose`
- Auth: `jsonwebtoken`, `bcrypt`, `cookie-parser`
- Validation: custom validators and typed interfaces
- Logging: `morgan`

## Project Structure

```text
src/
  app/
    config/            # environment and app configuration
    errors/            # custom API error classes
    middlewares/       # auth, role checks, error handling, not-found
    modules/
      auth/            # login, refresh token, account/profile actions
      user/            # admin user management and stats
      patient/         # patient profile CRUD and registration
      doctor/          # doctor profile CRUD and dashboard stats
      schedule/        # schedule CRUD, availability, analytics, generation
      appointment/     # appointment CRUD, cancellation, statistics
      admin/           # admin dashboard endpoint
    routes/            # mounts module routes
    shared/            # shared helpers (response/file utilities)
    tests/             # test/dev routes
  defaults/            # default seed data
  app.ts               # express app setup
  server.ts            # mongo connection + server bootstrap
  seeder.ts            # database seeding on first run
```

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Create a `.env` file in the backend root.

Required / commonly used variables:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=mongodb://localhost:27017/nupem_db

JWT_SECRET=your_access_token_secret
JWT_REFRESH_SECRET=your_refresh_token_secret

BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000

SMTP_HOST=
SMTP_PORT=
SMTP_EMAIL=
SMTP_EMAIL_USERNAME=
SMTP_EMAIL_PASSWORD=
```

### 3) Run in development

```bash
npm run dev
```

### 4) Build and run production

```bash
npm run build
npm start
```

Base URL:
- Local default: `http://localhost:5000`
- API prefix: `/api/v1`

## Seed Data

On first startup, if no users exist, the app seeds a default admin:

- email: `admin@hospital.com`
- password: `Abc1234#`
- role: `admin`

Use this account for initial admin-only operations, then rotate credentials immediately in real deployments.

## Authentication and Authorization

### Access token

- Send JWT access token in `Authorization` header:

```http
Authorization: Bearer <access_token>
```

### Refresh token

- On successful login, refresh token is set in an HTTP-only cookie named `refreshToken`.
- Refresh endpoint: `POST /api/v1/auth/refresh-token`

### Role rules

- `patient`: personal profile and personal appointment operations
- `doctor`: doctor profile, doctor appointments, schedule management
- `admin` / `superadmin`: all management endpoints and dashboard analytics

## Main API Modules

All module routes are mounted under `/api/v1`.

### Auth (`/auth`)

- `POST /login`
- `POST /refresh-token`
- `POST /change-password` (auth required)
- `POST /reset-password` (auth required)
- `GET /me` (auth required)
- `PUT /me` (auth required)

### Patients (`/patients`)

- `POST /register` (public)
- `GET /me` (auth)
- `PUT /me` (auth)
- `GET /` (admin/superadmin)
- `GET /:id` (admin/superadmin)
- `PUT /:id` (admin/superadmin)
- `DELETE /:id` (admin/superadmin)

### Doctors (`/doctors`)

- `GET /` (public list with filters)
- `GET /specialization/:specialization` (public)
- `GET /me` (auth)
- `GET /dashboard/stats` (auth doctor)
- `PUT /me` (auth)
- `POST /` (admin/superadmin)
- `GET /:id` (admin/superadmin)
- `PUT /:id` (admin/superadmin)
- `DELETE /:id` (admin/superadmin)

### Schedules (`/schedules`)

- `GET /doctor/:doctorId/available-slots/:date` (public)
- `GET /my-schedules` (auth doctor)
- `GET /my-available-slots/:date` (auth doctor)
- `GET /my-analytics` (auth doctor)
- `GET /my-preferences` (auth doctor)
- `GET /my-schedule/check/:date` (auth doctor)
- `PUT /my-preferences` (auth doctor)
- `POST /generate` (auth doctor)
- `POST /my-schedule` (auth doctor)
- `PUT /my-schedule/:id` (auth doctor)
- `DELETE /my-schedule/:id` (auth doctor)
- `POST /` (admin)
- `GET /` (admin)
- `GET /:id` (admin)
- `PUT /:id` (admin)
- `DELETE /:id` (admin)
- `POST /cleanup` (admin)

### Appointments (`/appointments`)

- `GET /my-appointments` (auth patient)
- `GET /doctor-appointments` (auth doctor)
- `GET /my-appointments/date/:date` (auth patient)
- `POST /` (auth, role-aware)
- `GET /:id` (auth with ownership/role checks)
- `PUT /:id` (auth with ownership/role checks)
- `PATCH /:id/cancel` (auth with ownership/role checks)
- `GET /stats/overview` (auth; filtered by role)
- `GET /` (admin/superadmin)
- `DELETE /:id` (admin/superadmin)

### Users (`/users`) - admin only

- `GET /`
- `GET /stats`
- `GET /:id`
- `PATCH /:id/status`
- `PATCH /:id/roles`
- `PATCH /bulk/status`
- `DELETE /:id`

### Admin (`/admin`) - admin only

- `GET /dashboard/stats`

## Core Business Rules

- Patients are auto-created with a linked user account on registration.
- Doctors are created by admins and get auto-generated schedules.
- Appointment creation checks:
  - doctor exists
  - patient profile exists
  - date is not in the past
  - date is within 90 days
  - requested slot is available
- Appointment cancellation updates schedule slot counters.
- Many list endpoints support pagination with `page` and `limit`.

## Common Request Examples

### Login

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hospital.com",
    "password": "Abc1234#"
  }'
```

### Register patient

```bash
curl -X POST http://localhost:5000/api/v1/patients/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient1@example.com",
    "password": "StrongPass123#",
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1996-04-10",
    "gender": "male",
    "phoneNumber": "+8801700000000",
    "bloodGroup": "O+"
  }'
```

### Create appointment

```bash
curl -X POST http://localhost:5000/api/v1/appointments \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "<patient_user_or_patient_id>",
    "doctorId": "<doctor_id>",
    "appointmentDate": "2026-05-01",
    "startTime": "10:00",
    "endTime": "11:00",
    "type": "consultation",
    "reason": "General health check"
  }'
```

## Health and Dev Routes

- `GET /` -> welcome message
- `GET /dev/v1/error-test` -> throws a test error intentionally

## Notes for Production

- Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Restrict CORS origins (currently configured for localhost frontend).
- Replace default seeded admin credentials immediately.
- Enable secure cookie behavior with `NODE_ENV=production`.

