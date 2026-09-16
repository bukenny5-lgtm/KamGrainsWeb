import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";

import {
  createArInvoiceFromDelivery,
  getArInvoiceById,
  getArInvoiceSummary,
  getDeliveries,
  postArInvoice,
  voidArInvoice,
} from "@/api/client";
import type {
  ArInvoiceDetailResponse,
  ArInvoiceReceiptApplication,
  ArInvoiceSummaryRow,
} from "@/types/api";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AnyRecord = Record<string, unknown>;

type ArInvoiceDeliveryRow = {
  delivery_id: string;
  delivery_no: string;

  customer_id?: string | null;
  customer_name?: string | null;

  so_id?: string | null;
  so_no?: string | null;

  delivery_date?: string | null;
  transaction_date?: string | null;

  status?: string | null;
  is_posted?: boolean | null;

  delivery_total?: string | number | null;

  line_count?: string | number | null;

  backdate_flag?: boolean | null;
  backdate_reason?: string | null;
  backdate_approved_by?: string | null;
  backdate_approved_at?: string | null;
};

function normalizeArray<T = AnyRecord>(data: unknown, keys: string[]): T[] {
  const record = data as Record<string, unknown> | null | undefined;

  for (const key of keys) {
    const value = record?.[key];

    if (Array.isArray(value)) return value as T[];
  }

  if (Array.isArray(record?.data)) return record.data as T[];
  if (Array.isArray(data)) return data as T[];

  return [];
}

function formatDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString();
}

function formatDateTime(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatQty(value: unknown) {
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

function getStatusBadge(status: unknown) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "PAID" || text === "CLOSED" || text === "POSTED") {
    return <Badge className="bg-green-600 hover:bg-green-600">{text}</Badge>;
  }

  if (text === "OPEN") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">OPEN</Badge>;
  }

  if (text === "VOID") {
    return <Badge variant="destructive">VOID</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
}

type ArInvoiceStatusFields = {
  is_posted?: boolean | null;
  posted_journal_id?: string | null;
  backdate_flag?: boolean | null;
};

function getPostedBadge(row: ArInvoiceStatusFields) {
  const isPosted = Boolean(row.is_posted || row.posted_journal_id);

  return isPosted ? (
    <Badge className="bg-green-600 hover:bg-green-600">Posted</Badge>
  ) : (
    <Badge variant="outline">Not Posted</Badge>
  );
}

function getBackdatedBadge(row: ArInvoiceStatusFields) {
  return row.backdate_flag ? (
    <Badge variant="outline" className="border-yellow-500 text-yellow-700">
      Backdated
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-300 text-slate-500">
      Normal
    </Badge>
  );
}

