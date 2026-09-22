import express from "express";

import {
  getCleaningBatches,
  getCleaningBatch,
  createCleaningBatchController,
  postCleaningBatchController,
  deleteCleaningBatchController,
  getCleaningBatchSummaryReportController,
} from "../controllers/cleaningBatches.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

const router = express.Router();
router.use(requireAuth, requireLocationAccessWhenSpecified);

router.get("/", getCleaningBatches);

router.get("/reports/summary", getCleaningBatchSummaryReportController);

router.get("/:batchNo", getCleaningBatch);

router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_CLEANING_BATCH"),
  createCleaningBatchController
);

router.post(
  "/:batchNo/post",
  requireAuth,
  requirePermission("POST_CLEANING_BATCH"),
  postCleaningBatchController
);

router.delete(
  "/:batchNo",
  requireAuth,
  requirePermission("DELETE"),
  deleteCleaningBatchController
);

export default router;
