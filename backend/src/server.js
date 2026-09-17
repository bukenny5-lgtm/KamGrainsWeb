import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { testConnection } from "./db.js";

import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/products.routes.js";
import locationRoutes from "./routes/locations.routes.js";
import partyRoutes from "./routes/parties.routes.js";
import uomRoutes from "./routes/uoms.routes.js";
import lotRoutes from "./routes/lots.routes.js";
import glAccountRoutes from "./routes/glAccounts.routes.js";

import purchaseOrderRoutes from "./routes/purchaseOrders.routes.js";
import goodsReceiptRoutes from "./routes/goodsReceipts.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import salesOrderRoutes from "./routes/salesOrders.routes.js";
import deliveryRoutes from "./routes/deliveries.routes.js";

import arInvoiceRoutes from "./routes/arInvoices.routes.js";
import arPaymentRoutes from "./routes/arPayments.routes.js";
import apInvoiceRoutes from "./routes/apInvoices.routes.js";
import apPaymentRoutes from "./routes/apPayments.routes.js";

import cleaningBatchRoutes from "./routes/cleaningBatches.routes.js";
import inventoryReportsRoutes from "./routes/inventoryReports.routes.js";
import stockCountRoutes from "./routes/stockCounts.routes.js";
import stockAdjustmentRoutes from "./routes/stockAdjustments.routes.js";

import financeRoutes from "./routes/finance.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

import userRoutes from "./routes/users.routes.js";
import auditEventRoutes from "./routes/auditEvents.routes.js";
import paymentAccountsRoutes from "./routes/paymentAccounts.routes.js";
import openingBalancesRoutes from "./routes/openingBalances.routes.js";
import accruedExpensesRoutes from "./routes/accruedExpenses.routes.js";
import apiPaymentChannelsRoutes from "./routes/apiPaymentChannels.routes.js";
import businessProfileRoutes from "./routes/businessProfile.routes.js";

// ✅ Import reconciliation routes
import reconciliationRoutes from "./routes/reconciliations.routes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    app: "KAM GRAINS SUPPLIES API",
    status: "running",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const db = await testConnection();

    res.json({
      success: true,
      message: "Backend and database are connected.",
      database: db.database_name,
      server_time: db.server_time,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed.",
      error: error.message,
    });
  }
});

// ===============================
// Master / Setup routes
// ===============================
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/uoms", uomRoutes);
app.use("/api/lots", lotRoutes);
app.use("/api/gl-accounts", glAccountRoutes);
app.use("/api/payment-accounts", paymentAccountsRoutes);
app.use("/api/opening-balances", openingBalancesRoutes);
app.use("/api/accrued-expenses", accruedExpensesRoutes);
app.use("/api/api-payment-channels", apiPaymentChannelsRoutes);
app.use("/api/business-profile", businessProfileRoutes);

// ===============================
// Operations routes
// ===============================
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/goods-receipts", goodsReceiptRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/sales-orders", salesOrderRoutes);
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/cleaning-batches", cleaningBatchRoutes);
app.use("/api/stock-adjustments", stockAdjustmentRoutes);

// ===============================
// Finance routes
// ===============================
app.use("/api/ar-invoices", arInvoiceRoutes);
app.use("/api/ar-payments", arPaymentRoutes);
app.use("/api/ap-invoices", apInvoiceRoutes);
app.use("/api/ap-payments", apPaymentRoutes);
app.use("/api/finance", financeRoutes);

// ===============================
// Reports / stock control routes
// ===============================
app.use("/api/reports", reportsRoutes);
app.use("/api/inventory-reports", inventoryReportsRoutes);
app.use("/api/stock-counts", stockCountRoutes);
app.use("/api/audit-events", auditEventRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ===============================
// ✅ Reconciliations
// ===============================
app.use("/api/reconciliations", reconciliationRoutes);

app.listen(PORT, () => {
  console.log(`KAM GRAINS API running at http://localhost:${PORT}`);
});
