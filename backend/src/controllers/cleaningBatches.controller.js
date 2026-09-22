import {
  listCleaningBatches,
  getCleaningBatchByNo,
  createCleaningBatch,
  postCleaningBatchByNo,
  deleteCleaningBatchByNo,
  getCleaningBatchSummaryReport,
} from "../services/cleaningBatches.service.js";
import { getUserRoles } from "../middleware/permissions.js";

function cleaningScope(req) {
  const roles = getUserRoles(req);
  return { branchId: req.branchId, userId: req.user?.user_id, allBranches: roles.includes("HEAD_OFFICE"), allLocations: roles.some((role) => ["ADMIN", "MANAGER", "AUDITOR", "HEAD_OFFICE"].includes(role)) };
}

function handleError(res, error) {
  console.error(error);

  const status = error.status || 500;

  res.status(status).json({
    success: false,
    message: error.message || "Internal server error",
    detail: error.detail || null,
  });
}

export async function getCleaningBatches(req, res) {
  try {
    const data = await listCleaningBatches(cleaningScope(req));

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function getCleaningBatch(req, res) {
  try {
    const { batchNo } = req.params;

    const data = await getCleaningBatchByNo(batchNo, cleaningScope(req));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function createCleaningBatchController(req, res) {
  try {
    const data = await createCleaningBatch({ ...req.body, created_by: req.user?.user_id }, cleaningScope(req));

    res.status(201).json({
      success: true,
      message: "Cleaning batch created successfully",
      data,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function postCleaningBatchController(req, res) {
  try {
    const { batchNo } = req.params;

    const data = await postCleaningBatchByNo(batchNo, cleaningScope(req));

    res.json({
      success: true,
      message: "Cleaning batch posted successfully",
      data,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function deleteCleaningBatchController(req, res) {
  try {
    const { batchNo } = req.params;

    const data = await deleteCleaningBatchByNo(batchNo, cleaningScope(req));

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    handleError(res, error);
  }
}
export async function getCleaningBatchSummaryReportController(req, res) {
  try {
    const data = await getCleaningBatchSummaryReport(cleaningScope(req));

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    handleError(res, error);
  }
}
