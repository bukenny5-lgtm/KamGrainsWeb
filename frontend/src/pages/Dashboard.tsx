import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  Factory,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCcw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wallet,
  WalletCards,
} from "lucide-react";

import { getDashboardSummary } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AnyRecord = Record<string, any>;

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

function formatDateTime(value: unknown) {
  if (!value) return "-";

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  onOpen,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  onOpen?: () => void;
}) {
  return (
    <Card
      className="cursor-pointer rounded-2xl border-slate-200 shadow-sm transition hover:shadow-md"
      onDoubleClick={onOpen}
      onClick={onOpen}
      title="Click to open details"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">
          {title}
        </CardTitle>
        <div className="rounded-xl bg-slate-100 p-2">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-950">{value}</div>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });

  async function handleRefresh() {
    await refetch();
    setLastRefreshed(new Date());
  }

  const summary = data?.data || {};
  const stockByProduct: AnyRecord[] = normalizeArray(summary.stock_by_product);
  const recentMovements: AnyRecord[] = normalizeArray(
    summary.recent_stock_movements
  );
  const recentInvoices: AnyRecord[] = normalizeArray(summary.recent_invoices);
  const recentReceipts: AnyRecord[] = normalizeArray(summary.recent_receipts);
  const alerts: AnyRecord[] = normalizeArray(summary.alerts);

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Dashboard failed to load</AlertTitle>
        <AlertDescription>
          {(error as Error)?.message || "Check that the backend is running."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-slate-500">
            Integrated business overview for inventory, sales, finance,
            purchasing, production, and operational alerts.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button onClick={handleRefresh} disabled={isFetching}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          {lastRefreshed && (
            <p className="text-xs text-slate-500">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Stock Qty"
          value={`${formatNumber(summary?.inventory?.total_stock_qty)} KG`}
          subtitle={`${formatNumber(summary?.inventory?.product_count)} products | ${formatNumber(summary?.inventory?.lot_count)} lots`}
          icon={Boxes}
          onOpen={() => navigate("/inventory")}
        />

        <StatCard
          title="Total Sales"
          value={formatMoney(summary?.sales?.total_sales)}
          subtitle={`${formatNumber(summary?.sales?.posted_invoice_count)} posted customer invoices`}
          icon={TrendingUp}
          onOpen={() => navigate("/ar-invoices")}
        />

        <StatCard
          title="Cash Balance"
          value={formatMoney(summary?.cash?.cash_balance)}
          subtitle={`In: ${formatMoney(summary?.cash?.cash_in)} | Out: ${formatMoney(summary?.cash?.cash_out)}`}
          icon={Wallet}
          onOpen={() => navigate("/payment-accounts")}
        />

        <StatCard
          title="Net Profit"
          value={formatMoney(summary?.profit_and_loss?.net_profit)}
          subtitle={`Income: ${formatMoney(summary?.profit_and_loss?.income)}`}
          icon={WalletCards}
          onOpen={() => navigate("/reports")}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Purchase Orders"
          value={formatNumber(summary?.purchasing?.po_count)}
          subtitle={`${formatNumber(summary?.purchasing?.open_po_count)} open | ${formatMoney(summary?.purchasing?.po_value)}`}
          icon={ShoppingCart}
          onOpen={() => navigate("/purchasing")}
        />

        <StatCard
          title="Goods Receipts"
          value={formatNumber(summary?.goods_receipts?.grn_count)}
          subtitle={`${formatNumber(summary?.goods_receipts?.posted_grn_count)} posted | ${formatMoney(summary?.goods_receipts?.grn_value)}`}
          icon={PackageCheck}
          onOpen={() => navigate("/grn")}
        />

        <StatCard
          title="Deliveries"
          value={formatNumber(summary?.deliveries?.delivery_count)}
          subtitle={`${formatNumber(summary?.deliveries?.unposted_delivery_count)} unposted | ${formatMoney(summary?.deliveries?.delivery_value)}`}
          icon={Truck}
          onOpen={() => navigate("/deliveries")}
        />

        <StatCard
          title="Cleaning Batches"
          value={formatNumber(summary?.cleaning?.batch_count)}
          subtitle={`${formatNumber(summary?.cleaning?.total_clean_produced)} KG clean produced`}
          icon={Factory}
          onOpen={() => navigate("/cleaning")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-2xl shadow-sm xl:col-span-2">
          <CardHeader>
            <CardTitle>Receivables & Payables</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div
              className="cursor-pointer rounded-2xl bg-slate-50 p-5 hover:bg-slate-100"
              onDoubleClick={() => navigate("/receipts")}
              onClick={() => navigate("/receipts")}
            >
              <p className="text-sm text-slate-500">Customer Receivables</p>
              <p className="mt-2 text-2xl font-bold">
                {formatMoney(summary?.receivables?.ar_balance)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Paid: {formatMoney(summary?.receivables?.total_ar_paid)} | Open invoices: {formatNumber(summary?.receivables?.open_invoice_count)}
              </p>
            </div>

            <div
              className="cursor-pointer rounded-2xl bg-slate-50 p-5 hover:bg-slate-100"
              onDoubleClick={() => navigate("/ap-payments")}
              onClick={() => navigate("/ap-payments")}
            >
              <p className="text-sm text-slate-500">Supplier Payables</p>
              <p className="mt-2 text-2xl font-bold">
                {formatMoney(summary?.payables?.ap_balance)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Paid: {formatMoney(summary?.payables?.total_ap_paid)} | Open invoices: {formatNumber(summary?.payables?.open_invoice_count)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Operational Alerts</CardTitle>
            <AlertTriangle className="h-5 w-5 text-slate-500" />
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500">No alerts found.</p>
            ) : (
              alerts.map((item) => (
                <div
                  key={item.alert_label}
                  className="flex items-center justify-between rounded-xl border p-3 text-sm"
                >
                  <span className="text-slate-600">{item.alert_label}</span>
                  <Badge variant={Number(item.alert_value || 0) > 0 ? "destructive" : "outline"}>
                    {formatNumber(item.alert_value)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Stock by Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stockByProduct.slice(0, 8).map((item) => (
              <SmallMetric
                key={item.product_id || item.sku || item.product_name}
                label={`${item.product_name || "Product"} (${item.sku || "-"})`}
                value={`${formatNumber(item.qty_on_hand)} KG`}
              />
            ))}
            {stockByProduct.length === 0 && (
              <p className="text-sm text-slate-500">No stock available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent Stock Movements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center">
                        No recent movements.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentMovements.map((row) => (
                      <TableRow
                        key={row.movement_id}
                        className="cursor-pointer"
                        onDoubleClick={() => navigate("/stock-movements")}
                        onClick={() => navigate("/stock-movements")}
                      >
                        <TableCell>{formatDateTime(row.movement_ts)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.movement_type}</Badge>
                        </TableCell>
                        <TableCell>{row.document_no || "-"}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.total_qty)} KG
                        </TableCell>
                        <TableCell>{row.created_by_name || "System"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Customer Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center">
                        No invoices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentInvoices.map((row) => (
                      <TableRow
                        key={row.ar_invoice_id}
                        className="cursor-pointer"
                        onDoubleClick={() => navigate("/ar-invoices")}
                        onClick={() => navigate("/ar-invoices")}
                      >
                        <TableCell>{row.invoice_no}</TableCell>
                        <TableCell>{row.customer_name || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={row.posted_journal_id ? "default" : "outline"}>
                            {row.posted_journal_id ? "Posted" : row.status || "Open"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.invoice_total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Recent Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentReceipts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center">
                        No receipts found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentReceipts.map((row) => (
                      <TableRow
                        key={row.ar_payment_id}
                        className="cursor-pointer"
                        onDoubleClick={() => navigate("/receipts")}
                        onClick={() => navigate("/receipts")}
                      >
                        <TableCell>{row.receipt_no}</TableCell>
                        <TableCell>{row.customer_name || "-"}</TableCell>
                        <TableCell>{row.method || "-"}</TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
