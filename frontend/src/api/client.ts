import axios from "axios";

import type {
  ApiPayload,

  ApInvoiceDetailResponse,
  ApInvoiceSummaryResponse,
  GoodsReceiptSummaryResponse,
  ApInvoicesResponse,
  ApInvoiceMutationResponse,

  ApPaymentSummaryResponse,
  ApPaymentsResponse,
  ApPaymentDetailResponse,
  ApPaymentMutationResponse,
  ApPaymentDeleteResponse,
  ApPaymentPostResponse,
  ApPaymentVoidResponse,

  SupplierOpenInvoicesResponse,

  // ===============================
  // AR Invoices
  // ===============================
  
  ArInvoicesResponse,
  ArInvoiceSummaryResponse,
  ArInvoiceDetailResponse,
  ArInvoiceMutationResponse,
  ArInvoiceDeleteResponse,
  ArInvoicePostResponse,
  ArInvoiceVoidResponse,
  CreateArInvoicePayload,
  

  // ===============================
  // AR Payments
  // ===============================
  ArPaymentsResponse,
  ArPaymentSummaryResponse,
  ArPaymentDetailResponse,
  ArPaymentOpenInvoicesResponse,
  ArPaymentMutationResponse,
  ArPaymentDeleteResponse,
  ArPaymentPostResponse,
  CreateArPaymentPayload,
  BusinessProfileResponse,
  UpdateBusinessProfilePayload,
  ProductCategoryResponse,
  BusinessFeaturesResponse,
  UpdateBusinessFeaturesPayload,

} from "@/types/api";

