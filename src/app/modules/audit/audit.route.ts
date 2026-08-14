import expressPromiseRouter from "express-promise-router";

import auth from "../../middlewares/authentication";
import hasRole from "../../middlewares/has-role";
import { AuditController } from "./audit.controller";

const router = expressPromiseRouter();

// The audit trail records who accessed patient data, so it is itself sensitive.
// Placement after these guards is what enforces admin-only access.
router.use(auth);
router.use(hasRole("admin", "superadmin"));

router.get("/", AuditController.getAuditLogs);
router.get("/:resource/:resourceId", AuditController.getResourceTrail);

export const AuditRoute = router;
