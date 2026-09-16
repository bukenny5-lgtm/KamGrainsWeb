export type ApiPayload = unknown;

export type ApiListResponse<T, Key extends string = "data"> = {
  success: boolean;
  count: number;
} & Record<Key, T[]>;

export type ApInvoiceSummaryRow = {
  ap_invoice_id: string;
  invoice_no: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  grn_id?: string | null;
  grn_no?: string | null;
  total_qty?: string | number | null;
  invoice_total?: string | number | null;
  total_paid?: string | number | null;
  amount_paid?: string | number | null;
  balance_due?: string | number | null;
  balance?: string | number | null;
  is_posted?: boolean | null;
  posted_journal_id?: string | null;
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  transaction_date?: string | null;
  created_at?: string | null;
};

export type ApInvoiceLineRow = {
  ap_invoice_line_id: string;
  product_id?: string | null;
  sku?: string | null;
  product_name?: string | null;
  description?: string | null;
  qty?: string | number | null;
  unit_price?: string | number | null;
  line_total?: string | number | null;
  uom_code?: string | null;
};

export type ApInvoiceSummaryResponse = ApiListResponse<ApInvoiceSummaryRow>;

export type ApInvoiceDetailResponse = {
  success: boolean;
  ap_invoice: ApInvoiceSummaryRow;
  lines: ApInvoiceLineRow[];
};

export type GoodsReceiptSummaryRow = {
  grn_id: string;
  grn_no: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  receipt_date?: string | null;
  status?: string | null;
  is_posted?: boolean | null;
  po_id?: string | null;
  po_no?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_code?: string | null;
  line_count?: string | number | null;
  total_delivered_qty?: string | number | null;
  total_accepted_qty?: string | number | null;
  total_rejected_qty?: string | number | null;
  total_shortage_qty?: string | number | null;
  total_excess_qty?: string | number | null;
  total_grn_value?: string | number | null;
  total_value?: string | number | null;
  grn_total?: string | number | null;
  total_received_value?: string | number | null;
  posted_movement_id?: string | null;
  posted_journal_id?: string | null;
  created_at?: string | null;
};

export type GoodsReceiptSummaryResponse = ApiListResponse<GoodsReceiptSummaryRow>;

export type ApInvoicesResponse = ApiListResponse<ApInvoiceSummaryRow, "ap_invoices">;

export type ApInvoiceMutationResponse = {
  success: boolean;
  message: string;
  ap_invoice?: ApInvoiceSummaryRow;
  data?: ApInvoiceSummaryRow;
};
// AP PAYMENT TYPES — add below the existing AP Invoice types

export type ApPaymentSummaryRow = {
  ap_payment_id: string;
  payment_no: string;
  supplier_id?: string | null;
  supplier_name?: string | null;

  payment_date?: string | null;
  amount?: string | number | null;
  method?: string | null;
  reference?: string | null;

  created_at?: string | null;
  posted_journal_id?: string | null;
  reversal_journal_id?: string | null;

  status?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;

  transaction_date?: string | null;
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;

  is_posted?: boolean | null;

  invoice_count?: string | number | null;
  applied_amount?: string | number | null;
  unapplied_amount?: string | number | null;
  applied_invoices?: string | null;
};

export type ApPaymentApplicationRow = {
  ap_payment_id: string;
  ap_invoice_id: string;

  invoice_no?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  status?: string | null;

  invoice_total?: string | number | null;
  amount_paid?: string | number | null;
  invoice_balance?: string | number | null;

  applied_amount?: string | number | null;
};

export type ApPaymentHeader = {
  ap_payment_id: string;
  payment_no: string;

  supplier_id?: string | null;
  supplier_name?: string | null;

  payment_date?: string | null;
  amount?: string | number | null;
  method?: string | null;
  reference?: string | null;

  created_at?: string | null;
  posted_journal_id?: string | null;
  reversal_journal_id?: string | null;

  status?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;

  transaction_date?: string | null;
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;

  is_posted?: boolean | null;
};

/**
 * GET /ap-payments/reports/summary
 */
export type ApPaymentSummaryResponse =
  ApiListResponse<ApPaymentSummaryRow>;

/**
 * GET /ap-payments
 * Backend uses "ap_payments" instead of "data".
 */
export type ApPaymentsResponse =
  ApiListResponse<ApPaymentSummaryRow, "ap_payments">;

/**
 * GET /ap-payments/:paymentId
 */
export type ApPaymentDetailResponse = {
  success: boolean;
  ap_payment: ApPaymentHeader;
  applications: ApPaymentApplicationRow[];
};

/**
 * POST /ap-payments
 * PATCH /ap-payments/:paymentId
 */
