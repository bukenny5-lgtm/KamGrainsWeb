import { pool } from "../db.js";
import { lockStockItems } from "../services/stockLock.service.js";

export async function postGoodsReceiptController(req, res) {
  const client = await pool.connect();

  try {
    const { grnNo } = req.params;

    if (!grnNo) {
      return res.status(400).json({
        success: false,
        message: "GRN number is required.",
      });
    }

    await client.query("BEGIN");

    const grnCheck = await client.query(
      `
      SELECT grn_id, grn_no, status, is_posted
      FROM pur.goods_receipt
      WHERE grn_no = $1
      FOR UPDATE;
      `,
      [grnNo]
    );

    if (grnCheck.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: `Goods receipt ${grnNo} was not found.`,
      });
    }

    const grn = grnCheck.rows[0];

    if (grn.is_posted === true) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: `Goods receipt ${grnNo} is already posted.`,
      });
    }

    const lines = await client.query(
      `SELECT gr.location_id, grl.product_id
       FROM pur.goods_receipt gr
       JOIN pur.goods_receipt_line grl ON grl.grn_id=gr.grn_id
       WHERE gr.grn_no=$1
       ORDER BY grl.product_id`,
      [grnNo]
    );
    if (!lines.rowCount) throw new Error("Goods receipt has no stock lines.");
    await lockStockItems(client, lines.rows);

    await client.query(
      `
      SELECT pur.post_goods_receipt_by_no($1) AS result;
      `,
      [grnNo]
    );

    const postedResult = await client.query(
      `
      SELECT 
        grn_id,
        grn_no,
        supplier_id,
        receipt_date,
        po_id,
        status,
        is_posted,
        posted_movement_id,
        location_id,
        posted_journal_id,
        created_at
      FROM pur.goods_receipt
      WHERE grn_no = $1;
      `,
      [grnNo]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Goods receipt posted successfully.",
      data: postedResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Post goods receipt error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to post goods receipt.",
      error: error.message,
      detail: error.detail || null,
    });
  } finally {
    client.release();
  }
}
