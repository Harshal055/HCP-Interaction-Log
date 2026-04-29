import { Router, type IRouter } from "express";
import { ListMaterialsResponse } from "@workspace/api-zod";
import { materialCatalogTool } from "../lib/agent/tools";

const router: IRouter = Router();

router.get("/materials", (_req, res): void => {
  const data = materialCatalogTool();
  res.json(ListMaterialsResponse.parse(data));
});

export default router;