export type ApPaymentMutationResponse = {
  success: boolean;
  message: string;
  ap_payment?: ApPaymentHeader;
  applications?: Array<{
    ap_payment_id: string;
    ap_invoice_id: string;
    amount: string | number;
  }>;
};

/**
 * DELETE /ap-payments/:paymentId
 */
export type ApPaymentDeleteResponse = {
  success: boolean;
  message: string;
};

/**
 * POST /ap-payments/:paymentId/post
 */
export type ApPaymentPostResponse = {
  success: boolean;
  message: string;
  result?: unknown;
  purchase_order_statuses?: unknown;
};

/**
 * POST /ap-payments/:paymentId/void
 */
export type ApPaymentVoidResponse = {
  success: boolean;
  payment_id?: string;
  original_journal_id?: string | null;
  reversal_journal_id?: string | null;
  status?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  message: string;
};

export type SupplierOpenInvoiceRow = {
  ap_invoice_id: string;
  invoice_no: string;

  invoice_date?: string | null;
  due_date?: string | null;
  status?: string | null;

  transaction_date?: string | null;
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;

  invoice_total?: string | number | null;
  amount_paid?: string | number | null;
  balance?: string | number | null;
};

export type SupplierOpenInvoicesResponse = {
  success: boolean;
  count: number;
  open_invoices: SupplierOpenInvoiceRow[];
};
// ============================================================
// AR INVOICES
// ============================================================

export interface ArInvoiceSummaryRow {
  ar_invoice_id: string;
  invoice_no: string;

  customer_id?: string | null;
  customer_name?: string | null;

  delivery_id?: string | null;
  delivery_no?: string | null;
  so_no?: string | null;

  invoice_date?: string | null;
  due_date?: string | null;
  transaction_date?: string | null;

  status?: string | null;

  line_count?: string | number | null;
  total_qty?: string | number | null;

  invoice_total: string | number;
  total_paid?: string | number | null;
  amount_paid?: string | number | null;
  balance_due?: string | number | null;
  balance?: string | number | null;

  is_posted?: boolean | null;
  posted_journal_id?: string | null;
  posted_journal_no?: string | null;

  reversal_journal_id?: string | null;
  reversal_journal_no?: string | null;

  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;

  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;

  created_at?: string | null;
}

/**
 * Delivery rows used by the AR Invoice screen when selecting
 * posted deliveries available for invoicing.
 *
 * Keep this compatible with the delivery fields returned by
 * the AR invoice client/API layer.
 */
export interface ArInvoiceDeliveryRow {
  delivery_id: string;
  delivery_no: string;

  customer_id?: string | null;
  customer_name?: string | null;

  transaction_date?: string | null;
  delivery_date?: string | null;

  status?: string | null;
  is_posted?: boolean | null;

  sales_order_id?: string | null;
  so_no?: string | null;

  line_count?: string | number | null;
  total_qty?: string | number | null;
  delivery_total?: string | number | null;

  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;

  created_at?: string | null;
}

export interface ArInvoiceLine {
  ar_invoice_line_id: string;
  ar_invoice_id: string;

  product_id?: string | null;

  sku?: string | null;
  product_name?: string | null;
  uom_code?: string | null;

  description?: string | null;

  qty?: string | number | null;
  sell_qty?: string | number | null;
  sell_uom_code?: string | null;
  base_qty?: string | number | null;

  unit_price?: string | number | null;
  pieces_per_carton?: string | number | null;

  line_total?: string | number | null;
}

export interface ArInvoice {
  ar_invoice_id: string;
  invoice_no: string;

  customer_id?: string | null;
  customer_name?: string | null;

  delivery_id?: string | null;
  delivery_no?: string | null;

  so_no?: string | null;

  invoice_date?: string | null;
  due_date?: string | null;
  transaction_date?: string | null;

  status?: string | null;

  invoice_total: string | number;
  total_paid?: string | number | null;
  amount_paid?: string | number | null;
  balance_due?: string | number | null;
  balance?: string | number | null;

  is_posted?: boolean | null;

  posted_journal_id?: string | null;
  posted_journal_no?: string | null;

  reversal_journal_id?: string | null;
  reversal_journal_no?: string | null;

  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;

  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;

  created_at?: string | null;
}

/**
 * GET /api/ar-invoices
 *
 * Backend response:
 * {
 *   success: true,
 *   count: number,
 *   ar_invoices: [...]
 * }
 */
export type ArInvoicesResponse =
  ApiListResponse<ArInvoiceSummaryRow, "ar_invoices">;

/**
 * GET /api/ar-invoices/reports/summary
 *
 * Backend response:
 * {
 *   success: true,
 *   count: number,
 *   data: [...]
 * }
 */
