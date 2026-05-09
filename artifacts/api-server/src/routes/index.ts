import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scannersRouter from "./scanners";
import alertsRouter from "./alerts";
import statsRouter from "./stats";
import configRouter from "./config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scannersRouter);
router.use(alertsRouter);
router.use(statsRouter);
router.use(configRouter);

export default router;
