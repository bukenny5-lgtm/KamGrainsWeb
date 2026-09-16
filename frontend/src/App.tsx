import { createBrowserRouter, RouterProvider } from "react-router-dom";

import AppLayout from "@/layout/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/lib/auth";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import InventoryStock from "@/pages/InventoryStock";
import StockMovements from "@/pages/StockMovements";
import PurchaseOrders from "@/pages/PurchaseOrders";
import GoodsReceipts from "@/pages/GoodsReceipts";
import CleaningBatches from "@/pages/CleaningBatches";
import SalesOrders from "@/pages/SalesOrders";
import Deliveries from "@/pages/Deliveries";
import Finance from "@/pages/Finance";
import ArInvoices from "@/pages/ArInvoices";
import ArPayments from "@/pages/ArPayments";
import ApInvoices from "@/pages/ApInvoices";
import ApPayments from "@/pages/ApPayments";
import ExpenseVouchers from "@/pages/ExpenseVouchers";
import Reports from "@/pages/Reports";
import Journals from "@/pages/Journals";
import StockCount from "@/pages/StockCount";
import Setup from "@/pages/Setup";
import AuditLog from "@/pages/AuditLog";
import Users from "@/pages/Users";
import ChangePassword from "@/pages/ChangePassword";
import Unauthorized from "@/pages/Unauthorized";
import { ROLE_GROUPS, roleList } from "@/lib/permissions";
import PaymentAccounts from "@/pages/PaymentAccounts";
import OpeningBalances from "@/pages/OpeningBalances";
import AccruedExpenses from "@/pages/AccruedExpenses";
import StockAdjustments from "@/pages/StockAdjustments";
import ApiPaymentChannels from "@/pages/ApiPaymentChannels";
import Reconciliations from "@/pages/Reconciliations";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/change-password",
    element: (
      <ProtectedRoute>
        <ChangePassword />
      </ProtectedRoute>
    ),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: "unauthorized",
        element: <Unauthorized />,
      },
      {
        path: "inventory",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.INVENTORY_VIEW_ACCESS)}>
            <InventoryStock />
          </ProtectedRoute>
        ),
      },
      {
        path: "stock-movements",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.INVENTORY_VIEW_ACCESS)}>
            <StockMovements />
          </ProtectedRoute>
        ),
      },
      {
        path: "purchasing",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.PURCHASING_ACCESS)}>
            <PurchaseOrders />
          </ProtectedRoute>
        ),
      },
      {
        path: "grn",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.PURCHASING_ACCESS)}>
            <GoodsReceipts />
          </ProtectedRoute>
        ),
      },
      {
        path: "cleaning",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.INVENTORY_ACCESS)}>
            <CleaningBatches />
          </ProtectedRoute>
        ),
      },
      {
        path: "sales",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.SALES_ACCESS)}>
            <SalesOrders />
          </ProtectedRoute>
        ),
      },
      {
        path: "deliveries",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.SALES_ACCESS)}>
            <Deliveries />
          </ProtectedRoute>
        ),
      },
      {
        path: "ar-invoices",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.SALES_ACCESS)}>
            <ArInvoices />
          </ProtectedRoute>
        ),
      },
      {
        path: "receipts",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <ArPayments />
          </ProtectedRoute>
        ),
      },
      {
        path: "ap-invoices",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <ApInvoices />
          </ProtectedRoute>
        ),
      },
      {
        path: "ap-payments",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <ApPayments />
          </ProtectedRoute>
        ),
      },
      {
        path: "opening-balances",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <OpeningBalances />
          </ProtectedRoute>
        ),
      },
      {
        path: "expense-vouchers",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <ExpenseVouchers />
          </ProtectedRoute>
        ),
      },
      {
        path: "accrued-expenses",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <AccruedExpenses />
          </ProtectedRoute>
        ),
      },
      {
        path: "payment-accounts",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <PaymentAccounts />
          </ProtectedRoute>
        ),
      },
      {
        path: "reconciliations",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <Reconciliations />
          </ProtectedRoute>
        ),
      },
      {
        path: "api-payment-channels",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <ApiPaymentChannels />
          </ProtectedRoute>
        ),
      },
      {
        path: "setup",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.SETUP_ACCESS)}>
            <Setup />
          </ProtectedRoute>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.USER_ACCESS)}>
            <Users />
          </ProtectedRoute>
        ),
      },
      {
        path: "audit-log",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.AUDIT_ACCESS)}>
            <AuditLog />
          </ProtectedRoute>
        ),
      },
      {
        path: "finance",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.FINANCE_ACCESS)}>
            <Finance />
          </ProtectedRoute>
        ),
      },
      {
        path: "reports",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.REPORT_ACCESS)}>
            <Reports />
          </ProtectedRoute>
        ),
      },
      {
        path: "journals",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.JOURNAL_ACCESS)}>
            <Journals />
          </ProtectedRoute>
        ),
      },
      {
        path: "stock-count",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.INVENTORY_ACCESS)}>
            <StockCount />
          </ProtectedRoute>
        ),
      },
      {
        path: "stock-adjustments",
        element: (
          <ProtectedRoute allowedRoles={roleList(ROLE_GROUPS.INVENTORY_ACCESS)}>
            <StockAdjustments />
          </ProtectedRoute>
        ),
      },
      {
        path: "*",
        element: <Unauthorized />,
      },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