export type ArInvoiceSummaryResponse =
  ApiListResponse<ArInvoiceSummaryRow>;

/**
 * GET /api/ar-invoices/by-no/:invoiceNo
 * GET /api/ar-invoices/:invoiceId
 *
 * Backend response:
 * {
 *   success: true,
 *   ar_invoice: {...},
 *   lines: [...]
 * }
 */
export interface ArInvoiceDetailResponse {
  success: boolean;
  ar_invoice: ArInvoice;
  lines: ArInvoiceLine[];
  receipt_applications: ArInvoiceReceiptApplication[];
  message?: string;
}

export interface ArInvoiceReceiptApplication {
  ar_payment_id: string;
  receipt_no: string;
  payment_date?: string | null;
  transaction_date?: string | null;
  applied_amount: string | number;
  method?: string | null;
  reference?: string | null;
  receipt_status?: string | null;
  posted_journal_id?: string | null;
  posted?: boolean | null;
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  created_at?: string | null;
}

/**
 * POST /api/ar-invoices
 * POST /api/ar-invoices/from-delivery/:deliveryNo
 */
export interface ArInvoiceMutationResponse {
  success: boolean;
  message: string;

  invoice_no?: string;

  ar_invoice?: ArInvoice;

  data?: ArInvoice | ArInvoiceSummaryRow;

  lines?: ArInvoiceLine[];
}

export interface CreateArInvoicePayload {
  delivery_id: string;
  invoice_date: string;
  due_date?: string | null;
}

/**
 * POST /api/ar-invoices/:invoiceNo/post
 */
export interface ArInvoicePostResponse {
  success: boolean;
  message: string;

  result?: unknown;

  data?: ArInvoice | ArInvoiceSummaryRow;
}

/**
 * POST /api/ar-invoices/:invoiceNo/void
 */
export interface ArInvoiceVoidResponse {
  success: boolean;
  message: string;

  invoice_no?: string;
  status?: string | null;

  reversal_journal_id?: string | null;
  original_journal_id?: string | null;

  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;

  ar_invoice?: ArInvoice;
  data?: ArInvoice | {
    ar_invoice?: ArInvoice;
  };
}

/**
 * DELETE /api/ar-invoices/:invoiceId
 *
 * Currently the supplied backend route does not define DELETE,
 * but this type is retained because client.ts imports it.
 */
export interface ArInvoiceDeleteResponse {
  success: boolean;
  message: string;
}

export interface ArInvoiceLine {
  ar_invoice_line_id: string;
  ar_invoice_id: string;

  product_id?: string | null;

  sku?: string | null;
  product_name?: string | null;
  uom_code?: string | null;

  description?: string | null;

  qty?: string | number | null;
  sell_qty?: string | number | null;
  sell_uom_code?: string | null;
  base_qty?: string | number | null;

  unit_price?: string | number | null;
  pieces_per_carton?: string | number | null;

  line_total?: string | number | null;
}
export interface ArInvoice {
  ar_invoice_id: string;
  invoice_no: string;

  customer_id?: string | null;
  customer_name?: string | null;

  delivery_id?: string | null;
  delivery_no?: string | null;

  so_no?: string | null;

  invoice_date?: string | null;
  due_date?: string | null;
  transaction_date?: string | null;

  status?: string | null;

  invoice_total: string | number;
  total_paid?: string | number | null;
  amount_paid?: string | number | null;
  balance_due?: string | number | null;
  balance?: string | number | null;

  is_posted?: boolean | null;

  posted_journal_id?: string | null;
  posted_journal_no?: string | null;

  reversal_journal_id?: string | null;
  reversal_journal_no?: string | null;

  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;

  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;

  created_at?: string | null;
}

// ============================================================
// AR PAYMENTS
// ============================================================

export interface ArPaymentSummaryRow {
  ar_payment_id: string;
  receipt_no: string;

  customer_id: string;
  customer_name?: string | null;

  payment_date: string;
  transaction_date?: string | null;

  amount: string | number;

  method?: string | null;
  reference?: string | null;

  created_at?: string | null;

  posted_journal_id?: string | null;
  reversal_journal_id?: string | null;

  is_posted?: boolean | null;
  posted?: boolean | null;
  posted_at?: string | null;

  status?: string | null;

  invoice_count?: string | number | null;

  applied_amount?: string | number | null;
  unapplied_amount?: string | number | null;

  applied_invoices?: string | null;

  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;

  // PHASE 4 — backdate audit fields
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;
}


export interface ArPaymentApplication {
  ar_payment_id: string;
  ar_invoice_id: string;

  invoice_no?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;

  status?: string | null;

