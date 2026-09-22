import { pool } from "../db.js";

function requireField(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    const err = new Error(`${fieldName} is required`);
    err.status = 400;
    throw err;
  }
}

function isPositiveNumber(value) {
  return Number(value) > 0;
}

function normalizeExtraCosts(extraCosts) {
  if (!Array.isArray(extraCosts)) return [];

  return extraCosts
    .map((cost) => ({
      cost_type: String(cost?.cost_type || "OTHER").trim().toUpperCase(),
      description: cost?.description || null,
      amount: Number(cost?.amount ?? 0),
    }))
    .filter((cost) => {
      return cost.cost_type || Number(cost.amount || 0) !== 0 || cost.description;
    });
}

function collectExtraCosts(payloadExtraCosts, outputs) {
  const topLevelCosts = Array.isArray(payloadExtraCosts) ? payloadExtraCosts : [];

  const outputLevelCosts = Array.isArray(outputs)
    ? outputs.flatMap((line) =>
        Array.isArray(line?.extra_costs) ? line.extra_costs : []
      )
    : [];

  return normalizeExtraCosts([...topLevelCosts, ...outputLevelCosts]);
}

function validateExtraCosts(extraCosts) {
  const allowedCostTypes = new Set(["LABOUR", "TRANSPORT", "OTHER"]);

  for (const [index, cost] of extraCosts.entries()) {
    if (!cost.cost_type) {
      const err = new Error(`extra_costs[${index}].cost_type is required`);
      err.status = 400;
      throw err;
    }

    if (!allowedCostTypes.has(cost.cost_type)) {
      const err = new Error(
        `extra_costs[${index}].cost_type must be LABOUR, TRANSPORT, or OTHER`
      );
      err.status = 400;
      throw err;
    }

    if (Number.isNaN(Number(cost.amount))) {
      const err = new Error(`extra_costs[${index}].amount must be a valid number`);
      err.status = 400;
      throw err;
    }

    if (Number(cost.amount) < 0) {
      const err = new Error(`extra_costs[${index}].amount cannot be negative`);
      err.status = 400;
      throw err;
    }
  }
}

