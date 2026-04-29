import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hcpsRouter from "./hcps";
import interactionsRouter from "./interactions";
import materialsRouter from "./materials";
import agentRouter from "./agent";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hcpsRouter);
router.use(interactionsRouter);
router.use(materialsRouter);
router.use(agentRouter);
router.use(dashboardRouter);

export default router;
