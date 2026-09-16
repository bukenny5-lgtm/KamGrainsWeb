import {
  listCleaningBatches,
  getCleaningBatchByNo,
  createCleaningBatch,
  postCleaningBatchByNo,
  deleteCleaningBatchByNo,
  getCleaningBatchSummaryReport,
} from "../services/cleaningBatches.service.js";

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
    const data = await listCleaningBatches();

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

    const data = await getCleaningBatchByNo(batchNo);

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
    const data = await createCleaningBatch(req.body);

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

    const data = await postCleaningBatchByNo(batchNo);

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

    const data = await deleteCleaningBatchByNo(batchNo);

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
    const data = await getCleaningBatchSummaryReport();

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    handleError(res, error);
  }
}