export async function listCleaningBatches(scope) {
  const sql = `
    WITH input_summary AS (
      SELECT
        bi.batch_id,
        STRING_AGG(DISTINCT p.product_name, ', ') AS input_product_name,
        STRING_AGG(DISTINCT p.sku, ', ') AS input_sku,
        STRING_AGG(DISTINCT l.lot_code, ', ') AS input_lot_code,
        SUM(bi.qty_used) AS input_qty
      FROM mfg.batch_input bi
      LEFT JOIN inv.product p
        ON p.product_id = bi.component_product_id
      LEFT JOIN inv.lot l
        ON l.lot_id = bi.lot_id
      GROUP BY bi.batch_id
    ),
    output_summary AS (
      SELECT
        bo.batch_id,
        STRING_AGG(DISTINCT l.lot_code, ', ') AS output_lot_code,
        SUM(bo.qty_produced) AS output_qty
      FROM mfg.batch_output bo
      LEFT JOIN inv.lot l
        ON l.lot_id = bo.lot_id
      GROUP BY bo.batch_id
    ),
    extra_cost_summary AS (
      SELECT
        batch_id,
        SUM(amount) AS extra_cost_total
      FROM mfg.batch_extra_cost
      GROUP BY batch_id
    ),
    input_cost_summary AS (
      SELECT
        bi.batch_id,
        SUM(bi.qty_used * COALESCE(lc.unit_cost, 0)) AS raw_input_cost
      FROM mfg.batch_input bi
      LEFT JOIN inv.v_lot_unit_cost lc
        ON lc.lot_id = bi.lot_id
      GROUP BY bi.batch_id
    ),
    posted_output_cost_summary AS (
      SELECT
        b.batch_id,
        SUM(sml.qty * COALESCE(sml.unit_cost, 0)) AS posted_output_cost
      FROM mfg.batch b
      LEFT JOIN inv.stock_movement_line sml
        ON sml.movement_id = b.posted_output_movement_id
      GROUP BY b.batch_id
    )
    SELECT
      b.batch_id,
      b.batch_no,
      b.started_at::date AS batch_date,
      b.started_at,
      b.completed_at,
      b.status,
      b.is_posted,

      b.finished_product_id,
      fp.sku AS output_sku,
      fp.product_name AS output_product_name,
      fp.product_name AS finished_product_name,
      fp.product_name AS clean_product_name,

      b.raw_location_id,
      raw_loc.location_code AS raw_location_code,
      raw_loc.location_name AS raw_location_name,

      b.fg_location_id,
      fg_loc.location_code AS fg_location_code,
      fg_loc.location_name AS fg_location_name,

      COALESCE(i.input_product_name, '') AS input_product_name,
      COALESCE(i.input_sku, '') AS input_sku,
      COALESCE(i.input_lot_code, '') AS input_lot_code,
      COALESCE(o.output_lot_code, '') AS output_lot_code,

      COALESCE(i.input_qty, 0) AS input_qty,
      COALESCE(o.output_qty, 0) AS output_qty,

      GREATEST(
        COALESCE(i.input_qty, 0) - COALESCE(o.output_qty, 0),
        0
      ) AS waste_qty,

      CASE
        WHEN COALESCE(i.input_qty, 0) = 0 THEN 0
        ELSE ROUND(
          (
            COALESCE(o.output_qty, 0)
            / COALESCE(i.input_qty, 0)
          ) * 100,
          2
        )
      END AS yield_pct,

      COALESCE(ics.raw_input_cost, 0) AS raw_input_cost,
      COALESCE(ics.raw_input_cost, 0) AS input_cost,
      COALESCE(ec.extra_cost_total, 0) AS extra_cost_total,

      COALESCE(
        CASE
          WHEN b.is_posted = true THEN pocs.posted_output_cost
          ELSE COALESCE(ics.raw_input_cost, 0) + COALESCE(ec.extra_cost_total, 0)
        END,
        0
      ) AS total_cost,

      COALESCE(
        CASE
          WHEN b.is_posted = true THEN pocs.posted_output_cost
          ELSE COALESCE(ics.raw_input_cost, 0) + COALESCE(ec.extra_cost_total, 0)
        END,
        0
      ) AS batch_cost,

      COALESCE(
        CASE
          WHEN b.is_posted = true THEN pocs.posted_output_cost
          ELSE COALESCE(ics.raw_input_cost, 0) + COALESCE(ec.extra_cost_total, 0)
        END,
        0
      ) AS total_value,

      CASE
        WHEN COALESCE(o.output_qty, 0) = 0 THEN 0
        ELSE ROUND(
          (
            COALESCE(
              CASE
                WHEN b.is_posted = true THEN pocs.posted_output_cost
                ELSE COALESCE(ics.raw_input_cost, 0) + COALESCE(ec.extra_cost_total, 0)
              END,
              0
            ) / COALESCE(o.output_qty, 0)
          ),
          6
        )
      END AS output_unit_cost,

      b.posted_input_movement_id,
      b.posted_output_movement_id,
      b.created_by,
      b.created_at

    FROM mfg.batch b
    LEFT JOIN inv.product fp
      ON fp.product_id = b.finished_product_id
    LEFT JOIN app.location raw_loc
      ON raw_loc.location_id = b.raw_location_id
    LEFT JOIN app.location fg_loc
      ON fg_loc.location_id = b.fg_location_id
    LEFT JOIN input_summary i
      ON i.batch_id = b.batch_id
    LEFT JOIN output_summary o
      ON o.batch_id = b.batch_id
    LEFT JOIN extra_cost_summary ec
      ON ec.batch_id = b.batch_id
    LEFT JOIN input_cost_summary ics
      ON ics.batch_id = b.batch_id
    LEFT JOIN posted_output_cost_summary pocs
      ON pocs.batch_id = b.batch_id
    WHERE raw_loc.branch_id = $1
      AND fg_loc.branch_id = $1
      AND ($2::boolean OR (EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$3 AND ul.location_id=b.raw_location_id AND ul.is_active) AND EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$3 AND ul.location_id=b.fg_location_id AND ul.is_active)))
    ORDER BY b.created_at DESC;
  `;

  const { rows } = await pool.query(sql, [scope.branchId, Boolean(scope.allLocations), scope.userId]);
  return rows;
}

