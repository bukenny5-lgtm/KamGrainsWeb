import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOperatingContext } from "@/lib/operatingContext";
import {
  BarChart3,
  Boxes,
  Factory,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  Truck,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";

import {
  getApInvoiceSummary,
  getApPaymentSummary,
  getArInvoiceSummary,
  getArPaymentSummary,
  getBalanceSheetReport,
  getCashbookReport,
  getCleaningBatchSummary,
  getCustomerWeeklyPerformance,
  getDormantCustomers,
  getCustomerRfmAnalysis,
  getWeeklySalesByProduct,
  getWeeklyPurchasesByProduct,
  getWeeklyProfitByProduct,
  getWeeklyManagementSummary,
  getCustomerConcentration,
  getDeliveries,
  getExpenseVouchers,
  getGoodsReceiptSummary,
  getProfitAndLossReport,
  getStockMovements,
  getStockOnHand,
  getTrialBalanceReport,
} from "@/api/client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import WeekSelector from "@/components/WeekSelector";

type AnyRecord = Record<string, any>;

type ReportDefinition = {
  key: string;
  title: string;
  icon: any;
  rows: AnyRecord[];
  columns: string[];
};

function normalizeArray(data: any, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;

  return [];
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCell(column: string, value: unknown) {
  const moneyColumns = [
    "invoice_total",
    "total_paid",
    "amount_paid",
    "balance_due",
    "balance",
    "amount",
    "applied_amount",
    "unapplied_amount",
    "total_amount",
    "debit",
    "credit",
    "net_balance",
    "cash_in",
    "cash_out",
    "net_cash_movement",
    "total_value",
    "delivery_total",
    "cost_value",
    "total_revenue",
    "total_purchases",
    "total_gross_profit",
    "revenue",
    "purchase_value",
    "cogs",
    "gross_profit",
    "top_customer_revenue",
    "top_product_revenue",
    "average_order_value",
    "last_purchase_value",
    "monetary",
  ];

  const qtyColumns = [
    "qty",
    "quantity",
    "current_stock",
    "qty_on_hand",
    "input_qty",
    "output_qty",
    "waste_qty",
    "total_qty",
    "line_count",
    "orders_count",
    "total_kg_purchased",
    "kg_sold",
    "kg_purchased",
    "customers_count",
    "supplier_count",
    "frequency",
    "days_since_last_purchase",
  ];

  const percentColumns = [
    "gross_margin_pct",
    "revenue_pct",
    "yield_pct",
  ];

  if (moneyColumns.includes(column)) return formatMoney(value);
  if (qtyColumns.includes(column)) return formatNumber(value);
  if (percentColumns.includes(column)) {
    const num = Number(value || 0);
    return `${num.toFixed(2)}%`;
  }
  if (column.includes("date")) return formatDate(value);
  if (column.includes("created_at")) return formatDateTime(value);
  if (column === "segment") {
    const segment = String(value || "");
    const colors: Record<string, string> = {
      Champion: "bg-green-100 text-green-800",
      Loyal: "bg-blue-100 text-blue-800",
      Regular: "bg-slate-100 text-slate-800",
      "At Risk": "bg-yellow-100 text-yellow-800",
      Dormant: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[segment] || ""}>{segment}</Badge>;
  }
  if (column === "status") {
    const status = String(value || "");
    const colors: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-800",
      AT_RISK: "bg-yellow-100 text-yellow-800",
      DORMANT: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[status] || ""}>{status}</Badge>;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";

  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export default function Reports() {
  const operating = useOperatingContext();
  const branchId = operating.currentBranch?.branch_id || "";
  const [selectedReport, setSelectedReport] = useState("stock-on-hand");
  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [weekDate, setWeekDate] = useState(new Date());

  // Format week date for API calls
  const weekDateStr = weekDate.toISOString().split('T')[0];

  // Existing reports
  const stockQuery = useQuery({
    queryKey: ["reports-stock-on-hand", branchId],
    queryFn: () => getStockOnHand(),
  });

  const movementsQuery = useQuery({
    queryKey: ["reports-stock-movements", branchId],
    queryFn: getStockMovements,
  });

  const grnQuery = useQuery({
    queryKey: ["reports-grn-summary", branchId],
    queryFn: getGoodsReceiptSummary,
  });

  const cleaningQuery = useQuery({
    queryKey: ["reports-cleaning-summary", branchId],
    queryFn: getCleaningBatchSummary,
  });

  const deliveriesQuery = useQuery({
    queryKey: ["reports-deliveries", branchId],
    queryFn: getDeliveries,
  });

  const arInvoicesQuery = useQuery({
    queryKey: ["reports-ar-invoices", branchId],
    queryFn: getArInvoiceSummary,
  });

  const arPaymentsQuery = useQuery({
    queryKey: ["reports-ar-payments", branchId],
    queryFn: getArPaymentSummary,
  });

  const apInvoicesQuery = useQuery({
    queryKey: ["reports-ap-invoices", branchId],
    queryFn: getApInvoiceSummary,
  });

  const apPaymentsQuery = useQuery({
    queryKey: ["reports-ap-payments", branchId],
    queryFn: getApPaymentSummary,
  });

  const expensesQuery = useQuery({
    queryKey: ["reports-expense-vouchers", branchId],
    queryFn: getExpenseVouchers,
  });

  const trialBalanceQuery = useQuery({
    queryKey: ["reports-trial-balance", branchId],
    queryFn: getTrialBalanceReport,
  });

  const profitLossQuery = useQuery({
    queryKey: ["reports-profit-loss", branchId],
    queryFn: getProfitAndLossReport,
  });

  const balanceSheetQuery = useQuery({
    queryKey: ["reports-balance-sheet", branchId],
    queryFn: getBalanceSheetReport,
  });

  const cashbookQuery = useQuery({
    queryKey: ["reports-cashbook", branchId],
    queryFn: getCashbookReport,
  });

  // NEW: Business reports with week parameter
  const customerWeeklyQuery = useQuery({
    queryKey: ["reports-customer-weekly-performance", branchId, weekDateStr],
    queryFn: () => getCustomerWeeklyPerformance(weekDateStr),
  });

  const dormantCustomersQuery = useQuery({
    queryKey: ["reports-dormant-customers", branchId, weekDateStr],
    queryFn: () => getDormantCustomers(weekDateStr),
  });

  const rfmAnalysisQuery = useQuery({
    queryKey: ["reports-customer-rfm", branchId, weekDateStr],
    queryFn: () => getCustomerRfmAnalysis(weekDateStr),
  });

  const weeklySalesQuery = useQuery({
    queryKey: ["reports-weekly-sales-by-product", branchId, weekDateStr],
    queryFn: () => getWeeklySalesByProduct(weekDateStr),
  });

  const weeklyPurchasesQuery = useQuery({
    queryKey: ["reports-weekly-purchases-by-product", branchId, weekDateStr],
    queryFn: () => getWeeklyPurchasesByProduct(weekDateStr),
  });

  const weeklyProfitQuery = useQuery({
    queryKey: ["reports-weekly-profit-by-product", branchId, weekDateStr],
    queryFn: () => getWeeklyProfitByProduct(weekDateStr),
  });

  const managementSummaryQuery = useQuery({
    queryKey: ["reports-weekly-management-summary", branchId, weekDateStr],
    queryFn: () => getWeeklyManagementSummary(weekDateStr),
  });

  const concentrationQuery = useQuery({
    queryKey: ["reports-customer-concentration", branchId, weekDateStr],
    queryFn: () => getCustomerConcentration(weekDateStr),
  });

  // Normalize data
  const stockRows = normalizeArray(stockQuery.data, ["data", "stock", "rows"]);
  const movementRows = normalizeArray(movementsQuery.data, ["data", "movements", "rows"]);
  const grnRows = normalizeArray(grnQuery.data, ["data", "goods_receipts", "grns"]);
  const cleaningRows = normalizeArray(cleaningQuery.data, ["data"]);
  const deliveryRows = normalizeArray(deliveriesQuery.data, ["data", "deliveries"]);
  const arInvoiceRows = normalizeArray(arInvoicesQuery.data, ["data"]);
  const arPaymentRows = normalizeArray(arPaymentsQuery.data, ["data"]);
  const apInvoiceRows = normalizeArray(apInvoicesQuery.data, ["data"]);
  const apPaymentRows = normalizeArray(apPaymentsQuery.data, ["data"]);
  const expenseRows = normalizeArray(expensesQuery.data, ["data"]);
  const trialBalanceRows = normalizeArray(trialBalanceQuery.data, ["data"]);
  const profitLossRows = normalizeArray(profitLossQuery.data, ["data"]);
  const balanceSheetRows = normalizeArray(balanceSheetQuery.data, ["data"]);
  const cashbookRows = normalizeArray(cashbookQuery.data, ["data"]);

  // NEW: Business reports data
  const customerWeeklyRows = normalizeArray(customerWeeklyQuery.data, ["data"]);
  const dormantRows = normalizeArray(dormantCustomersQuery.data, ["data"]);
  const rfmRows = normalizeArray(rfmAnalysisQuery.data, ["data"]);
  const weeklySalesRows = normalizeArray(weeklySalesQuery.data, ["data"]);
  const weeklyPurchasesRows = normalizeArray(weeklyPurchasesQuery.data, ["data"]);
  const weeklyProfitRows = normalizeArray(weeklyProfitQuery.data, ["data"]);
  const managementSummaryRows = managementSummaryQuery.data?.data
    ? [managementSummaryQuery.data.data]
    : [];
  const concentrationRows = normalizeArray(concentrationQuery.data, ["data"]);

  const reports: ReportDefinition[] = [
    {
      key: "stock-on-hand",
      title: "Inventory Stock On Hand",
      icon: Boxes,
      rows: stockRows,
      columns: [
        "product_name",
        "sku",
        "lot_code",
        "location_name",
        "qty_on_hand",
        "expiry_date",
      ],
    },
    {
      key: "stock-movements",
      title: "Stock Movements",
      icon: FileText,
      rows: movementRows,
      columns: [
        "movement_date",
        "movement_type",
        "product_name",
        "lot_code",
        "from_location_name",
        "to_location_name",
        "qty",
        "created_by",
        "created_at",
      ],
    },
    {
      key: "grn",
      title: "GRN Summary",
      icon: PackageCheck,
      rows: grnRows,
      columns: [
        "grn_no",
        "supplier_name",
        "po_no",
        "receipt_date",
        "location_name",
        "status",
        "is_posted",
        "total_delivered_qty",
        "accepted_qty",
        "rejected_qty",
        "total_value",
      ],
    },
    {
      key: "cleaning",
      title: "Cleaning Batch Summary",
      icon: Factory,
      rows: cleaningRows,
      columns: [
        "batch_no",
        "batch_date",
        "input_product_name",
        "output_product_name",
        "input_lot_code",
        "output_lot_code",
        "raw_location_name",
        "fg_location_name",
        "input_qty",
        "output_qty",
        "waste_qty",
        "yield_pct",
        "status",
      ],
    },
    {
      key: "deliveries",
      title: "Delivery Summary",
      icon: Truck,
      rows: deliveryRows,
      columns: [
        "delivery_no",
        "customer_name",
        "so_no",
        "delivery_date",
        "location_name",
        "status",
        "is_posted",
        "line_count",
        "delivery_total",
      ],
    },
    {
      key: "ar-invoices",
      title: "AR Invoice Summary",
      icon: FileText,
      rows: arInvoiceRows,
      columns: [
        "invoice_no",
        "customer_name",
        "delivery_no",
        "so_no",
        "invoice_date",
        "due_date",
        "status",
        "invoice_total",
        "total_paid",
        "balance_due",
      ],
    },
    {
      key: "receipts",
      title: "Customer Receipts",
      icon: WalletCards,
      rows: arPaymentRows,
      columns: [
        "receipt_no",
        "customer_name",
        "payment_date",
        "amount",
        "method",
        "reference",
        "applied_amount",
        "unapplied_amount",
        "applied_invoices",
        "is_posted",
      ],
    },
    {
      key: "ap-invoices",
      title: "AP Invoice Summary",
      icon: FileText,
      rows: apInvoiceRows,
      columns: [
        "invoice_no",
        "supplier_name",
        "grn_no",
        "invoice_date",
        "due_date",
        "status",
        "invoice_total",
        "total_paid",
        "balance_due",
        "is_posted",
      ],
    },
    {
      key: "ap-payments",
      title: "Supplier Payments",
      icon: WalletCards,
      rows: apPaymentRows,
      columns: [
        "payment_no",
        "supplier_name",
        "payment_date",
        "amount",
        "method",
        "reference",
        "applied_amount",
        "unapplied_amount",
        "applied_invoices",
        "is_posted",
      ],
    },
    {
      key: "expenses",
      title: "Expense Vouchers",
      icon: WalletCards,
      rows: expenseRows,
      columns: [
        "voucher_no",
        "voucher_date",
        "payee_name",
        "payment_account_name",
        "payment_method",
        "reference_no",
        "status",
        "line_count",
        "total_amount",
        "posted_journal_id",
      ],
    },
    {
      key: "trial-balance",
      title: "Trial Balance",
      icon: BarChart3,
      rows: trialBalanceRows,
      columns: [
        "account_code",
        "account_name",
        "account_type",
        "debit",
        "credit",
        "net_balance",
      ],
    },
    {
      key: "profit-loss",
      title: "Profit and Loss",
      icon: BarChart3,
      rows: profitLossRows,
      columns: [
        "account_type",
        "account_code",
        "account_name",
        "debit",
        "credit",
        "amount",
      ],
    },
    {
      key: "balance-sheet",
      title: "Balance Sheet",
      icon: BarChart3,
      rows: balanceSheetRows,
      columns: [
        "account_type",
        "account_code",
        "account_name",
        "debit",
        "credit",
        "amount",
      ],
    },
    {
      key: "cashbook",
      title: "Cashbook",
      icon: WalletCards,
      rows: cashbookRows,
      columns: [
        "journal_no",
        "journal_date",
        "description",
        "source_module",
        "account_name",
        "cash_in",
        "cash_out",
        "net_cash_movement",
      ],
    },
    {
      key: "customer-weekly-performance",
      title: "Customer Weekly Performance",
      icon: Users,
      rows: customerWeeklyRows,
      columns: [
        "customer_code",
        "customer_name",
        "orders_count",
        "total_kg_purchased",
        "total_revenue",
        "average_order_value",
        "last_purchase_date",
      ],
    },
    {
      key: "dormant-customers",
      title: "Dormant Customers",
      icon: Users,
      rows: dormantRows,
      columns: [
        "customer_code",
        "customer_name",
        "last_purchase_date",
        "days_since_last_purchase",
        "last_purchase_value",
        "status",
      ],
    },
    {
      key: "customer-rfm",
      title: "Customer RFM Analysis",
      icon: TrendingUp,
      rows: rfmRows,
      columns: [
        "customer_code",
        "customer_name",
        "recency",
        "frequency",
        "monetary",
        "segment",
      ],
    },
    {
      key: "weekly-sales-by-product",
      title: "Weekly Sales by Product",
      icon: BarChart3,
      rows: weeklySalesRows,
      columns: [
        "product_name",
        "sku",
        "kg_sold",
        "revenue",
        "average_selling_price",
        "orders_count",
        "customers_count",
      ],
    },
    {
      key: "weekly-purchases-by-product",
      title: "Weekly Purchases by Product",
      icon: BarChart3,
      rows: weeklyPurchasesRows,
      columns: [
        "product_name",
        "sku",
        "kg_purchased",
        "purchase_value",
        "average_cost_per_kg",
        "supplier_count",
      ],
    },
    {
      key: "weekly-profit-by-product",
      title: "Weekly Gross Profit by Product",
      icon: TrendingUp,
      rows: weeklyProfitRows,
      columns: [
        "product_name",
        "sku",
        "revenue",
        "cogs",
        "gross_profit",
        "gross_margin_pct",
      ],
    },
    {
      key: "management-summary",
      title: "Weekly Management Summary",
      icon: BarChart3,
      rows: managementSummaryRows.length > 0 ? [managementSummaryRows[0]] : [],
      columns: [
        "week_start",
        "week_end",
        "total_revenue",
        "total_purchases",
        "total_gross_profit",
        "gross_margin_pct",
        "total_orders",
        "total_customers",
        "new_customers",
        "dormant_customers_count",
        "top_customer",
        "top_customer_revenue",
        "top_product",
        "top_product_revenue",
        "average_order_value",
      ],
    },
    {
      key: "customer-concentration",
      title: "Customer Concentration Risk",
      icon: Users,
      rows: concentrationRows,
      columns: [
        "rank",
        "customer_code",
        "customer_name",
        "revenue",
        "revenue_pct",
        "kg_purchased",
        "orders_count",
      ],
    },
  ];

  const currentReport =
    reports.find((report) => report.key === selectedReport) || reports[0];

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return currentReport.rows;

    return currentReport.rows.filter((row) =>
      currentReport.columns
        .map((column) => row[column])
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [currentReport, search]);

  const totalRecords = filteredRows.length;

  const totalAmount = filteredRows.reduce((sum, row) => {
    const value =
      row.invoice_total ??
      row.delivery_total ??
      row.total_value ??
      row.total_amount ??
      row.amount ??
      row.net_cash_movement ??
      row.total_revenue ??
      row.revenue ??
      0;

    return sum + Number(value || 0);
  }, 0);

  const loading =
    stockQuery.isLoading ||
    movementsQuery.isLoading ||
    grnQuery.isLoading ||
    cleaningQuery.isLoading ||
    deliveriesQuery.isLoading ||
    arInvoicesQuery.isLoading ||
    arPaymentsQuery.isLoading ||
    apInvoicesQuery.isLoading ||
    apPaymentsQuery.isLoading ||
    expensesQuery.isLoading ||
    trialBalanceQuery.isLoading ||
    profitLossQuery.isLoading ||
    balanceSheetQuery.isLoading ||
    cashbookQuery.isLoading ||
    customerWeeklyQuery.isLoading ||
    dormantCustomersQuery.isLoading ||
    rfmAnalysisQuery.isLoading ||
    weeklySalesQuery.isLoading ||
    weeklyPurchasesQuery.isLoading ||
    weeklyProfitQuery.isLoading ||
    managementSummaryQuery.isLoading ||
    concentrationQuery.isLoading;

  const hasError =
    stockQuery.isError ||
    movementsQuery.isError ||
    grnQuery.isError ||
    cleaningQuery.isError ||
    deliveriesQuery.isError ||
    arInvoicesQuery.isError ||
    arPaymentsQuery.isError ||
    apInvoicesQuery.isError ||
    apPaymentsQuery.isError ||
    expensesQuery.isError ||
    trialBalanceQuery.isError ||
    profitLossQuery.isError ||
    balanceSheetQuery.isError ||
    cashbookQuery.isError;

  async function handleRefresh() {
    await Promise.all([
      stockQuery.refetch(),
      movementsQuery.refetch(),
      grnQuery.refetch(),
      cleaningQuery.refetch(),
      deliveriesQuery.refetch(),
      arInvoicesQuery.refetch(),
      arPaymentsQuery.refetch(),
      apInvoicesQuery.refetch(),
      apPaymentsQuery.refetch(),
      expensesQuery.refetch(),
      trialBalanceQuery.refetch(),
      profitLossQuery.refetch(),
      balanceSheetQuery.refetch(),
      cashbookQuery.refetch(),
      customerWeeklyQuery.refetch(),
      dormantCustomersQuery.refetch(),
      rfmAnalysisQuery.refetch(),
      weeklySalesQuery.refetch(),
      weeklyPurchasesQuery.refetch(),
      weeklyProfitQuery.refetch(),
      managementSummaryQuery.refetch(),
      concentrationQuery.refetch(),
    ]);

    setLastRefreshed(new Date());
  }

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (hasError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Reports failed to load</AlertTitle>
        <AlertDescription>
          Check backend connection and confirm all report routes are available.
        </AlertDescription>
      </Alert>
    );
  }

  const CurrentIcon = currentReport.icon;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1 text-slate-500">
            Central reporting center for inventory, purchasing, sales, finance, and expenses.
          </p>
        </div>

        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh All
        </Button>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-slate-500">
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      {/* Week Selector - Show only for business reports */}
      {selectedReport.startsWith("customer-") ||
      selectedReport.startsWith("weekly-") ||
      selectedReport === "management-summary" ? (
        <WeekSelector selectedDate={weekDate} onDateChange={setWeekDate} />
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Current Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CurrentIcon className="h-5 w-5 text-slate-500" />
              <p className="text-xl font-bold">{currentReport.title}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalRecords}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Amount Indicator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">
              Uses the main value column where applicable.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2">
              <CurrentIcon className="h-5 w-5" />
              {currentReport.title}
            </CardTitle>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <select
                value={selectedReport}
                onChange={(event) => {
                  setSelectedReport(event.target.value);
                  setSearch("");
                }}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {reports.map((report) => (
                  <option key={report.key} value={report.key}>
                    {report.title}
                  </option>
                ))}
              </select>

              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search selected report..."
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  {currentReport.columns.map((column) => (
                    <TableHead key={column}>
                      {column.replaceAll("_", " ").toUpperCase()}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={currentReport.columns.length}
                      className="h-24 text-center"
                    >
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row, index) => (
                    <TableRow key={index}>
                      {currentReport.columns.map((column) => {
                        const value = row[column];

                        const isNumeric =
                          typeof value === "number" ||
                          [
                            "qty",
                            "quantity",
                            "current_stock",
                            "qty_on_hand",
                            "input_qty",
                            "output_qty",
                            "waste_qty",
                            "total_qty",
                            "invoice_total",
                            "total_paid",
                            "amount",
                            "balance_due",
                            "balance",
                            "debit",
                            "credit",
                            "net_balance",
                            "cash_in",
                            "cash_out",
                            "net_cash_movement",
                            "total_amount",
                            "delivery_total",
                            "total_value",
                            "total_revenue",
                            "revenue",
                            "total_kg_purchased",
                            "kg_sold",
                            "kg_purchased",
                            "orders_count",
                            "frequency",
                            "monetary",
                            "rank",
                            "revenue_pct",
                          ].includes(column);

                        return (
                          <TableCell
                            key={column}
                            className={isNumeric ? "text-right" : ""}
                          >
                            {column === "status" || column === "segment" ? (
                              <Badge variant="outline">
                                {formatCell(column, value)}
                              </Badge>
                            ) : (
                              formatCell(column, value)
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