/**
 * KAM GRAINS API CLIENT
 * Complete replacement for:
 * C:\\BusinessSystems\\KamGrainsWeb\\frontend\\src\\api\\client.ts
 *
 * This version matches your current backend server.js route mounts.
 */

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("kam_grains_token") ||
    localStorage.getItem("auth_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

function encode(value: string) {
  return encodeURIComponent(value);
}

function includeClosedValue(options?: boolean | { include_closed?: boolean }) {
  if (typeof options === "boolean") return options;
  return Boolean(options?.include_closed);
}

// ===============================
// Health / Dashboard
// ===============================

export async function getHealth() {
  const response = await api.get("/health");
  return response.data;
}

export async function getBusinessProfile(): Promise<BusinessProfileResponse> {
  const response = await api.get("/business-profile");
  return response.data;
}

export async function updateBusinessProfile(payload: UpdateBusinessProfilePayload): Promise<BusinessProfileResponse> {
  const response = await api.patch("/business-profile", payload);
  return response.data;
}

export async function getBusinessFeatures(): Promise<BusinessFeaturesResponse> {
  const response = await api.get("/business-features");
  return response.data;
}

export async function updateBusinessFeatures(payload: UpdateBusinessFeaturesPayload): Promise<BusinessFeaturesResponse> {
  const response = await api.patch("/business-features", payload);
  return response.data;
}

export async function getDashboardSummary() {
  const response = await api.get("/dashboard/summary");
  return response.data;
}

// ===============================
// Auth
// ===============================

export async function login(payload: ApiPayload) {
  const response = await api.post("/auth/login", payload);
  return response.data;
}

export async function loginUser(payload: ApiPayload) {
  const response = await api.post("/auth/login", payload);
  return response.data;
}

export async function getMe() {
  const response = await api.get("/auth/me");
  return response.data;
}

export async function changePassword(payload: ApiPayload) {
  const response = await api.post("/auth/change-password", payload);
  return response.data;
}

// ===============================
// Users / Roles
// Matches backend/src/routes/users.routes.js
// ===============================

export async function getUsers() {
  const response = await api.get("/users");
  return response.data;
}

export async function createUser(payload: ApiPayload) {
  const response = await api.post("/users", payload);
  return response.data;
}

export async function updateUserStatus(userId: string, payload: ApiPayload) {
  const response = await api.patch(`/users/${encode(userId)}/status`, payload);
  return response.data;
}

export async function resetUserPassword(userId: string, payload: ApiPayload) {
  const response = await api.patch(`/users/${encode(userId)}/password`, payload);
  return response.data;
}

export async function getRoles() {
  const response = await api.get("/users/roles");
  return response.data;
}

export async function createRole(payload: ApiPayload) {
  const response = await api.post("/users/roles", payload);
  return response.data;
}

export async function assignUserRole(
  userId: string,
  payload: { role_code: string } | ApiPayload
) {
  const response = await api.post(`/users/${encode(userId)}/roles`, payload);
  return response.data;
}

export async function removeUserRole(userId: string, roleCode: string) {
  const response = await api.delete(
    `/users/${encode(userId)}/roles/${encode(roleCode)}`
  );
  return response.data;
}

// ===============================
// Audit Log
// server.js mount: /api/audit-events
// ===============================

export async function getAuditEvents(params: ApiPayload = {}) {
  const response = await api.get("/audit-events", { params });
  return response.data;
}

export async function getAuditEventById(eventId: string) {
  const response = await api.get(`/audit-events/${encode(eventId)}`);
  return response.data;
}

export async function getAuditEventActions() {
  const response = await api.get("/audit-events/actions");
  return response.data;
}

export async function getAuditEventTables() {
  const response = await api.get("/audit-events/tables");
  return response.data;
}

// ===============================
// Backdated Events (PHASE 4)
// ===============================

export async function getBackdateEvents(params: ApiPayload = {}) {
  const response = await api.get("/audit-events/backdate", { params });
  return response.data;
}

export async function getBackdateEventById(eventId: string) {
  const response = await api.get(`/audit-events/backdate/${encode(eventId)}`);
  return response.data;
}

// ===============================
// Setup / UOMs
// ===============================

export async function getUoms() {
  const response = await api.get("/uoms");
  return response.data;
}

export async function createUom(payload: ApiPayload) {
  const response = await api.post("/uoms", payload);
  return response.data;
}

export async function updateUom(uomCode: string, payload: ApiPayload) {
  const response = await api.patch(`/uoms/${encode(uomCode)}`, payload);
  return response.data;
}

export async function deleteUom(uomCode: string) {
  const response = await api.delete(`/uoms/${encode(uomCode)}`);
  return response.data;
}

// ===============================
// Products
// ===============================

export async function getProducts() {
  const response = await api.get("/products");
  return response.data;
}

export async function getPosProducts(params: { q?: string; location_id?: string } = {}) {
  const response = await api.get("/pos/products", { params });
  return response.data;
}

export async function getPosPrices(params: { q?: string } = {}) {
  const response = await api.get("/pos/prices", { params });
  return response.data;
}

export async function getPosPrice(productId: string) {
  const response = await api.get(`/pos/prices/${encode(productId)}`);
  return response.data;
}

export async function createPosPrice(payload: { product_id: string; unit_price: number }) {
  const response = await api.post("/pos/prices", payload);
  return response.data;
}

export async function updatePosPrice(productId: string, payload: { unit_price: number }) {
  const response = await api.patch(`/pos/prices/${encode(productId)}`, payload);
  return response.data;
}

export async function deactivatePosPrice(productId: string) {
  const response = await api.delete(`/pos/prices/${encode(productId)}`);
  return response.data;
}

export async function getPosBarcodes(params: { q?: string } = {}) {
  const response = await api.get("/pos/barcodes", { params });
  return response.data;
}

export async function createPosBarcode(payload: { product_id: string; barcode: string; uom_code?: string | null; qty_per_scan?: number }) {
  const response = await api.post("/pos/barcodes", payload);
  return response.data;
}

export async function updatePosBarcode(barcodeId: string, payload: { barcode?: string; uom_code?: string | null; qty_per_scan?: number; is_active?: boolean }) {
  const response = await api.patch(`/pos/barcodes/${encode(barcodeId)}`, payload);
  return response.data;
}

export async function deactivatePosBarcode(barcodeId: string) {
  const response = await api.delete(`/pos/barcodes/${encode(barcodeId)}`);
  return response.data;
}

export async function createPosSale(payload: unknown) {
  const response = await api.post("/pos/sales", payload);
  return response.data;
}

export async function getPosSale(saleId: string) {
  const response = await api.get(`/pos/sales/${encode(saleId)}`);
  return response.data;
}

export async function getPosSaleByNo(saleNo: string) {
  const response = await api.get(`/pos/sales/by-no/${encode(saleNo)}`);
  return response.data;
}

export async function voidPosSale(saleId: string, reason: string) {
  const response = await api.post(`/pos/sales/${encode(saleId)}/void`, { reason });
  return response.data;
}

export async function getCustomerReturnSource(sourceType: "POS" | "DELIVERY", sourceId: string) {
  const response = await api.get(`/customer-returns/source/${sourceType}/${encode(sourceId)}`);
  return response.data;
}

export async function getCustomerReturns(params: Record<string, string> = {}) {
  const response = await api.get("/customer-returns", { params });
  return response.data;
}

export async function getCustomerReturnSummary() {
  const response = await api.get("/customer-returns/summary");
  return response.data;
}

export async function getCustomerReturn(returnId: string) {
  const response = await api.get(`/customer-returns/${encode(returnId)}`);
  return response.data;
}

export async function getCustomerReturnRefunds(returnId: string) {
  const response = await api.get(`/customer-returns/${encode(returnId)}/refunds`);
  return response.data;
}

export async function createCustomerReturn(payload: unknown) {
  const response = await api.post("/customer-returns", payload);
  return response.data;
}

export async function postCustomerReturn(returnId: string) {
  const response = await api.post(`/customer-returns/${encode(returnId)}/post`);
  return response.data;
}

export async function getCustomerReturnNote(returnId: string) {
  const response = await api.get(`/customer-returns/${encode(returnId)}/note`);
  return response.data;
}

export async function getReturnPolicy() {
  const response = await api.get("/return-policy");
  return response.data;
}

export async function updateReturnPolicy(payload: Record<string, unknown>) {
  const response = await api.patch("/return-policy", payload);
  return response.data;
}

export async function settleCustomerReturnRefund(returnId: string, payload: Record<string, unknown>) {
  const response = await api.post(`/customer-returns/${encode(returnId)}/refund`, payload);
  return response.data;
}

export async function voidCustomerReturn(returnId: string, reason: string) {
  const response = await api.post(`/customer-returns/${encode(returnId)}/void`, { reason });
  return response.data;
}

export async function getProductCategories(): Promise<ProductCategoryResponse> {
  const response = await api.get("/product-categories");
  return response.data;
}

export async function createProductCategory(payload: ApiPayload) {
  const response = await api.post("/product-categories", payload);
  return response.data;
}

export async function updateProductCategory(categoryId: string, payload: ApiPayload) {
  const response = await api.patch(`/product-categories/${encode(categoryId)}`, payload);
  return response.data;
}

export async function deleteProductCategory(categoryId: string) {
  const response = await api.delete(`/product-categories/${encode(categoryId)}`);
  return response.data;
}

export async function getProductById(productId: string) {
  const response = await api.get(`/products/${encode(productId)}`);
  return response.data;
}

export async function createProduct(payload: ApiPayload) {
  const response = await api.post("/products", payload);
  return response.data;
}

export async function updateProduct(productId: string, payload: ApiPayload) {
  const response = await api.patch(`/products/${encode(productId)}`, payload);
  return response.data;
}

export async function deleteProduct(productId: string) {
  const response = await api.delete(`/products/${encode(productId)}`);
  return response.data;
}

// ===============================
// Locations
// ===============================

export async function getLocations() {
  const response = await api.get("/locations");
  return response.data;
}

export async function getLocationById(locationId: string) {
  const response = await api.get(`/locations/${encode(locationId)}`);
  return response.data;
}

export async function createLocation(payload: ApiPayload) {
  const response = await api.post("/locations", payload);
  return response.data;
}

export async function updateLocation(locationId: string, payload: ApiPayload) {
  const response = await api.patch(`/locations/${encode(locationId)}`, payload);
  return response.data;
}

export async function deleteLocation(locationId: string) {
  const response = await api.delete(`/locations/${encode(locationId)}`);
  return response.data;
}

// ===============================
// Parties
// ===============================

export async function getParties() {
  const response = await api.get("/parties");
  return response.data;
}

export async function getPartyById(partyId: string) {
  const response = await api.get(`/parties/${encode(partyId)}`);
  return response.data;
}

export async function createParty(payload: ApiPayload) {
  const response = await api.post("/parties", payload);
  return response.data;
}

export async function updateParty(partyId: string, payload: ApiPayload) {
  const response = await api.patch(`/parties/${encode(partyId)}`, payload);
  return response.data;
}

export async function deleteParty(partyId: string) {
  const response = await api.delete(`/parties/${encode(partyId)}`);
  return response.data;
}

// ===============================
// GL Accounts / Finance Setup
// ===============================

export async function getGlAccounts() {
  const response = await api.get("/gl-accounts");
  return response.data;
}

export async function getFinanceGlAccounts() {
  const response = await api.get("/finance/gl-accounts");
  return response.data;
}

export async function getPostingSetup() {
  const response = await api.get("/finance/posting-setup");
  return response.data;
}

export async function createPostingSetup(payload: ApiPayload) {
  const response = await api.post("/finance/posting-setup", payload);
  return response.data;
}

export async function updatePostingSetup(id: string, payload: ApiPayload) {
  const response = await api.patch(
    `/finance/posting-setup/${encode(id)}`,
    payload
  );
  return response.data;
}

// ===============================
// Payment Accounts
// server.js mount: /api/payment-accounts
// ===============================

export async function getPaymentAccounts() {
  const response = await api.get("/payment-accounts");
  return response.data;
}

export async function getPaymentAccountBalances() {
  const response = await api.get("/payment-accounts/balances");
  return response.data;
}

export async function getPaymentAccountControl() {
  const response = await api.get("/payment-accounts");
  return response.data;
}

export async function createPaymentAccountControl(payload: ApiPayload) {
  const response = await api.post("/payment-accounts", payload);
  return response.data;
}

export async function updatePaymentAccountControl(id: string, payload: ApiPayload) {
  const response = await api.patch(`/payment-accounts/${encode(id)}`, payload);
  return response.data;
}

export async function testPaymentAccountCanPay(
  accountIdOrPayload: string | ApiPayload,
  payload?: ApiPayload
) {
  if (typeof accountIdOrPayload === "string") {
    const response = await api.post(
      `/payment-accounts/${encode(accountIdOrPayload)}/test-can-pay`,
      payload || {}
    );
    return response.data;
  }

  const response = await api.post(
    "/payment-accounts/test-can-pay",
    accountIdOrPayload
  );
  return response.data;
}

// ===============================
// API Payment Channels
// server.js mount: /api/api-payment-channels
// ===============================

export async function getApiPaymentChannels() {
  const response = await api.get("/api-payment-channels");
  return response.data;
}

export async function getApiPaymentChannelById(channelId: string) {
  const response = await api.get(`/api-payment-channels/${encode(channelId)}`);
  return response.data;
}

export async function createApiPaymentChannel(payload: ApiPayload) {
  const response = await api.post("/api-payment-channels", payload);
  return response.data;
}

export async function updateApiPaymentChannel(
  channelId: string,
  payload: ApiPayload
) {
  const response = await api.patch(
    `/api-payment-channels/${encode(channelId)}`,
    payload
  );
  return response.data;
}

export async function testApiPaymentChannelAction(
  channelId: string,
  payload: ApiPayload = {}
) {
  const response = await api.post(
    `/api-payment-channels/${encode(channelId)}/test-action`,
    payload
  );
  return response.data;
}

// ===============================
// Inventory Reports / Lots
// ===============================

export async function getStockOnHand(
  options: boolean | { include_closed?: boolean } = false
) {
  // FIX (Phase 4): was /inventory-reports/stock-on-hand which returns ALL
  // ACTIVE lots including qty=0 (16 rows). /inventory/stock-on-hand joins
  // inv.lot directly and returns only lots with qty > 0 (6 rows) with the
  // correct lot_status field that the InventoryStock page needs.
  const response = await api.get("/inventory/stock-on-hand", {
    params: { include_closed: includeClosedValue(options) },
  });
  return response.data;
}

export async function getStockMovements() {
  const response = await api.get("/inventory-reports/stock-movements");
  return response.data;
}

export async function getInventoryValuation() {
  const response = await api.get("/inventory-reports/valuation");
  return response.data;
}

export async function getLots() {
  const response = await api.get("/lots");
  return response.data;
}

export async function getLotById(lotId: string) {
  const response = await api.get(`/lots/${encode(lotId)}`);
  return response.data;
}

// ===============================
// Purchase Orders
// ===============================

export async function getPurchaseOrders() {
  const response = await api.get("/purchase-orders");
  return response.data;
}

export async function getPurchaseOrderSummary() {
  const response = await api.get("/purchase-orders/reports/summary");
  return response.data;
}

export async function getPurchaseOrderById(poId: string) {
  const response = await api.get(`/purchase-orders/${encode(poId)}`);
  return response.data;
}

export async function createPurchaseOrder(payload: ApiPayload) {
  const response = await api.post("/purchase-orders", payload);
  return response.data;
}

// ===============================
// Goods Receipts / GRN
// ===============================

export async function getGoodsReceipts() {
  const response = await api.get("/goods-receipts");
  return response.data;
}

export async function getGoodsReceiptSummary() {
  const response = await api.get<GoodsReceiptSummaryResponse>(
    "/goods-receipts/reports/summary"
  );
  return response.data;
}

export async function getGoodsReceiptVarianceReport() {
  const response = await api.get("/goods-receipts/reports/variance");
  return response.data;
}

export async function getGoodsReceiptById(grnId: string) {
  const response = await api.get(`/goods-receipts/${encode(grnId)}`);
  return response.data;
}

export async function createGoodsReceipt(payload: ApiPayload) {
  const response = await api.post("/goods-receipts", payload);
  return response.data;
}

export async function postGoodsReceipt(grnNo: string) {
  const response = await api.post(`/goods-receipts/${encode(grnNo)}/post`);
  return response.data;
}

export async function deleteGoodsReceipt(grnNo: string) {
  const response = await api.delete(`/goods-receipts/${encode(grnNo)}`);
  return response.data;
}

// ===============================
// Sales Orders
// ===============================

export async function getSalesOrders() {
  const response = await api.get("/sales-orders");
  return response.data;
}

export async function getSalesOrderById(soId: string) {
  const response = await api.get(`/sales-orders/${encode(soId)}`);
  return response.data;
}

export async function createSalesOrder(payload: ApiPayload) {
  const response = await api.post("/sales-orders", payload);
  return response.data;
}

export async function updateSalesOrder(soId: string, payload: ApiPayload) {
  const response = await api.patch(`/sales-orders/${encode(soId)}`, payload);
  return response.data;
}

export async function cancelSalesOrder(soId: string) {
  const response = await api.patch(`/sales-orders/${encode(soId)}/cancel`);
  return response.data;
}

// ===============================
// Deliveries
// ===============================

export async function getDeliveries() {
  const response = await api.get("/deliveries");
  return response.data;
}

export async function getDeliveryById(deliveryId: string) {
  const response = await api.get(`/deliveries/${encode(deliveryId)}`);
  return response.data;
}

export async function createDelivery(payload: ApiPayload) {
  const response = await api.post("/deliveries", payload);
  return response.data;
}

export async function getDeliveryLotOptions(deliveryLineId: string) {
  const response = await api.get(
    `/deliveries/lot-options/${encode(deliveryLineId)}`
  );
  return response.data;
}

export async function assignDeliveryLineLot(
  deliveryLineId: string,
  payload: ApiPayload
) {
  const response = await api.patch(
    `/deliveries/lines/${encode(deliveryLineId)}/lot`,
    payload
  );
  return response.data;
}

export async function updateDeliveryLocation(
  deliveryId: string,
  payload: ApiPayload
) {
  const response = await api.patch(
    `/deliveries/${encode(deliveryId)}/location`,
    payload
  );
  return response.data;
}

export async function postDelivery(deliveryNo: string) {
  const response = await api.post(`/deliveries/${encode(deliveryNo)}/post`);
  return response.data;
}

export async function deleteDelivery(deliveryNo: string) {
  const response = await api.delete(`/deliveries/${encode(deliveryNo)}`);
  return response.data;
}

// ===============================
// AR Invoices
// ===============================

export async function getArInvoices(): Promise<ArInvoicesResponse> {
  const response = await api.get("/ar-invoices");
  return response.data;
}

export async function getArInvoiceSummary(): Promise<ArInvoiceSummaryResponse> {
  const response = await api.get("/ar-invoices/reports/summary");
  return response.data;
}

export async function getArInvoiceById(
  invoiceId: string
): Promise<ArInvoiceDetailResponse> {
  const response = await api.get(`/ar-invoices/${encode(invoiceId)}`);
  return response.data;
}

export async function getArInvoiceByNo(
  invoiceNo: string
): Promise<ArInvoiceDetailResponse> {
  const response = await api.get(`/ar-invoices/by-no/${encode(invoiceNo)}`);
  return response.data;
}

export async function createArInvoiceFromDelivery(
  deliveryNo: string
): Promise<ArInvoiceMutationResponse> {
  const response = await api.post(
    `/ar-invoices/from-delivery/${encode(deliveryNo)}`
  );
  return response.data;
}

export async function createArInvoice(
  payload: CreateArInvoicePayload
): Promise<ArInvoiceMutationResponse> {
  const response = await api.post("/ar-invoices", payload);
  return response.data;
}

export async function postArInvoice(
  invoiceNo: string
): Promise<ArInvoicePostResponse> {
  const response = await api.post(`/ar-invoices/${encode(invoiceNo)}/post`);
  return response.data;
}

export async function voidArInvoice(
  invoiceNo: string,
  reason: string
): Promise<ArInvoiceVoidResponse> {
  const response = await api.post(`/ar-invoices/${encode(invoiceNo)}/void`, {
    reason,
  });
  return response.data;
}

export async function deleteArInvoice(
  invoiceNo: string
): Promise<ArInvoiceDeleteResponse> {
  const response = await api.delete(`/ar-invoices/${encode(invoiceNo)}`);
  return response.data;
}


// ===============================
// AR Payments
// ===============================
export async function getArPayments(): Promise<ArPaymentsResponse> {
  const response = await api.get("/ar-payments");
  return response.data;
}

export async function getArPaymentSummary(): Promise<ArPaymentSummaryResponse> {
  const response = await api.get("/ar-payments/reports/summary");
  return response.data;
}

export async function getArPaymentById(
  paymentId: string
): Promise<ArPaymentDetailResponse> {
  const response = await api.get(
    `/ar-payments/${encodeURIComponent(paymentId)}`
  );

  return response.data;
}

export async function getCustomerOpenInvoices(
  customerId: string
): Promise<ArPaymentOpenInvoicesResponse> {
  const response = await api.get(
    `/ar-payments/customer/${encodeURIComponent(customerId)}/open-invoices`
  );

  return response.data;
}

export async function createArPayment(
  payload: CreateArPaymentPayload
): Promise<ArPaymentMutationResponse> {
  const response = await api.post("/ar-payments", payload);
  return response.data;
}


export async function deleteArPayment(
  paymentId: string
): Promise<ArPaymentDeleteResponse> {
  const response = await api.delete(
    `/ar-payments/${encodeURIComponent(paymentId)}`
  );

  return response.data;
}
export async function postArPayment(
  receiptNo: string
): Promise<ArPaymentPostResponse> {
  const response = await api.post(
    `/ar-payments/${encodeURIComponent(receiptNo)}/post`
  );

  return response.data;
}

// ===============================
// AP Invoices
// ===============================

export async function getApInvoices() {
  const response = await api.get<ApInvoicesResponse>("/ap-invoices");
  return response.data;
}

export async function getApInvoiceSummary() {
  const response = await api.get<ApInvoiceSummaryResponse>(
    "/ap-invoices/reports/summary"
  );
  return response.data;
}

export async function getApInvoiceById(invoiceId: string) {
  const response = await api.get<ApInvoiceDetailResponse>(
    `/ap-invoices/${encode(invoiceId)}`
  );
  return response.data;
}

export async function getApInvoiceByNo(invoiceNo: string) {
  const response = await api.get<ApInvoiceDetailResponse>(`/ap-invoices/by-no/${encode(invoiceNo)}`);
  return response.data;
}

export async function createApInvoiceFromGrn(
  input:
    | string
    | {
        grn_no: string;
        invoice_date?: string;
        due_date?: string;
        // PHASE 4
        transaction_date?: string;
        backdate_flag?: boolean;
        backdate_reason?: string | null;
      }
) {
  const payload =
    typeof input === "string"
      ? { grn_no: input }
      : input;

  const response = await api.post<ApInvoiceMutationResponse>(
    "/ap-invoices/from-grn",
    payload
  );
  return response.data;
}

export async function createApInvoice(payload: ApiPayload) {
  const response = await api.post<ApInvoiceMutationResponse>("/ap-invoices", payload);
  return response.data;
}

export async function postApInvoice(invoiceNo: string) {
  const response = await api.post<ApInvoiceMutationResponse>(
    `/ap-invoices/${encode(invoiceNo)}/post`
  );
  return response.data;
}

export async function deleteApInvoice(invoiceNo: string) {
  const response = await api.delete<ApInvoiceMutationResponse>(
    `/ap-invoices/${encode(invoiceNo)}`
  );
  return response.data;
}

export const getAPInvoices = getApInvoices;
export const getAPInvoiceSummary = getApInvoiceSummary;
export const getAPInvoiceById = getApInvoiceById;
export const getAPInvoiceByNo = getApInvoiceByNo;
export const createAPInvoiceFromGrn = createApInvoiceFromGrn;
export const createAPInvoice = createApInvoice;
export const postAPInvoice = postApInvoice;
export const deleteAPInvoice = deleteApInvoice;

// AP Payments
// ===============================

export async function getApPayments(): Promise<ApPaymentsResponse> {
  const response = await api.get<ApPaymentsResponse>("/ap-payments");
  return response.data;
}

export async function getApPaymentSummary(): Promise<ApPaymentSummaryResponse> {
  const response = await api.get<ApPaymentSummaryResponse>(
    "/ap-payments/reports/summary"
  );
  return response.data;
}

export async function getApPaymentById(
  paymentId: string
): Promise<ApPaymentDetailResponse> {
  const response = await api.get<ApPaymentDetailResponse>(
    `/ap-payments/${encode(paymentId)}`
  );
  return response.data;
}

export async function getSupplierOpenInvoices(
  supplierId: string
): Promise<SupplierOpenInvoicesResponse> {
  const response = await api.get<SupplierOpenInvoicesResponse>(
    `/ap-payments/supplier/${encode(supplierId)}/open-invoices`
  );
  return response.data;
}

export async function createApPayment(
  payload: ApiPayload
): Promise<ApPaymentMutationResponse> {
  const response = await api.post<ApPaymentMutationResponse>(
    "/ap-payments",
    payload
  );
  return response.data;
}

export async function updateApPayment(
  paymentId: string,
  payload: ApiPayload
): Promise<ApPaymentMutationResponse> {
  const response = await api.patch<ApPaymentMutationResponse>(
    `/ap-payments/${encode(paymentId)}`,
    payload
  );
  return response.data;
}

export async function deleteApPayment(
  paymentId: string
): Promise<ApPaymentDeleteResponse> {
  const response = await api.delete<ApPaymentDeleteResponse>(
    `/ap-payments/${encode(paymentId)}`
  );
  return response.data;
}

export async function postApPayment(
  paymentId: string
): Promise<ApPaymentPostResponse> {
  const response = await api.post<ApPaymentPostResponse>(
    `/ap-payments/${encode(paymentId)}/post`
  );
  return response.data;
}

export async function voidApPayment(
  paymentId: string,
  reason: string
): Promise<ApPaymentVoidResponse> {
  const response = await api.post<ApPaymentVoidResponse>(
    `/ap-payments/${encode(paymentId)}/void`,
    {
      reason,
    }
  );
  return response.data;
}

export const getAPPayments = getApPayments;
export const getAPPaymentSummary = getApPaymentSummary;
export const getAPPaymentById = getApPaymentById;
export const createAPPayment = createApPayment;
export const updateAPPayment = updateApPayment;
export const deleteAPPayment = deleteApPayment;
export const postAPPayment = postApPayment;
export const voidAPPayment = voidApPayment;

// ===============================
// Expense Vouchers
// ===============================

export async function getExpenseVouchers() {
  const response = await api.get("/finance/expense-vouchers");
  return response.data;
}

export async function getExpenseVoucherByNo(voucherNo: string) {
  const response = await api.get(
    `/finance/expense-vouchers/${encode(voucherNo)}`
  );
  return response.data;
}

export async function createExpenseVoucher(payload: ApiPayload) {
  const response = await api.post("/finance/expense-vouchers", payload);
  return response.data;
}

export async function postExpenseVoucher(
  voucherNo: string,
  payload: ApiPayload = {}
) {
  const response = await api.post(
    `/finance/expense-vouchers/${encode(voucherNo)}/post`,
    payload
  );
  return response.data;
}

// ===============================
// Accrued Expenses
// server.js mount: /api/accrued-expenses
// ===============================

export async function getAccruedExpenses() {
  const response = await api.get("/accrued-expenses");
  return response.data;
}

export async function getAccruedExpenseByNo(documentNo: string) {
  const response = await api.get(`/accrued-expenses/${encode(documentNo)}`);
  return response.data;
}

export async function getNextAccruedExpenseNo() {
  const response = await api.get("/accrued-expenses/next-no");
  return response.data;
}

export async function createAccruedExpense(payload: ApiPayload) {
  const response = await api.post("/accrued-expenses", payload);
  return response.data;
}

export async function postAccruedExpense(documentNo: string) {
  const response = await api.post(
    `/accrued-expenses/${encode(documentNo)}/post`
  );
  return response.data;
}

export async function payAccruedExpense(documentNo: string, payload: ApiPayload) {
  const response = await api.post(
    `/accrued-expenses/${encode(documentNo)}/pay`,
    payload
  );
  return response.data;
}

// ===============================
// Opening Balances
// server.js mount: /api/opening-balances
// ===============================

export async function getOpeningBalances() {
  const response = await api.get("/opening-balances");
  return response.data;
}

export async function getOpeningBalanceByNo(documentNo: string) {
  const response = await api.get(`/opening-balances/${encode(documentNo)}`);
  return response.data;
}

export async function getNextOpeningBalanceNo() {
  const response = await api.get("/opening-balances/next-no");
  return response.data;
}

export async function createOpeningBalance(payload: ApiPayload) {
  const response = await api.post("/opening-balances", payload);
  return response.data;
}

export async function postOpeningBalance(documentNo: string) {
  const response = await api.post(
    `/opening-balances/${encode(documentNo)}/post`
  );
  return response.data;
}

// ===============================
// Reconciliations
// server.js mount: /api/reconciliations
// ===============================
type ReconciliationNextNoResponse = {
  success: boolean;
  reconciliation_no: string;
};

type ReconciliationSystemTransactionsParams = {
  payment_account_id: string;
  period_from?: string | null;
  period_to?: string | null;
  include_matched?: boolean;
};

export async function getNextReconciliationNo(): Promise<ReconciliationNextNoResponse> {
  const response = await api.get("/reconciliations/next-no");
  return response.data;
}

export async function getReconciliationSystemTransactions(
  params: ReconciliationSystemTransactionsParams
) {
  const response = await api.get("/reconciliations/system-transactions", {
    params,
  });

  return response.data;
}

export async function getReconciliations() {
  const response = await api.get("/reconciliations");
  return response.data;
}

export async function getReconciliationByNo(reconciliationNo: string) {
  const response = await api.get(`/reconciliations/${encode(reconciliationNo)}`);
  return response.data;
}

export async function createReconciliation(payload: ApiPayload) {
  const response = await api.post("/reconciliations", payload);
  return response.data;
}

export async function updateReconciliation(
  reconciliationNo: string,
  payload: ApiPayload
) {
  const response = await api.patch(
    `/reconciliations/${encode(reconciliationNo)}`,
    payload
  );
  return response.data;
}

export async function deleteReconciliation(reconciliationNo: string) {
  const response = await api.delete(`/reconciliations/${encode(reconciliationNo)}`);
  return response.data;
}

export async function postReconciliation(reconciliationNo: string) {
  const response = await api.post(`/reconciliations/${encode(reconciliationNo)}/post`);
  return response.data;
}

export async function autoMatchReconciliation(reconciliationNo: string) {
  const response = await api.post(
    `/reconciliations/${encode(reconciliationNo)}/auto-match`
  );
  return response.data;
}

export async function cancelReconciliation(
  reconciliationNo: string,
  payload: ApiPayload = {}
) {
  const response = await api.post(
    `/reconciliations/${encode(reconciliationNo)}/cancel`,
    payload
  );
  return response.data;
}

export async function confirmReconciliation(reconciliationNo: string) {
  const response = await api.post(
    `/reconciliations/${encode(reconciliationNo)}/confirm`
  );
  return response.data;
}

export async function saveReconciliationMatches(
  reconciliationNo: string,
  payload: ApiPayload
) {
  const response = await api.post(
    `/reconciliations/${encode(reconciliationNo)}/matches`,
    payload
  );
  return response.data;
}

// ===============================
// Stock Adjustments
// ===============================

export async function getStockAdjustments() {
  const response = await api.get("/stock-adjustments");
  return response.data;
}

export async function getStockAdjustmentByNo(documentNo: string) {
  const response = await api.get(`/stock-adjustments/${encode(documentNo)}`);
  return response.data;
}

export async function createStockAdjustment(payload: ApiPayload) {
  const response = await api.post("/stock-adjustments", payload);
  return response.data;
}

export async function createProductReclassification(
  payload: Record<string, any> = {}
) {
  const response = await api.post(
    "/stock-adjustments",
    Object.assign({}, payload, {
      movement_type: "PRODUCT_RECLASSIFICATION",
      reason_code: "PRODUCT_RECLASSIFICATION",
    })
  );

  return response.data;
}

export async function postStockAdjustment(documentNo: string) {
  const response = await api.post(
    `/stock-adjustments/${encode(documentNo)}/post`
  );
  return response.data;
}

export async function deleteStockAdjustment(documentNo: string) {
  const response = await api.delete(`/stock-adjustments/${encode(documentNo)}`);
  return response.data;
}

// ===============================
// Stock Counts
// ===============================

export async function getStockCounts() {
  const response = await api.get("/stock-counts");
  return response.data;
}

export async function getStockCountByNo(documentNo: string) {
  const response = await api.get(`/stock-counts/${encode(documentNo)}`);
  return response.data;
}

export async function createStockCount(payload: ApiPayload) {
  const response = await api.post("/stock-counts", payload);
  return response.data;
}

export async function loadStockCountLines(documentNo: string) {
  const response = await api.post(
    `/stock-counts/${encode(documentNo)}/load-lines`
  );
  return response.data;
}

export async function updateStockCountLine(
  countNoOrLineId: string,
  lineIdOrPayload: string | ApiPayload,
  payload?: ApiPayload
) {
  if (typeof lineIdOrPayload === "string") {
    const response = await api.patch(
      `/stock-counts/${encode(countNoOrLineId)}/lines/${encode(lineIdOrPayload)}`,
      payload || {}
    );
    return response.data;
  }

  const response = await api.patch(
    `/stock-counts/lines/${encode(countNoOrLineId)}`,
    lineIdOrPayload
  );
  return response.data;
}

export async function postStockCount(documentNo: string, payload: ApiPayload = {}) {
  const response = await api.post(
    `/stock-counts/${encode(documentNo)}/post`,
    payload
  );
  return response.data;
}

export async function deleteStockCount(documentNo: string) {
  const response = await api.delete(`/stock-counts/${encode(documentNo)}`);
  return response.data;
}

// ===============================
// Cleaning / Processing Batches
// ===============================

export async function getCleaningBatches() {
  const response = await api.get("/cleaning-batches");
  return response.data;
}

export async function getCleaningBatchSummary() {
  const response = await api.get("/cleaning-batches/reports/summary");
  return response.data;
}

export async function getCleaningBatchByNo(batchNo: string) {
  const response = await api.get(`/cleaning-batches/${encode(batchNo)}`);
  return response.data;
}

export async function createCleaningBatch(payload: ApiPayload) {
  const response = await api.post("/cleaning-batches", payload);
  return response.data;
}

export async function updateCleaningBatch(batchNo: string, payload: ApiPayload) {
  const response = await api.patch(`/cleaning-batches/${encode(batchNo)}`, payload);
  return response.data;
}

export async function postCleaningBatch(batchNo: string) {
  const response = await api.post(`/cleaning-batches/${encode(batchNo)}/post`);
  return response.data;
}

export async function deleteCleaningBatch(batchNo: string) {
  const response = await api.delete(`/cleaning-batches/${encode(batchNo)}`);
  return response.data;
}

// ===============================
// Journals
// ===============================

export async function getJournals() {
  const response = await api.get("/finance/journals");
  return response.data;
}

export async function getJournalByNo(journalNo: string) {
  const response = await api.get(`/finance/journals/${encode(journalNo)}`);
  return response.data;
}

export const getFinanceJournals = getJournals;
export const getFinanceJournalByNo = getJournalByNo;

export async function createManualJournal(payload: ApiPayload) {
  const response = await api.post("/finance/manual-journals", payload);
  return response.data;
}

// ===============================
// Finance Reports
// ===============================

export async function getGeneralLedgerReport() {
  const response = await api.get("/finance/reports/general-ledger");
  return response.data;
}

export async function getTrialBalanceReport() {
  const response = await api.get("/finance/reports/trial-balance");
  return response.data;
}

export async function getProfitAndLossReport() {
  const response = await api.get("/finance/reports/profit-and-loss");
  return response.data;
}

export async function getBalanceSheetReport() {
  const response = await api.get("/finance/reports/balance-sheet");
  return response.data;
}

export async function getCashbookReport() {
  const response = await api.get("/finance/reports/cashbook");
  return response.data;
}

export async function getAccruedExpenseAgingReport(
  options: boolean | { include_closed?: boolean } = false
) {
  const response = await api.get("/finance/reports/accrued-expense-aging", {
    params: { include_closed: includeClosedValue(options) },
  });
  return response.data;
}

export async function getCustomerReceivablesAgingReport(
  options: boolean | { include_closed?: boolean } = false
) {
  const response = await api.get("/finance/reports/customer-receivables-aging", {
    params: { include_closed: includeClosedValue(options) },
  });
  return response.data;
}

export async function getSupplierPayablesAgingReport(
  options: boolean | { include_closed?: boolean } = false
) {
  const response = await api.get("/finance/reports/supplier-payables-aging", {
    params: { include_closed: includeClosedValue(options) },
  });
  return response.data;
}

export const getGeneralLedger = getGeneralLedgerReport;
export const getTrialBalance = getTrialBalanceReport;
export const getProfitAndLoss = getProfitAndLossReport;
export const getBalanceSheet = getBalanceSheetReport;
export const getCashbook = getCashbookReport;
export const getAccruedExpenseAging = getAccruedExpenseAgingReport;
export const getCustomerReceivablesAging = getCustomerReceivablesAgingReport;
export const getSupplierPayablesAging = getSupplierPayablesAgingReport;

// ===============================
// Business Reports (Customer/Product/Profit Analytics)
// server.js mount: /api/reports
// ===============================

export async function getCustomerWeeklyPerformance(weekDate?: string) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  const response = await api.get("/reports/customer-weekly-performance", { params });
  return response.data;
}

export async function getDormantCustomers(
  weekDate?: string,
  status?: "ACTIVE" | "AT_RISK" | "DORMANT"
) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  if (status) params.status = status;
  const response = await api.get("/reports/dormant-customers", { params });
  return response.data;
}

export async function getCustomerRfmAnalysis(weekDate?: string) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  const response = await api.get("/reports/customer-rfm", { params });
  return response.data;
}

export async function getWeeklySalesByProduct(weekDate?: string) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  const response = await api.get("/reports/weekly-sales-by-product", { params });
  return response.data;
}

export async function getWeeklyPurchasesByProduct(weekDate?: string) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  const response = await api.get("/reports/weekly-purchases-by-product", { params });
  return response.data;
}

export async function getWeeklyProfitByProduct(weekDate?: string) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  const response = await api.get("/reports/weekly-profit-by-product", { params });
  return response.data;
}

export async function getWeeklyManagementSummary(weekDate?: string) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  const response = await api.get("/reports/weekly-management-summary", { params });
  return response.data;
}

export async function getCustomerConcentration(weekDate?: string) {
  const params: Record<string, string> = {};
  if (weekDate) params.week_date = weekDate;
  const response = await api.get("/reports/customer-concentration", { params });
  return response.data;
}