export async function getCleaningBatchByNo(batchNo, scope) {
  requireField(batchNo, "batch_no");

  const client = await pool.connect();

  try {
    const headerSql = `
      SELECT
        b.batch_id,
        b.batch_no,
        b.finished_product_id,
        fp.sku AS output_sku,
        fp.product_name AS finished_product_name,
        fp.product_name AS output_product_name,
        fp.product_name AS clean_product_name,
        b.bom_id,
        b.planned_qty,
        b.started_at,
        b.started_at::date AS batch_date,
        b.completed_at,
        b.status,
        b.created_by,
        b.created_at,
        b.is_posted,
        b.raw_location_id,
        raw_loc.location_code AS raw_location_code,
        raw_loc.location_name AS raw_location_name,
        b.fg_location_id,
        fg_loc.location_code AS fg_location_code,
        fg_loc.location_name AS fg_location_name,
        b.posted_input_movement_id,
        b.posted_output_movement_id
      FROM mfg.batch b
      LEFT JOIN inv.product fp 
        ON fp.product_id = b.finished_product_id
      LEFT JOIN app.location raw_loc 
        ON raw_loc.location_id = b.raw_location_id
      LEFT JOIN app.location fg_loc 
        ON fg_loc.location_id = b.fg_location_id
      WHERE b.batch_no = $1 AND raw_loc.branch_id=$2 AND fg_loc.branch_id=$2
        AND ($3::boolean OR (EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=b.raw_location_id AND ul.is_active) AND EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=b.fg_location_id AND ul.is_active)));
    `;

    const headerResult = await client.query(headerSql, [batchNo, scope.branchId, Boolean(scope.allLocations), scope.userId]);

    if (headerResult.rowCount === 0) {
      const err = new Error("Cleaning batch not found");
      err.status = 404;
      throw err;
    }

    const batch = headerResult.rows[0];

    const inputsSql = `
      SELECT
        bi.batch_input_id,
        bi.batch_id,
        bi.component_product_id,
        p.sku AS component_sku,
        p.product_name AS component_product_name,
        bi.lot_id,
        l.lot_code,
        bi.qty_used,
        COALESCE(sml.unit_cost, lc.unit_cost, 0) AS unit_cost,
        bi.qty_used * COALESCE(sml.unit_cost, lc.unit_cost, 0) AS line_total
      FROM mfg.batch_input bi
      JOIN mfg.batch b
        ON b.batch_id = bi.batch_id
      LEFT JOIN inv.product p 
        ON p.product_id = bi.component_product_id
      LEFT JOIN inv.lot l 
        ON l.lot_id = bi.lot_id
      LEFT JOIN inv.stock_movement_line sml
        ON sml.movement_id = b.posted_input_movement_id
       AND sml.product_id = bi.component_product_id
       AND sml.lot_id = bi.lot_id
      LEFT JOIN inv.v_lot_unit_cost lc
        ON lc.lot_id = bi.lot_id
      WHERE bi.batch_id = $1
      ORDER BY bi.batch_input_id;
    `;

    const outputsSql = `
      SELECT
        bo.batch_output_id,
        bo.batch_id,
        bo.lot_id,
        l.lot_code,
        bo.qty_produced,
        COALESCE(sml.unit_cost, 0) AS unit_cost,
        bo.qty_produced * COALESCE(sml.unit_cost, 0) AS line_total
      FROM mfg.batch_output bo
      JOIN mfg.batch b
        ON b.batch_id = bo.batch_id
      LEFT JOIN inv.lot l 
        ON l.lot_id = bo.lot_id
      LEFT JOIN inv.stock_movement_line sml
        ON sml.movement_id = b.posted_output_movement_id
       AND sml.product_id = b.finished_product_id
       AND sml.lot_id = bo.lot_id
      WHERE bo.batch_id = $1
      ORDER BY bo.batch_output_id;
    `;

    const extraCostsSql = `
      SELECT
        batch_extra_cost_id,
        batch_id,
        cost_type,
        description,
        amount,
        created_at
      FROM mfg.batch_extra_cost
      WHERE batch_id = $1
      ORDER BY created_at, cost_type;
    `;

    const [inputsResult, outputsResult, extraCostsResult] = await Promise.all([
      client.query(inputsSql, [batch.batch_id]),
      client.query(outputsSql, [batch.batch_id]),
      client.query(extraCostsSql, [batch.batch_id]),
    ]);

    const totalInput = inputsResult.rows.reduce(
      (sum, row) => sum + Number(row.qty_used || 0),
      0
    );

    const totalOutput = outputsResult.rows.reduce(
      (sum, row) => sum + Number(row.qty_produced || 0),
      0
    );

    const totalWaste = Math.max(totalInput - totalOutput, 0);

    const rawInputCost = inputsResult.rows.reduce(
      (sum, row) => sum + Number(row.line_total || 0),
      0
    );

    const extraCostTotal = extraCostsResult.rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    const postedOutputCost = outputsResult.rows.reduce(
      (sum, row) => sum + Number(row.line_total || 0),
      0
    );

    const totalBatchCost =
      Number(postedOutputCost || 0) > 0
        ? Number(postedOutputCost || 0)
        : Number(rawInputCost || 0) + Number(extraCostTotal || 0);

    const outputUnitCost =
      totalOutput > 0 ? Number((totalBatchCost / totalOutput).toFixed(6)) : 0;

    const yieldPct =
      totalInput > 0 ? Number(((totalOutput / totalInput) * 100).toFixed(2)) : 0;

    const inputProductName = inputsResult.rows
      .map((row) => row.component_product_name)
      .filter(Boolean)
      .join(", ");

    const inputLotCode = inputsResult.rows
      .map((row) => row.lot_code)
      .filter(Boolean)
      .join(", ");

    const outputLotCode = outputsResult.rows
      .map((row) => row.lot_code)
      .filter(Boolean)
      .join(", ");

    const inputLines = inputsResult.rows.map((row) => ({
      line_type: "INPUT",
      product_name: row.component_product_name,
      product_sku: row.component_sku,
      lot_code: row.lot_code,
      qty: row.qty_used,
      quantity: row.qty_used,
      unit_cost: row.unit_cost,
      line_total: row.line_total,
      notes: "Raw stock consumed",
      ...row,
    }));

    const extraCostLines = extraCostsResult.rows.map((row) => ({
      line_type: "EXTRA_COST",
      product_name: row.cost_type,
      product_sku: "",
      lot_code: "",
      location_name: "",
      qty: 1,
      quantity: 1,
      unit_cost: row.amount,
      line_total: row.amount,
      notes: row.description || "Direct cleaning cost",
      ...row,
    }));

    const outputLines = outputsResult.rows.map((row) => ({
      line_type: "OUTPUT",
      product_name: batch.finished_product_name,
      product_sku: batch.output_sku,
      lot_code: row.lot_code,
      qty: row.qty_produced,
      quantity: row.qty_produced,
      unit_cost: row.unit_cost || outputUnitCost,
      line_total: row.line_total || totalBatchCost,
      notes: "Clean stock produced",
      ...row,
    }));

    return {
      ...batch,

      input_product_name: inputProductName,
      raw_product_name: inputProductName,
      component_product_name: inputProductName,

      output_product_name: batch.finished_product_name,
      clean_product_name: batch.finished_product_name,

      input_lot_code: inputLotCode,
      raw_lots: inputLotCode,
      output_lot_code: outputLotCode,
      clean_lots: outputLotCode,

      input_qty: totalInput,
      total_input_qty: totalInput,
      total_raw_qty_used: totalInput,
      raw_qty: totalInput,

      output_qty: totalOutput,
      total_output_qty: totalOutput,
      total_clean_qty_produced: totalOutput,
      cleaned_qty: totalOutput,

      waste_qty: totalWaste,
      loss_qty: totalWaste,
      implied_waste_or_loss_qty: totalWaste,

      yield_pct: yieldPct,
      yield_percentage: yieldPct,
      yield_percent: yieldPct,

      raw_input_cost: rawInputCost,
      input_cost: rawInputCost,

      extra_cost_total: extraCostTotal,

      total_cost: totalBatchCost,
      batch_cost: totalBatchCost,
      total_value: totalBatchCost,

      output_cost: postedOutputCost,
      posted_output_cost: postedOutputCost,
      output_unit_cost: outputUnitCost,

      inputs: inputsResult.rows,
      outputs: outputsResult.rows,
      extra_costs: extraCostsResult.rows,
      lines: [...inputLines, ...extraCostLines, ...outputLines],

      totals: {
        total_input_qty: totalInput,
        total_output_qty: totalOutput,
        implied_waste_or_loss_qty: totalWaste,
        yield_pct: yieldPct,
        raw_input_cost: rawInputCost,
        input_cost: rawInputCost,
        extra_cost_total: extraCostTotal,
        total_cost: totalBatchCost,
        batch_cost: totalBatchCost,
        total_value: totalBatchCost,
        output_cost: postedOutputCost,
        posted_output_cost: postedOutputCost,
        output_unit_cost: outputUnitCost,
      },
    };
  } finally {
    client.release();
  }
}

