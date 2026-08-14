import express from "express";
import { AuthRoute } from "../modules/auth/auth.route";
import { PatientRoute } from "../modules/patient/patient.route";
import { DoctorRoute } from "../modules/doctor/doctor.route";
import { UserRoute } from "../modules/user/user.route";
import ScheduleRoute from "../modules/schedule/schedule.route";
import { AppointmentRoute } from "../modules/appointment/appointment.route";
import { AdminRoute } from "../modules/admin/admin.route";
import { NotificationRoute } from "../modules/notification/notification.route";
import { AuditRoute } from "../modules/audit/audit.route";
import auditLog from "../middlewares/audit";

const router = express.Router();

// Audit every API request.
//
// Registered before the module routers, which is safe: the entry is written on
// the response's `finish` event, by which point each module's own `auth`
// middleware has already populated req.user, so the entry is attributable.
router.use(auditLog);

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoute,
  },
  {
    path: "/patients",
    route: PatientRoute,
  },
  {
    path: "/doctors",
    route: DoctorRoute,
  },
  {
    path: "/users",
    route: UserRoute,
  },
  {
    path: "/schedules",
    route: ScheduleRoute,
  },
  {
    path: "/appointments",
    route: AppointmentRoute,
  },
  {
    path: "/admin",
    route: AdminRoute,
  },
  {
    path: "/notifications",
    route: NotificationRoute,
  },
  {
    path: "/audit",
    route: AuditRoute,
  },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
