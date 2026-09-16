/**
 * PHASE 4: FIFO PAYMENT ALLOCATION UPDATE
 * 
 * CRITICAL: Payment allocation order changes from payment_date to transaction_date
 * 
 * Context:
 * - KAM GRAINS uses FIFO (First In First Out) for payment allocation
 * - Previously: Payments allocated by PAYMENT_DATE (when payment was made)
 * - Updated: Payments allocated by INVOICE.TRANSACTION_DATE (business date)
 * 
 * Why this matters:
 * - With backdated invoices, FIFO must respect business dates, not system dates
 * - Example:
 *   Invoice A: transaction_date = 2026-05-01, created_at = 2026-06-15
 *   Invoice B: transaction_date = 2026-05-08, created_at = 2026-05-09
 *   Payment:   payment_date = 2026-06-20, transaction_date = 2026-06-20
 *   
 *   OLD logic: Payment applies to Invoice B first (earlier created_at)  <-- WRONG
 *   NEW logic: Payment applies to Invoice A first (earlier transaction_date) <-- CORRECT
 * 
 * Migration: Update FIFO payment allocation logic in backend routes
 * 
 * SQL Pattern:
 * OLD: SELECT * FROM sal.ar_payment_apply WHERE customer_id = $1 ORDER BY payment_date, payment_id
 * NEW: SELECT * FROM sal.ar_payment_apply WHERE customer_id = $1 ORDER BY COALESCE(transaction_date, created_at::date), payment_id
 * 
 * For invoices:
 * OLD: SELECT * FROM sal.ar_invoice WHERE customer_id = $1 ORDER BY invoice_date, ar_invoice_id
 * NEW: SELECT * FROM sal.ar_invoice WHERE customer_id = $1 ORDER BY COALESCE(transaction_date, created_at::date), ar_invoice_id
 */

-- ============================================================================
-- REFERENCE: FIFO PAYMENT ALLOCATION ALGORITHM
-- ============================================================================
--
-- This is NOT a SQL migration; it's a reference for backend implementation
-- Update the payment allocation logic in:
-- backend/src/routes/arPayments.routes.js
-- backend/src/routes/apPayments.routes.js
--
-- BEFORE (using payment_date):
-- ═════════════════════════════════════════════════════════════════════════
--
-- const allocatePaymentFIFO = (payment, invoices) => {
--   let remainingPayment = payment.amount;
--   const allocations = [];
--   
--   // Order invoices by PAYMENT_DATE (OLD - wrong for backdates)
--   const orderedInvoices = invoices.sort((a, b) => {
--     return new Date(a.payment_date) - new Date(b.payment_date);
--   });
--   
--   for (const invoice of orderedInvoices) {
--     const invoiceBalance = invoice.amount_due;
--     const allocationAmount = Math.min(remainingPayment, invoiceBalance);
--     
--     allocations.push({
--       invoice_id: invoice.id,
--       allocation_amount: allocationAmount,
--       payment_date: payment.payment_date
--     });
--     
--     remainingPayment -= allocationAmount;
--     if (remainingPayment <= 0) break;
--   }
--   
--   return allocations;
-- };
--
-- ═════════════════════════════════════════════════════════════════════════
--
-- AFTER (using transaction_date):
-- ═════════════════════════════════════════════════════════════════════════
--
-- const allocatePaymentFIFO = (payment, invoices) => {
--   let remainingPayment = payment.amount;
--   const allocations = [];
--   
--   // Order invoices by TRANSACTION_DATE (business date)
--   // Use created_at as fallback for records without transaction_date
--   const orderedInvoices = invoices.sort((a, b) => {
--     const dateA = a.transaction_date ? new Date(a.transaction_date) : new Date(a.created_at);
--     const dateB = b.transaction_date ? new Date(b.transaction_date) : new Date(b.created_at);
--     return dateA - dateB;
--   });
--   
--   for (const invoice of orderedInvoices) {
--     const invoiceBalance = invoice.amount_due;
--     const allocationAmount = Math.min(remainingPayment, invoiceBalance);
--     
--     allocations.push({
--       invoice_id: invoice.id,
--       allocation_amount: allocationAmount,
--       transaction_date: invoice.transaction_date || invoice.created_at,
--       payment_date: payment.transaction_date || payment.payment_date
--     });
--     
--     remainingPayment -= allocationAmount;
--     if (remainingPayment <= 0) break;
--   }
--   
--   return allocations;
-- };
--
-- ═════════════════════════════════════════════════════════════════════════
--
-- KEY CHANGES:
-- 1. Sort by transaction_date (not payment_date) for age ordering
-- 2. Use COALESCE(transaction_date, created_at::date) for backward compatibility
-- 3. Ensure payment also uses transaction_date
-- 4. Test thoroughly with backdated invoices
--
-- ============================================================================
-- SQL PATTERNS FOR BACKEND QUERIES
-- ============================================================================

