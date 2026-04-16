import express from "express";
import { AuthRoute } from "../modules/auth/auth.route";
import { PatientRoute } from "../modules/patient/patient.route";
import { DoctorRoute } from "../modules/doctor/doctor.route";
import { UserRoute } from "../modules/user/user.route";
import ScheduleRoute from "../modules/schedule/schedule.route";
import { AppointmentRoute } from "../modules/appointment/appointment.route";
import { AdminRoute } from "../modules/admin/admin.route";

const router = express.Router();

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
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
