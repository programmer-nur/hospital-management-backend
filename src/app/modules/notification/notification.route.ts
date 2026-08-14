import expressPromiseRouter from "express-promise-router";

import auth from "../../middlewares/authentication";
import hasRole from "../../middlewares/has-role";
import { NotificationController } from "./notification.controller";

const router = expressPromiseRouter();

// Delivery data is operational and can reference patients, so the whole
// module is admin-only. Placement after these guards is what enforces it.
router.use(auth);
router.use(hasRole("admin", "superadmin"));

router.get("/", NotificationController.getNotifications);
router.get("/stats", NotificationController.getNotificationStats);
router.post("/dispatch", NotificationController.runDispatcher);
router.patch("/:id/retry", NotificationController.retryNotification);

export const NotificationRoute = router;