-- Pattern 1: Get unpaid invoices in FIFO order
-- OLD:
-- SELECT * FROM sal.ar_invoice 
-- WHERE customer_id = $1 AND outstanding_amount > 0
-- ORDER BY invoice_date, ar_invoice_id;
--
-- NEW:
SELECT 
  ar_invoice_id,
  invoice_no,
  customer_id,
  COALESCE(transaction_date, created_at::date) AS business_date,
  invoice_date,
  created_at,
  amount_total,
  amount_paid,
  amount_total - amount_paid AS amount_due,
  backdate_flag,
  backdate_reason
FROM sal.ar_invoice 
WHERE customer_id = $1 
  AND (amount_total - amount_paid) > 0
ORDER BY COALESCE(transaction_date, created_at::date) ASC, ar_invoice_id ASC;

-- Pattern 2: Get supplier invoices in FIFO order
-- Similar to above, but for pur.ap_invoice
SELECT 
  ap_invoice_id,
  invoice_no,
  supplier_id,
  COALESCE(transaction_date, created_at::date) AS business_date,
  invoice_date,
  created_at,
  invoice_amount,
  paid_amount,
  invoice_amount - paid_amount AS amount_due,
  backdate_flag,
  backdate_reason
FROM pur.ap_invoice 
WHERE supplier_id = $1 
  AND (invoice_amount - paid_amount) > 0
ORDER BY COALESCE(transaction_date, created_at::date) ASC, ap_invoice_id ASC;

-- ============================================================================
-- TESTING SCENARIO
-- ============================================================================
--
-- Create test data:
--
-- 1. Invoice A: transaction_date = 2026-04-01, amount = 100,000
-- 2. Invoice B: transaction_date = 2026-05-01, amount = 50,000
-- 3. Invoice C: transaction_date = 2026-06-01, amount = 75,000
-- 4. Payment: transaction_date = 2026-06-15, amount = 120,000
--
-- Expected FIFO allocation:
--   Invoice A: -100,000 (paid in full)
--   Invoice B: -20,000 (partial payment)
--   Invoice C: 0 (not yet allocated)
--   Outstanding: Invoice B (-30,000 remaining) + Invoice C (-75,000) = -105,000
--
-- Verify the backend payment allocation route produces above results
--
-- ============================================================================
-- FILES TO UPDATE
-- ============================================================================
--
-- 1. backend/src/routes/arPayments.routes.js
--    - GET /api/ar-payments: Update invoice ordering in query
--    - POST /api/ar-payments: Update payment allocation logic
--    - Function: allocatePaymentToInvoices or similar
--
-- 2. backend/src/routes/apPayments.routes.js
--    - GET /api/ap-payments: Update invoice ordering in query
--    - POST /api/ap-payments: Update payment allocation logic
--    - Function: allocatePaymentToInvoices or similar
--
-- 3. Any payment allocation service/utility functions
--    - backend/src/services/paymentAllocation.js (if exists)
--    - backend/src/db.js functions for payment queries
--
-- ============================================================================
-- BACKWARD COMPATIBILITY
-- ============================================================================
--
-- Use COALESCE(transaction_date, created_at::date) in all queries
-- This ensures:
-- - Existing records (without transaction_date) still work
-- - New backdated records use business date
-- - No records are lost or skipped
--
-- ============================================================================
-- APPROVAL GATE
-- ============================================================================
--
-- This migration MUST be tested with backdated invoices before going to production
-- Test scenarios:
-- 1. Normal invoices (transaction_date = created_at::date) - should work as before
-- 2. Recently backdated (transaction_date = yesterday) - should apply FIFO correctly
-- 3. Heavily backdated (transaction_date = 60 days ago) - should respect old dates
-- 4. Mix of backdated and normal - should sort correctly
-- 5. Payment of exactly the amount of oldest invoice - should allocate fully
-- 6. Payment exceeding oldest invoices - should cascade to next
--
-- Run reconciliation after update to verify no allocation discrepancies
-- ============================================================================
