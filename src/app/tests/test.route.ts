import { Request, Response, Router } from "express";
import expressPromiseRouter from "express-promise-router";

const router = expressPromiseRouter();

router.get("/error-test", (req: Request, res: Response) => {
  throw new Error("Test Error");
});

export default router;
