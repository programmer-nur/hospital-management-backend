import { AuthController } from "./auth.controller";
import auth from "../../middlewares/authentication";

import expressPromiseRouter from "express-promise-router";
import authWithPendingStatus from "../../middlewares/authWithoutStatusCheck";

const router = expressPromiseRouter();

router.post("/login", AuthController.login);
router.post("/refresh-token", AuthController.refreshTokenGenerate);
router.post("/change-password", auth, AuthController.changePassword);
router.post("/reset-password", auth, AuthController.resetPassword);

router.get("/me", auth, AuthController.getselfInfo);
router.put("/me", auth, AuthController.updateProfile);

export const AuthRoute = router;