  invoice_total?: string | number | null;
  amount_paid?: string | number | null;
  invoice_balance?: string | number | null;
  balance?: string | number | null;

  amount?: string | number | null;
  applied_amount?: string | number | null;

  transaction_date?: string | null;

  // PHASE 4 — backdate audit fields
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;
}


export interface ArPayment {
  ar_payment_id: string;
  receipt_no: string;

  customer_id: string;
  customer_name?: string | null;

  payment_date: string;
  transaction_date?: string | null;

  amount: string | number;

  method?: string | null;
  reference?: string | null;

  created_at?: string | null;

  posted_journal_id?: string | null;
  reversal_journal_id?: string | null;

  is_posted?: boolean | null;
  posted?: boolean | null;
  posted_at?: string | null;

  status?: string | null;

  applied_amount?: string | number | null;
  unapplied_amount?: string | number | null;

  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;

  // PHASE 4 — backdate audit fields
  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;
}


// ============================================================
// AR PAYMENT RESPONSES
// ============================================================

/**
 * GET /api/ar-payments
 *
 * Backend uses:
 * {
 *   success: true,
 *   count: number,
 *   ar_payments: [...]
 * }
 */
export interface ArPaymentsResponse {
  success: boolean;
  count: number;
  ar_payments: ArPaymentSummaryRow[];
  message?: string;
}


/**
 * GET /api/ar-payments/reports/summary
 *
 * Backend uses:
 * {
 *   success: true,
 *   count: number,
 *   data: [...]
 * }
 */
export interface ArPaymentSummaryResponse {
  success: boolean;
  count: number;
  data: ArPaymentSummaryRow[];
  message?: string;
}


/**
 * GET /api/ar-payments/:paymentId
 */
export interface ArPaymentDetailResponse {
  success: boolean;
  ar_payment: ArPayment;
  applications: ArPaymentApplication[];
  message?: string;
}


/**
 * POST /api/ar-payments
 * PATCH /api/ar-payments/:paymentId
 */
export interface ArPaymentMutationResponse {
  success: boolean;
  message: string;

  ar_payment?: ArPayment;

  applications?: Array<{
    ar_payment_id: string;
    ar_invoice_id: string;
    amount: string | number;
  }>;

  data?: {
    ar_payment?: ArPayment;
    applications?: Array<{
      ar_payment_id: string;
      ar_invoice_id: string;
      amount: string | number;
    }>;
  };
}


/**
 * POST /api/ar-payments/:paymentId/post
 */
export interface ArPaymentPostResponse {
  success: boolean;
  message: string;

  result?: unknown;

  ar_payment?: ArPayment;

  data?: {
    ar_payment?: ArPayment;
  };

  purchase_order_statuses?: unknown;
}


/**
 * DELETE /api/ar-payments/:paymentId
 */
export interface ArPaymentDeleteResponse {
  success: boolean;
  message: string;
}


/**
 * POST /api/ar-payments/:paymentId/void
 */
export interface ArPaymentVoidResponse {
  success: boolean;
  message: string;

  payment_id?: string;

  original_journal_id?: string | null;
  reversal_journal_id?: string | null;

  status?: string | null;

  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;

  ar_payment?: ArPayment;

  data?: {
    ar_payment?: ArPayment;
  };
}


// ============================================================
// AR PAYMENT REQUEST PAYLOADS
// ============================================================

export interface CreateArPaymentApplicationPayload {
  ar_invoice_id: string;
  amount: number;
}


export interface CreateArPaymentPayload {
  customer_id: string;

  payment_date: string;

  amount: number;

  method?: string | null;

  reference?: string | null;

  applications: CreateArPaymentApplicationPayload[];

  transaction_date?: string | null;

  backdate_flag?: boolean;

  backdate_reason?: string | null;
}


export interface UpdateArPaymentPayload {
  payment_date?: string;

  amount?: number;

  method?: string | null;

  reference?: string | null;

  applications?: CreateArPaymentApplicationPayload[];

  transaction_date?: string | null;

  backdate_flag?: boolean;

  backdate_reason?: string | null;
}


// ============================================================
// AR PAYMENT — OPEN INVOICES
// ============================================================

export interface ArPaymentOpenInvoice {
  ar_invoice_id: string;
  invoice_no: string;

  invoice_date?: string | null;
  due_date?: string | null;

  status?: string | null;

  transaction_date?: string | null;

  backdate_flag?: boolean | null;
  backdate_reason?: string | null;

  invoice_total: string | number;
  amount_paid: string | number;

  balance: string | number;
}


export interface ArPaymentOpenInvoicesResponse {
  success: boolean;
  count: number;

  open_invoices: ArPaymentOpenInvoice[];

  message?: string;
}
