declare global {
  namespace Express {
    export interface Request {
      user?: IUser;
      /*
        other variables (if needed)
      */
    }
  }
}

import cron from "node-cron";
import moment from "moment-timezone";

import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application } from "express";
import fs from "fs";
import morgan from "morgan";
import path from "path";

import errorHandleMiddleware from "./app/middlewares/error-handler";
import notFoundMiddleware from "./app/middlewares/not-found";
import routes from "./app/routes";
import { dispatchDueNotifications } from "./app/modules/notification/notification.service";
import testRoutes from "./app/tests/test.route";

import config from "./app/config";
import { IUser } from "./app/modules/user/user.type";

const app: Application = express();

app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:3000"],
    // Required for the refresh-token flow: the refresh token is delivered as an
    // httpOnly cookie at login, and POST /auth/refresh-token reads it from
    // req.cookies. Without this the browser will not send the cookie
    // cross-origin and every refresh fails.
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (config.node_env == "production") {
  const accessLogStream = fs.createWriteStream(
    path.join(__dirname, "/../morgan.log"),
    { flags: "a" }
  );
  app.use(
    morgan("common", {
      skip: function (req, res) {
        return res.statusCode < 400;
      },
      stream: accessLogStream,
    })
  );
} else {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Hospital Management System api",
  });
});

//Test Routes
app.use("/dev/v1", testRoutes);

// Notification dispatcher.
//
// `node-cron` was already imported here but never used. Runs every minute and
// is guarded against overlap: a slow tick must not have a second one start
// alongside it and send the same message twice.
let dispatchRunning = false;
cron.schedule("* * * * *", async () => {
  if (dispatchRunning) return;
  dispatchRunning = true;
  try {
    const result = await dispatchDueNotifications();
    if (result.claimed) {
      console.log(
        `[notifications] dispatched ${result.sent} sent, ${result.failed} failed`
      );
    }
  } catch (error: any) {
    console.error("[notifications] dispatcher error:", error?.message);
  } finally {
    dispatchRunning = false;
  }
});

// Routes
app.use("/api/v1", routes);

//Handle not found and errors
app.use(notFoundMiddleware);
app.use(errorHandleMiddleware);

export default app;
