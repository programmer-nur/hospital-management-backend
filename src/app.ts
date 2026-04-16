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
import testRoutes from "./app/tests/test.route";

import config from "./app/config";
import { IUser } from "./app/modules/user/user.type";

const app: Application = express();

app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:3000"],
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

// Routes
app.use("/api/v1", routes);

//Handle not found and errors
app.use(notFoundMiddleware);
app.use(errorHandleMiddleware);

export default app;
