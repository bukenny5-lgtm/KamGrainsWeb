/**
 * Backdate Transaction Helper
 * 
 * Provides utilities for handling backdated transactions with audit trails
 * and permission validation.
 * 
 * Usage:
 * - Validate backdate permission: checkBackdatePermission(user, action)
 * - Prepare backdate fields: prepareBackdateFields(transactionDate, reason, user)
 * - Log backdate audit event: logBackdateAudit(tableName, recordId, details)
 */

import { query } from "../db.js";

/**
 * Check if user can create/edit backdated transactions
 * Only ADMIN and MANAGER roles allowed
 */
export function checkBackdatePermission(user) {
  if (!user || !user.roles) {
    return false;
  }

  const allowedRoles = ['ADMIN', 'MANAGER'];
  const userRoles = Array.isArray(user.roles)
    ? user.roles.map(r => {
        if (typeof r === 'string') return r.toUpperCase();
        return (r.role_code || r.role_name || r.name || r.code || '').toUpperCase();
      })
    : [];

  return userRoles.some(role => allowedRoles.includes(role));
}

/**
 * Determine if a transaction is backdated
 * Compares transaction_date with system date (today)
 */
export function isBackdated(transactionDate) {
  if (!transactionDate) {
    return false;
  }

  const txDate = new Date(transactionDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return txDate < today;
}

/**
 * Calculate days backdated
 * Returns positive number of days the transaction is backdated
 */
export function calculateDaysBackdated(transactionDate) {
  if (!transactionDate) {
    return 0;
  }

  const txDate = new Date(transactionDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = today - txDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Prepare backdate fields for transaction insert/update
 * 
 * Returns object:
 * {
 *   transaction_date: Date,
 *   backdate_flag: boolean,
 *   backdate_reason: string,
 *   backdate_approved_by: null,
 *   backdate_approved_at: null
 * }
 */
export function prepareBackdateFields(transactionDate, reason = null, user = null) {
  const backdated = isBackdated(transactionDate);

  return {
    transaction_date: transactionDate,
    backdate_flag: backdated,
    backdate_reason: backdated && reason ? reason : null,
    backdate_approved_by: null,  // Will be set during approval workflow
    backdate_approved_at: null   // Will be set during approval workflow
  };
}

/**
 * Validate backdate inputs
 * Throws error if validation fails
 */
export function validateBackdateInput(transactionDate, reason, user) {
  // Check permission
  if (!checkBackdatePermission(user)) {
    throw new Error("You do not have permission to create backdated transactions");
  }

  // Check transaction date is valid
  if (!transactionDate) {
    throw new Error("Transaction date is required");
  }

  const txDate = new Date(transactionDate);
  if (isNaN(txDate.getTime())) {
    throw new Error("Invalid transaction date format");
  }

  // If backdated, reason is required
  if (isBackdated(txDate) && !reason) {
    throw new Error("Reason is required for backdated transactions");
  }

  // Check reason length (max 500 chars)
  if (reason && reason.length > 500) {
    throw new Error("Reason must be 500 characters or less");
  }

  return true;
}

/**
 * Log backdated transaction to audit table
 * 
 * @param {string} tableName - e.g., 'sal.delivery', 'sal.ar_invoice'
 * @param {string} recordId - UUID of record
 * @param {object} details - { created_by, transaction_date, backdate_reason }
 */
export async function logBackdateAudit(tableName, recordId, details) {
  try {
    const {
      created_by,
      transaction_date,
      backdate_reason,
      approved_by = null,
      approved_at = null
    } = details;

    const daysBackdated = calculateDaysBackdated(transaction_date);

    await query(
      `INSERT INTO audit.backdate_event 
       (table_name, record_id, created_by, created_date, system_date, 
        days_backdated, backdate_reason, approved_by, approved_at, change_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CREATE')`,
      [
        tableName,
        recordId,
        created_by,
        transaction_date,
        new Date(),
        daysBackdated,
        backdate_reason,
        approved_by,
        approved_at
      ]
    );
  } catch (error) {
    // Log audit failures but don't block transaction
    console.error('Failed to log backdate audit:', error);
  }
}

/**
 * Mark backdated transaction as approved
 * Called during approval workflow
 */
export async function approveBackdateTransaction(
  tableName,
  recordId,
  approvedBy,
  approvalNote = null
) {
  try {
    // Update the transaction record
    const tableConfig = {
      'sal.delivery': 'sal.delivery',
      'sal.ar_invoice': 'sal.ar_invoice',
      'sal.ar_payment_apply': 'sal.ar_payment_apply',
      'pur.ap_invoice': 'pur.ap_invoice',
      'pur.ap_payment': 'pur.ap_payment'
    };

    if (!tableConfig[tableName]) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

    // Update approval in transaction table
    await query(
      `UPDATE ${tableName}
       SET backdate_approved_by = $1, backdate_approved_at = NOW()
       WHERE ${getRecordIdColumn(tableName)} = $2`,
      [approvedBy, recordId]
    );

    // Update audit log
    await query(
      `UPDATE audit.backdate_event
       SET approved_by = $1, approved_at = NOW()
       WHERE table_name = $2 AND record_id = $3
       ORDER BY created_at DESC LIMIT 1`,
      [approvedBy, tableName, recordId]
    );

    return true;
  } catch (error) {
    console.error('Failed to approve backdate:', error);
    throw error;
  }
}

/**
 * Get primary key column name for a transaction table
 */
function getRecordIdColumn(tableName) {
  const columnMap = {
    'sal.delivery': 'delivery_id',
    'sal.ar_invoice': 'ar_invoice_id',
    'sal.ar_payment_apply': 'ar_payment_apply_id',
    'pur.ap_invoice': 'ap_invoice_id',
    'pur.ap_payment': 'ap_payment_id'
  };

  return columnMap[tableName] || 'id';
}

/**
 * Get backdate audit trail for a transaction
 */
export async function getBackdateAuditTrail(tableName, recordId) {
  try {
    const result = await query(
      `SELECT 
         backdate_event_id,
         table_name,
         record_id,
         created_by,
         created_date,
         system_date,
         days_backdated,
         backdate_reason,
         approved_by,
         approved_at,
         change_type,
         created_at
       FROM audit.backdate_event
       WHERE table_name = $1 AND record_id = $2
       ORDER BY created_at DESC`,
      [tableName, recordId]
    );

    return result.rows;
  } catch (error) {
    console.error('Failed to get backdate audit trail:', error);
    return [];
  }
}

/**
 * Query heavily backdated transactions
 * Useful for management review and risk assessment
 */
export async function getHeavilyBackdatedTransactions(minDays = 30) {
  try {
    const result = await query(
      `SELECT 
         backdate_event_id,
         table_name,
         record_id,
         created_by,
         created_date,
         system_date,
         days_backdated,
         backdate_reason,
         approved_by,
         approved_at
       FROM audit.backdate_event
       WHERE days_backdated >= $1
       ORDER BY days_backdated DESC, created_at DESC
       LIMIT 100`,
      [minDays]
    );

    return result.rows;
  } catch (error) {
    console.error('Failed to query heavily backdated transactions:', error);
    return [];
  }
}

export default {
  checkBackdatePermission,
  isBackdated,
  calculateDaysBackdated,
  prepareBackdateFields,
  validateBackdateInput,
  logBackdateAudit,
  approveBackdateTransaction,
  getBackdateAuditTrail,
  getHeavilyBackdatedTransactions
};