function isInvoicePosted(row: ArInvoiceStatusFields | undefined) {
  if (!row) return false;

  return Boolean(row.is_posted || row.posted_journal_id);
}
function getErrorMessage(error: unknown) {
  const err = error as {
    response?: {
      data?: {
        message?: string;
        error?: string;
        detail?: string;
      };
    };
    message?: string;
  };

  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.detail ||
    err?.message ||
    "Action failed. Please try again."
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCustomerInvoiceHtml(
  header: AnyRecord,
  lines: AnyRecord[],
  options: { mode: "print" | "pdf" }
) {
  const invoiceTotal =
    Number(header.invoice_total || 0) ||
    lines.reduce((sum, line) => {
      const qty = Number(line.sell_qty || line.qty || line.base_qty || 0);
      return sum + qty * Number(line.unit_price || 0);
    }, 0);

  const totalPaid = Number(header.total_paid || header.amount_paid || 0);
  const balance = Number(
    header.balance_due || header.balance || invoiceTotal - totalPaid
  );

  const lineRows = lines
    .map((line, index) => {
      const qty = Number(line.sell_qty || line.qty || line.base_qty || 0);
      const lineTotal = Number(line.line_total || qty * Number(line.unit_price || 0));

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(line.product_name || line.description || "-")}</td>
          <td>${escapeHtml(line.sku || "-")}</td>
          <td>${escapeHtml(line.sell_uom_code || line.uom_code || "KG")}</td>
          <td class="num">${formatQty(qty)}</td>
          <td class="num">${formatMoney(line.unit_price)}</td>
          <td class="num">${formatMoney(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(header.invoice_no || "Customer Invoice")}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 28px; background: white; }
          .doc { max-width: 900px; margin: 0 auto; }
          .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 14px; margin-bottom: 22px; }
          h1, h2, h3, p { margin: 0; }
          h1 { font-size: 26px; letter-spacing: 0.04em; }
          .subtitle { margin-top: 6px; color: #475569; font-size: 13px; }
          .invoice-title { text-align: right; }
          .invoice-title h2 { font-size: 22px; }
          .invoice-title p { margin-top: 6px; font-size: 13px; color: #475569; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 22px; }
          .box { border: 1px solid #d1d5db; border-radius: 10px; padding: 14px; }
          .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 4px; }
          .value { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
          th { background: #f1f5f9; border: 1px solid #d1d5db; padding: 9px; text-align: left; }
          td { border: 1px solid #e5e7eb; padding: 9px; vertical-align: top; }
          .num { text-align: right; white-space: nowrap; }
          .totals { width: 360px; margin-left: auto; margin-top: 18px; }
          .totals .row { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding: 8px 0; font-size: 14px; }
          .totals .grand { font-weight: 800; font-size: 16px; border-bottom: 2px solid #111827; }
          .footer { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 12px; color: #475569; }
          .sign { margin-top: 42px; border-top: 1px solid #111827; padding-top: 6px; }
          .note { margin-top: 24px; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px; font-size: 12px; color: #475569; }
          @media print { body { padding: 18px; } }
        </style>
      </head>
      <body>
        <div class="doc">
          <div class="top">
            <div>
              <h1>KAM GRAINS</h1>
              <p class="subtitle">Supplies Management System</p>
              <p class="subtitle">Customer invoice generated from KAM GRAINS system</p>
            </div>
            <div class="invoice-title">
              <h2>CUSTOMER INVOICE</h2>
              <p><strong>${escapeHtml(header.invoice_no || "-")}</strong></p>
              <p>${options.mode === "pdf" ? "PDF Copy" : "Print Copy"}</p>
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">Bill To</div>
              <div class="value">${escapeHtml(header.customer_name || "-")}</div>
              <div class="label">Delivery No</div>
              <div class="value">${escapeHtml(header.delivery_no || "-")}</div>
              <div class="label">Sales Order No</div>
              <div class="value">${escapeHtml(header.so_no || "-")}</div>
            </div>
            <div class="box">
              <div class="label">Invoice Date</div>
              <div class="value">${escapeHtml(formatDate(header.invoice_date))}</div>
              <div class="label">Due Date</div>
              <div class="value">${escapeHtml(formatDate(header.due_date))}</div>
              <div class="label">Status</div>
              <div class="value">${escapeHtml(header.status || "-")}</div>
            </div>
          </div>

          <h3>Invoice Lines</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 45px;">#</th>
                <th>Product</th>
                <th>SKU</th>
                <th>UOM</th>
                <th class="num">Qty</th>
                <th class="num">Unit Price</th>
                <th class="num">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows || `<tr><td colspan="7" style="text-align:center;">No invoice lines found.</td></tr>`}
            </tbody>
          </table>

          <div class="totals">
            <div class="row"><span>Invoice Total</span><strong>${formatMoney(invoiceTotal)}</strong></div>
            <div class="row"><span>Amount Paid</span><strong>${formatMoney(totalPaid)}</strong></div>
            <div class="row grand"><span>Balance Due</span><strong>${formatMoney(balance)}</strong></div>
          </div>

          <div class="note">
            This document was generated from KAM GRAINS Supplies Management System.
            Please confirm goods received and payment terms before processing payment.
          </div>

          <div class="footer">
            <div><div class="sign">Prepared By</div></div>
            <div><div class="sign">Customer Signature / Stamp</div></div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function openInvoicePrintWindow(
  header: AnyRecord,
  lines: AnyRecord[],
  mode: "print" | "pdf"
) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups and try again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildCustomerInvoiceHtml(header, lines, { mode }));
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

export default function ArInvoices() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDeliveryNo, setSelectedDeliveryNo] = useState("");

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const invoicesQuery = useQuery<ArInvoiceSummaryRow[]>({
  queryKey: ["ar-invoice-summary"],
  queryFn: async () => {
    const response = await getArInvoiceSummary();

    return Array.isArray(response.data) ? response.data : [];
  },
});

  const deliveriesQuery = useQuery({
    queryKey: ["deliveries-for-ar-invoice"],
    queryFn: getDeliveries,
  });

  const detailQuery = useQuery<ArInvoiceDetailResponse>({
  queryKey: ["ar-invoice-detail", selectedInvoiceId],
  queryFn: () => getArInvoiceById(selectedInvoiceId as string),
  enabled: Boolean(selectedInvoiceId && isDetailsOpen),
});
  async function invalidateArInvoiceQueries() {
    await queryClient.invalidateQueries({ queryKey: ["ar-invoice-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["deliveries-for-ar-invoice"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-open-invoices"] });
    if (selectedInvoiceId) {
      await queryClient.invalidateQueries({
        queryKey: ["ar-invoice-detail", selectedInvoiceId],
      });
    }
  }

  const createFromDeliveryMutation = useMutation({
    mutationFn: createArInvoiceFromDelivery,
    onSuccess: async () => {
      await invalidateArInvoiceQueries();
      setSelectedDeliveryNo("");
      setLastRefreshed(new Date());
    },
  });
  const postInvoiceMutation = useMutation({
    mutationFn: (invoiceNo: string) => postArInvoice(invoiceNo),
    onSuccess: async () => {
      await invalidateArInvoiceQueries();
      setLastRefreshed(new Date());
    },
  });

  const voidInvoiceMutation = useMutation({
  mutationFn: ({
    invoiceNo,
    reason,
  }: {
    invoiceNo: string;
    reason: string;
  }) => voidArInvoice(invoiceNo, reason),
  onSuccess: async () => {
    await invoicesQuery.refetch();
    await detailQuery.refetch();
    setLastRefreshed(new Date());
  },
});

  const invoices: ArInvoiceSummaryRow[] = invoicesQuery.data ?? [];
const deliveries: ArInvoiceDeliveryRow[] = normalizeArray<ArInvoiceDeliveryRow>(
  deliveriesQuery.data,
  ["deliveries", "data"]
);

  const activeInvoicedDeliveryIds = new Set(
    invoices
      .filter((invoice) => String(invoice.status || "").toUpperCase() !== "VOID")
      .map((invoice) => String(invoice.delivery_id || ""))
      .filter(Boolean)
  );

  const postedDeliveries = deliveries.filter((delivery) => {
    const deliveryId = String(delivery.delivery_id || "");

    return delivery.is_posted === true && !activeInvoicedDeliveryIds.has(deliveryId);
  });

  const filteredRows = (() => {
  const term = search.trim().toLowerCase();

  if (!term) return invoices;

  return invoices.filter((row) =>
    [
      row.invoice_no,
      row.customer_name,
      row.delivery_no,
      row.status,
      row.invoice_date,
      row.transaction_date,
    ]
      .join(" ")
      .toLowerCase()
      .includes(term)
  );
})();

  const totalInvoiced = filteredRows.reduce(
    (sum, row) => sum + Number(row.invoice_total || 0),
    0
  );

 const totalPaid = filteredRows.reduce(
  (sum, row) =>
    sum + Number(row.total_paid ?? row.amount_paid ?? 0),
  0
);
const totalBalance = filteredRows.reduce(
  (sum, row) =>
    sum + Number(row.balance_due ?? row.balance ?? 0),
  0
);

  const detailHeader = detailQuery.data?.ar_invoice;
  const detailLines = detailQuery.data?.lines ?? [];
  const detailReceiptApplications = detailQuery.data?.receipt_applications ?? [];
  async function handleRefresh() {
    await Promise.all([invoicesQuery.refetch(), deliveriesQuery.refetch()]);
    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `AR_Invoices_${formatDateKey()}.xlsx`,
        sheetName: "AR Invoices",
        rows: filteredRows as unknown as AnyRecord[],
        columns: [
          {
            header: "Invoice No",
            value: (row: AnyRecord) => row.invoice_no,
            width: 18,
            type: "text",
          },
          {
            header: "Customer",
            value: (row: AnyRecord) => row.customer_name || "",
            width: 28,
            type: "text",
          },
          {
            header: "Delivery No",
            value: (row: AnyRecord) => row.delivery_no || "",
            width: 18,
            type: "text",
          },
          {
  header: "SO No",
  value: (row: AnyRecord) => row.so_no || "",
  width: 18,
  type: "text",
},
          {
            header: "Invoice Date",
            value: (row: AnyRecord) => row.invoice_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Transaction Date",
            value: (row: AnyRecord) => row.transaction_date || "",
            width: 16,
            type: "date",
          },
          {
            header: "Due Date",
            value: (row: AnyRecord) => row.due_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Status",
            value: (row: AnyRecord) => row.status || "",
            width: 14,
            type: "text",
          },
          {
  header: "Posted Status",
  value: (row: AnyRecord) =>
    row.posted ? "Posted" : "Not Posted",
  width: 14,
  type: "text",
},
          
          {
            header: "Invoice Total",
            value: (row: AnyRecord) => Number(row.invoice_total || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Amount Paid",
            value: (row: AnyRecord) =>
              Number(row.total_paid || row.amount_paid || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Balance",
            value: (row: AnyRecord) =>
              Number(row.balance_due || row.balance || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Created At",
            value: (row: AnyRecord) => row.created_at || "",
            width: 20,
            type: "datetime",
          },
        ],
      });
    } finally {
      setIsExporting(false);
    }
  }

  function openDetails(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setIsDetailsOpen(true);
  }

  function handleCreateFromDelivery() {
    if (!selectedDeliveryNo) return;
    if (selectedDeliveryNo === "NO_POSTED_DELIVERIES") return;

    createFromDeliveryMutation.mutate(selectedDeliveryNo);
  }

  function handlePostInvoice() {
    if (!detailHeader?.invoice_no) return;

    const confirmed = window.confirm(
      `Post customer invoice ${detailHeader.invoice_no}? This will create the accounting journal.`
    );

    if (!confirmed) return;

    postInvoiceMutation.mutate(detailHeader.invoice_no);
  }

  function handleVoidInvoice() {
    if (!detailHeader?.invoice_no) return;
    if (String(detailHeader.status || "").toUpperCase() === "VOID") {
      window.alert("This invoice is already voided and cannot be voided again.");
      return;
    }

    const reason = window.prompt(
      `Enter the reason for voiding invoice ${detailHeader.invoice_no}:`,
      "Incorrect invoice / duplicate correction"
    );

    if (!reason || !reason.trim()) {
      window.alert("A void reason is required.");
      return;
    }

    const confirmed = window.confirm(
      `Void invoice ${detailHeader.invoice_no}? This creates a reversal journal and does not delete the original transaction.`
    );

    if (!confirmed) return;

    voidInvoiceMutation.mutate({
      invoiceNo: detailHeader.invoice_no,
      reason: reason.trim(),
    });
  }

  function handlePrintInvoice() {
  if (!detailHeader) return;

  openInvoicePrintWindow(
    detailHeader as unknown as AnyRecord,
    detailLines as unknown as AnyRecord[],
    "print"
  );
}

 function handleDownloadPdf() {
  if (!detailHeader) return;

  openInvoicePrintWindow(
    detailHeader as unknown as AnyRecord,
    detailLines as unknown as AnyRecord[],
    "pdf"
  );
}

  if (invoicesQuery.isLoading || deliveriesQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (invoicesQuery.isError || deliveriesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>AR invoices failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(invoicesQuery.error || deliveriesQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AR Invoices</h1>
          <p className="mt-1 text-slate-500">
            Create customer invoices from posted deliveries and track balances.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || filteredRows.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>

          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={invoicesQuery.isFetching || deliveriesQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_AR_INVOICE}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Invoice from Delivery
            </Button>
          </Can>
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-slate-500">
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Invoice Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Invoiced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalInvoiced)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalPaid)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Balance Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalBalance)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Customer Invoice List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search invoice, customer, delivery, SO, status..."
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Delivery No</TableHead>
                  <TableHead>SO No</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Transaction Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Backdated</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Invoice Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Journal ID</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="h-24 text-center">
                      No customer invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.ar_invoice_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openDetails(row.ar_invoice_id)}
                    >
                      <TableCell className="font-medium">
                        {row.invoice_no}
                      </TableCell>
                      <TableCell>{row.customer_name || "-"}</TableCell>
                      <TableCell>{row.delivery_no || "-"}</TableCell>
                     <TableCell>{row.so_no || "-"}</TableCell>
                      <TableCell>{formatDate(row.invoice_date)}</TableCell>
                      <TableCell>{formatDate(row.due_date)}</TableCell>
                      <TableCell>{formatDate(row.transaction_date)}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell>{getPostedBadge(row)}</TableCell>
                      <TableCell>{getBackdatedBadge(row)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatQty(row.total_qty)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.invoice_total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.total_paid)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.balance_due)}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
  {row.posted_journal_id || "-"}
</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(row.ar_invoice_id)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[850px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create AR Invoice from Delivery</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <Alert>
              <AlertTitle>Posted delivery required</AlertTitle>
              <AlertDescription>
                Only posted deliveries that have not already been invoiced are shown.
                If the delivery is not listed, it is either unposted or already invoiced.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Posted Delivery</Label>
              <Select
                value={selectedDeliveryNo}
                onValueChange={setSelectedDeliveryNo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select posted delivery" />
                </SelectTrigger>
                <SelectContent>
                  {postedDeliveries.length === 0 ? (
                    <SelectItem value="NO_POSTED_DELIVERIES" disabled>
                      No uninvoiced posted deliveries found
                    </SelectItem>
                  ) : (
                    postedDeliveries.map((delivery) => (
                      <SelectItem
                        key={delivery.delivery_id}
                        value={delivery.delivery_no}
                      >
                        {delivery.delivery_no} -{" "}
                        {delivery.customer_name || "-"} -{" "}
                        {formatMoney(delivery.delivery_total)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {createFromDeliveryMutation.isSuccess && (
              <Alert>
                <AlertTitle>AR invoice created</AlertTitle>
                <AlertDescription>
                  The invoice list has been refreshed. If an invoice already
                  existed, the backend may prevent duplication.
                </AlertDescription>
              </Alert>
            )}

            {createFromDeliveryMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create AR invoice</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createFromDeliveryMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Close
              </Button>

              <Can roles={ACTION_ROLES.CREATE_AR_INVOICE}>
                <Button
                  onClick={handleCreateFromDelivery}
                  disabled={
                    !selectedDeliveryNo ||
                    selectedDeliveryNo === "NO_POSTED_DELIVERIES" ||
                    createFromDeliveryMutation.isPending
                  }
                >
                  {createFromDeliveryMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Invoice"
                  )}
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1100px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AR Invoice Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load invoice</AlertTitle>
              <AlertDescription>
                {getErrorMessage(detailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailHeader ? (
            <Alert>
              <AlertTitle>No invoice data</AlertTitle>
              <AlertDescription>
                The selected customer invoice could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox
                  label="Invoice No"
                  value={detailHeader.invoice_no || "-"}
                />
                <InfoBox
                  label="Customer"
                  value={detailHeader.customer_name || "-"}
                />
                <InfoBox
                  label="Delivery No"
                  value={detailHeader.delivery_no || "-"}
                />
                <InfoBox
  label="SO No"
  value={detailHeader.so_no || "-"}
/>
                <InfoBox
                  label="Invoice Date"
                  value={formatDate(detailHeader.invoice_date)}
                />
                <InfoBox
                  label="Due Date"
                  value={formatDate(detailHeader.due_date)}
                />
                <InfoBox
                  label="Transaction Date"
                  value={formatDate(detailHeader.transaction_date)}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Backdated
                  </p>
                  <div className="mt-1">
                    {detailHeader.backdate_flag ? (
                      <Badge className="bg-yellow-100 text-yellow-800">
                        Yes
                      </Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </div>
                </div>
                <InfoBox
                  label="Backdate Reason"
                  value={detailHeader.backdate_reason || "-"}
                />
                <InfoBox
                  label="Approved By"
                  value={
                    detailHeader.backdate_approved_by
                      ? "User ID: " + detailHeader.backdate_approved_by
                      : "-"
                  }
                />
                <InfoBox
                  label="Approved At"
                  value={formatDateTime(detailHeader.backdate_approved_at)}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <div className="mt-1">
                    {getStatusBadge(detailHeader.status)}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Posted
                  </p>
                  <div className="mt-1">{getPostedBadge(detailHeader)}</div>
                </div>
                <InfoBox
                  label="Invoice Total"
                  value={formatMoney(
                    detailHeader.invoice_total ||
                      detailLines.reduce(
                        (sum, line) =>
                          sum +
                          Number(line.sell_qty || line.qty || line.base_qty || 0) *
                            Number(line.unit_price || 0),
                        0
                      )
                  )}
                />
                <InfoBox
                  label="Amount Paid"
                  value={formatMoney(detailHeader.total_paid || detailHeader.amount_paid)}
                />
                <InfoBox
                  label="Balance"
                  value={formatMoney(
                    detailHeader.balance_due ||
                      detailHeader.balance ||
                      Number(detailHeader.invoice_total || 0) -
                        Number(detailHeader.total_paid || detailHeader.amount_paid || 0)
                  )}
                />
                <InfoBox
                  label="Journal ID"
                  value={detailHeader.posted_journal_id || "-"}
                />
                {String(detailHeader.status || "").toUpperCase() === "VOID" && (
                  <>
                    <InfoBox
                      label="Void Reason"
                      value={detailHeader.void_reason || "-"}
                    />
                    <InfoBox
                      label="Voided By"
                      value={detailHeader.voided_by || "-"}
                    />
                    <InfoBox
                      label="Voided At"
                      value={formatDateTime(detailHeader.voided_at)}
                    />
                    <InfoBox
                      label="Original Journal"
                      value={detailHeader.posted_journal_no || detailHeader.posted_journal_id || "-"}
                    />
                    <InfoBox
                      label="Reversal Journal"
                      value={detailHeader.reversal_journal_no || detailHeader.reversal_journal_id || "-"}
                    />
                  </>
                )}
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailHeader.created_at)}
                />
              </div>

              {postInvoiceMutation.isSuccess && (
                <Alert>
                  <AlertTitle>AR invoice posted</AlertTitle>
                  <AlertDescription>
                    The customer invoice has been posted and the invoice list has
                    been refreshed.
                  </AlertDescription>
                </Alert>
              )}

              {postInvoiceMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to post AR invoice</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(postInvoiceMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {voidInvoiceMutation.isSuccess && (
                <Alert>
                  <AlertTitle>AR invoice voided</AlertTitle>
                  <AlertDescription>
                    The invoice has been voided and a reversal journal was created. The
                    invoice list and detail have been refreshed.
                  </AlertDescription>
                </Alert>
              )}

              {voidInvoiceMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to void AR invoice</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(voidInvoiceMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          No invoice lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <TableRow key={line.ar_invoice_line_id}>
                          <TableCell className="font-medium">
                            {line.product_name || "-"}
                          </TableCell>
                          <TableCell>{line.sku || "-"}</TableCell>
                          <TableCell>{line.description || "-"}</TableCell>
                          <TableCell className="text-right">
                            {formatQty(
                              line.sell_qty || line.qty || line.base_qty
                            )}
                          </TableCell>
                          <TableCell>
                            {line.sell_uom_code || line.uom_code || "KG"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(line.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(
                              line.line_total ||
                                Number(
                                  line.sell_qty || line.qty || line.base_qty || 0
                                ) * Number(line.unit_price || 0)
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Receipt Applications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Receipt No</TableHead>
                          <TableHead>Receipt Date</TableHead>
                          <TableHead>Transaction Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Backdated</TableHead>
                          <TableHead className="text-right">Applied Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailReceiptApplications.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="h-20 text-center">
                              No receipt applications found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          detailReceiptApplications.map((receipt: ArInvoiceReceiptApplication) => (
                            <TableRow key={receipt.ar_payment_id}>
                              <TableCell className="font-medium">{receipt.receipt_no || "-"}</TableCell>
                              <TableCell>{formatDate(receipt.payment_date)}</TableCell>
                              <TableCell>{formatDate(receipt.transaction_date || receipt.payment_date)}</TableCell>
                              <TableCell>{receipt.method || "-"}</TableCell>
                              <TableCell>{receipt.reference || "-"}</TableCell>
                              <TableCell>
                                {receipt.receipt_status === "Posted" ? (
                                  <Badge className="bg-green-600 hover:bg-green-600">Posted</Badge>
                                ) : (
                                  <Badge variant="outline">Not Posted</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {receipt.backdate_flag ? (
                                  <div>
                                    <Badge className="bg-yellow-100 text-yellow-800">Yes</Badge>
                                    {receipt.backdate_reason && (
                                      <p className="mt-1 max-w-56 text-xs text-slate-500">{receipt.backdate_reason}</p>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline">No</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatMoney(receipt.applied_amount)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <Button variant="outline" onClick={handlePrintInvoice}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Invoice
                </Button>

                <Button variant="outline" onClick={handleDownloadPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>

                <Can roles={ACTION_ROLES.CREATE_AR_INVOICE}>
                  <Button
                    variant="destructive"
                    onClick={handleVoidInvoice}
                    disabled={
                      String(detailHeader.status || "").toUpperCase() === "VOID" ||
                      !isInvoicePosted(detailHeader) ||
                      voidInvoiceMutation.isPending ||
                      !detailHeader?.invoice_no
                    }
                  >
                    {voidInvoiceMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Voiding...
                      </>
                    ) : (
                      <>
                        <AlertCircle className="mr-2 h-4 w-4" />
                        Void Invoice
                      </>
                    )}
                  </Button>
                </Can>

                <Can roles={ACTION_ROLES.CREATE_AR_INVOICE}>
                  <Button
                    onClick={handlePostInvoice}
                    disabled={
                      isInvoicePosted(detailHeader) ||
                      postInvoiceMutation.isPending ||
                      !detailHeader?.invoice_no
                    }
                  >
                    {postInvoiceMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Post Invoice
                      </>
                    )}
                  </Button>
                </Can>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words font-semibold">{value || "-"}</p>
    </div>
  );
}