export async function createCleaningBatch(payload, scope) {
  const {
    batch_no,
    finished_product_id,
    bom_id = null,
    planned_qty,
    started_at = null,
    raw_location_id,
    fg_location_id,
    created_by = null,
    inputs = [],
    outputs = [],
    extra_costs = [],
  } = payload || {};

  requireField(finished_product_id, "finished_product_id");
  requireField(planned_qty, "planned_qty");
  requireField(raw_location_id, "raw_location_id");
  requireField(fg_location_id, "fg_location_id");

  if (!isPositiveNumber(planned_qty)) {
    const err = new Error("planned_qty must be greater than zero");
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(inputs) || inputs.length === 0) {
    const err = new Error("At least one raw input line is required");
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(outputs) || outputs.length === 0) {
    const err = new Error("At least one clean output line is required");
    err.status = 400;
    throw err;
  }

  for (const [index, line] of inputs.entries()) {
    requireField(
      line.component_product_id,
      `inputs[${index}].component_product_id`
    );
    requireField(line.lot_id, `inputs[${index}].lot_id`);
    requireField(line.qty_used, `inputs[${index}].qty_used`);

    if (!isPositiveNumber(line.qty_used)) {
      const err = new Error(`inputs[${index}].qty_used must be greater than zero`);
      err.status = 400;
      throw err;
    }
  }

  for (const [index, line] of outputs.entries()) {
    requireField(line.qty_produced, `outputs[${index}].qty_produced`);

    if (!isPositiveNumber(line.qty_produced)) {
      const err = new Error(
        `outputs[${index}].qty_produced must be greater than zero`
      );
      err.status = 400;
      throw err;
    }
  }

  const normalizedExtraCosts = collectExtraCosts(extra_costs, outputs);
  validateExtraCosts(normalizedExtraCosts);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await requireCleaningLocations(client, scope, [raw_location_id, fg_location_id]);

    const finalBatchNo =
      batch_no ||
      `CLN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now()}`;

    const batchSql = `
      INSERT INTO mfg.batch (
        batch_id,
        batch_no,
        finished_product_id,
        bom_id,
        planned_qty,
        started_at,
        status,
        created_by,
        created_at,
        is_posted,
        raw_location_id,
        fg_location_id
      )
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        COALESCE($5::timestamptz, now()),
        'PLANNED',
        $6,
        now(),
        false,
        $7,
        $8
      )
      RETURNING *;
    `;

    const batchResult = await client.query(batchSql, [
      finalBatchNo,
      finished_product_id,
      bom_id,
      Number(planned_qty),
      started_at,
      created_by,
      raw_location_id,
      fg_location_id,
    ]);

    const batch = batchResult.rows[0];

    for (const line of inputs) {
      const inputSql = `
        INSERT INTO mfg.batch_input (
          batch_input_id,
          batch_id,
          component_product_id,
          lot_id,
          qty_used
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4
        );
      `;

      await client.query(inputSql, [
        batch.batch_id,
        line.component_product_id,
        line.lot_id,
        Number(line.qty_used),
      ]);
    }

    for (const line of outputs) {
      let finalOutputLotId = line.lot_id || null;

      if (finalOutputLotId) {
        const lotCheck = await client.query(
          `
          SELECT lot_id
          FROM inv.lot
          WHERE lot_id = $1
            AND product_id = $2;
          `,
          [finalOutputLotId, finished_product_id]
        );

        if (lotCheck.rowCount === 0) {
          const err = new Error(
            "Selected output lot does not belong to the finished product"
          );
          err.status = 400;
          throw err;
        }
      } else {
        const lotCodeResult = await client.query(
          `
          SELECT inv.next_lot_code($1::uuid) AS lot_code;
          `,
          [finished_product_id]
        );

        const generatedLotCode = lotCodeResult.rows[0]?.lot_code;

        if (!generatedLotCode) {
          const err = new Error("Failed to generate output lot code");
          err.status = 500;
          throw err;
        }

        const lotResult = await client.query(
          `
          SELECT inv.get_or_create_lot(
            $1::uuid,
            $2::text,
            $3::date,
            NULL::date,
            'CLEANING_BATCH'::text,
            $4::uuid
          ) AS lot_id;
          `,
          [
            finished_product_id,
            generatedLotCode,
            line.expiry_date || null,
            batch.batch_id,
          ]
        );

        finalOutputLotId = lotResult.rows[0]?.lot_id;

        if (!finalOutputLotId) {
          const err = new Error("Failed to create output lot");
          err.status = 500;
          throw err;
        }
      }

      const outputSql = `
        INSERT INTO mfg.batch_output (
          batch_output_id,
          batch_id,
          lot_id,
          qty_produced
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3
        );
      `;

      await client.query(outputSql, [
        batch.batch_id,
        finalOutputLotId,
        Number(line.qty_produced),
      ]);
    }

    for (const cost of normalizedExtraCosts) {
      await client.query(
        `
        INSERT INTO mfg.batch_extra_cost (
          batch_extra_cost_id,
          batch_id,
          cost_type,
          description,
          amount,
          created_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          now()
        );
        `,
        [
          batch.batch_id,
          cost.cost_type,
          cost.description || null,
          Number(cost.amount ?? 0),
        ]
      );
    }

    await client.query("COMMIT");

    return getCleaningBatchByNo(batch.batch_no, scope);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      error.status = 409;
      error.message = "Cleaning batch number already exists";
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function postCleaningBatchByNo(batchNo, scope) {
  requireField(batchNo, "batch_no");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const batchCheck = await client.query(
      `
        SELECT b.batch_id,b.batch_no,b.status,b.is_posted,b.raw_location_id,b.fg_location_id
        FROM mfg.batch b
        JOIN app.location raw_loc ON raw_loc.location_id=b.raw_location_id
        JOIN app.location fg_loc ON fg_loc.location_id=b.fg_location_id
        WHERE b.batch_no=$1 AND raw_loc.branch_id=$2 AND fg_loc.branch_id=$2
          AND raw_loc.is_active AND fg_loc.is_active
          AND ($3::boolean OR (EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=b.raw_location_id AND ul.is_active) AND EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=b.fg_location_id AND ul.is_active)))
        FOR UPDATE;
      `,
      [batchNo, scope.branchId, Boolean(scope.allLocations), scope.userId]
    );

    if (batchCheck.rowCount === 0) {
      const err = new Error("Cleaning batch not found");
      err.status = 404;
      throw err;
    }

    const batch = batchCheck.rows[0];

    if (batch.is_posted === true) {
      const err = new Error("Cleaning batch is already posted");
      err.status = 409;
      throw err;
    }

    await client.query(
      `
        SELECT mfg.post_batch_by_no($1) AS posted_batch_id;
      `,
      [batchNo]
    );

    await client.query("COMMIT");

    return getCleaningBatchByNo(batchNo, scope);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCleaningBatchByNo(batchNo, scope) {
  requireField(batchNo, "batch_no");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const batchResult = await client.query(
      `
        SELECT b.batch_id,b.batch_no,b.is_posted
        FROM mfg.batch b
        JOIN app.location raw_loc ON raw_loc.location_id=b.raw_location_id
        JOIN app.location fg_loc ON fg_loc.location_id=b.fg_location_id
        WHERE b.batch_no=$1 AND raw_loc.branch_id=$2 AND fg_loc.branch_id=$2
          AND raw_loc.is_active AND fg_loc.is_active
          AND ($3::boolean OR (EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=b.raw_location_id AND ul.is_active) AND EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=b.fg_location_id AND ul.is_active)))
        FOR UPDATE;
      `,
      [batchNo, scope.branchId, Boolean(scope.allLocations), scope.userId]
    );

    if (batchResult.rowCount === 0) {
      const err = new Error("Cleaning batch not found");
      err.status = 404;
      throw err;
    }

    const batch = batchResult.rows[0];

    if (batch.is_posted === true) {
      const err = new Error("Posted cleaning batches cannot be deleted");
      err.status = 409;
      throw err;
    }

    await client.query("DELETE FROM mfg.batch_extra_cost WHERE batch_id = $1", [
      batch.batch_id,
    ]);

    await client.query("DELETE FROM mfg.batch_output WHERE batch_id = $1", [
      batch.batch_id,
    ]);

    await client.query("DELETE FROM mfg.batch_input WHERE batch_id = $1", [
      batch.batch_id,
    ]);

    await client.query("DELETE FROM mfg.batch WHERE batch_id = $1", [
      batch.batch_id,
    ]);

    await client.query("COMMIT");

    return {
      message: "Cleaning batch deleted successfully",
      batch_no: batchNo,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCleaningBatchSummaryReport(scope) {
  return listCleaningBatches(scope);
}

async function requireCleaningLocations(client, scope, locationIds) {
  if (!scope?.branchId || !scope?.userId) {
    const err = new Error("Branch context is required for cleaning operations");
    err.status = 403;
    throw err;
  }
  const result = await client.query(
    `SELECT l.location_id FROM app.location l WHERE l.location_id=ANY($1::uuid[]) AND l.is_active AND l.branch_id=$2 AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=l.location_id AND ul.is_active))`,
    [locationIds, scope.branchId, Boolean(scope.allLocations), scope.userId]
  );
  if (result.rowCount !== new Set(locationIds.map(String)).size) {
    const err = new Error("Cleaning locations must be active and authorized within the selected branch");
    err.status = 403;
    throw err;
  }
}
