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
  createApInvoiceFromGrn,
  getApInvoiceById,
  getApInvoiceSummary,
  getGoodsReceiptSummary,
  postApInvoice,
} from "@/api/client";
import { downloadXlsx } from "@/lib/excelExport";
import type {
  ApInvoiceSummaryRow,
  ApInvoiceLineRow,
  GoodsReceiptSummaryRow,
} from "@/types/api";

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

// AnyRecord and normalizeArray removed as they are redundant with typed client responses.

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
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

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
}

function getPostedBadge(isPosted: unknown) {
  return isPosted ? (
    <Badge className="bg-green-600 hover:bg-green-600">Posted</Badge>
  ) : (
    <Badge variant="outline">Not Posted</Badge>
  );
}

function getBackdatedBadge(isBackdated: unknown) {
  return isBackdated ? (
    <Badge className="bg-amber-500 hover:bg-amber-500">Backdated</Badge>
  ) : (
    <span className="text-xs text-slate-400">-</span>
  );
}
function getErrorMessage(error: unknown, fallbackMessage: string) {
  const err = error as {
    response?: {
      data?: {
        message?: string;
        error?: string;
        detail?: string;
        details?: string;
        msg?: string;
      };
    };
    message?: string;
  };

  const backendData = err?.response?.data;

  const backendMessage =
    backendData?.message ||
    backendData?.error ||
    backendData?.detail ||
    backendData?.details ||
    backendData?.msg;

  if (backendMessage) {
    return String(backendMessage);
  }

  if (err?.message) {
    return String(err.message);
  }

  return fallbackMessage;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildSupplierInvoicePrintHtml(
  invoice: ApInvoiceSummaryRow,
  lines: ApInvoiceLineRow[]
) {
  const invoiceNo = invoice.invoice_no || "-";
  const supplierName = invoice.supplier_name || "-";
  const grnNo = invoice.grn_no || "-";
  const invoiceDate = formatDate(invoice.invoice_date);
  const dueDate = formatDate(invoice.due_date);
  const status = invoice.status || "-";
  const invoiceTotal = invoice.invoice_total || 0;
  const amountPaid = invoice.amount_paid || invoice.total_paid || 0;
  const balance = invoice.balance || invoice.balance_due || 0;

  const rows = lines
    .map((line, index) => {
      const qty = Number(line.qty || 0);
      const unitPrice = Number(line.unit_price || 0);
      const lineTotal = Number(line.line_total || qty * unitPrice);

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(line.sku || "-")}</td>
          <td>${escapeHtml(line.product_name || line.description || "-")}</td>
          <td>${escapeHtml(line.description || "-")}</td>
          <td class="num">${escapeHtml(formatQty(qty))}</td>
          <td>${escapeHtml(line.uom_code || "KG")}</td>
          <td class="num">${escapeHtml(formatMoney(unitPrice))}</td>
          <td class="num strong">${escapeHtml(formatMoney(lineTotal))}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Supplier Invoice ${escapeHtml(invoiceNo)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      color: #111827;
      margin: 32px;
      font-size: 13px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 3px solid #111827;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .company h1 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 0.5px;
    }
    .company p, .meta p {
      margin: 4px 0;
      color: #475569;
    }
    .doc-title {
      text-align: right;
    }
    .doc-title h2 {
      margin: 0 0 8px;
      font-size: 22px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .section {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .label {
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .value {
      font-weight: 700;
      word-break: break-word;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th {
      background: #f8fafc;
      color: #334155;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      border: 1px solid #e5e7eb;
      padding: 8px;
    }
    td {
      border: 1px solid #e5e7eb;
      padding: 8px;
      vertical-align: top;
    }
    .num { text-align: right; }
    .strong { font-weight: 700; }
    .summary {
      margin-left: auto;
      width: 340px;
      margin-top: 16px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e5e7eb;
      padding: 8px 0;
    }
    .summary-row.total {
      font-size: 16px;
      font-weight: 800;
      border-bottom: 2px solid #111827;
    }
    .footer {
      margin-top: 30px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 40px;
      color: #475569;
    }
    .signature {
      border-top: 1px solid #111827;
      padding-top: 8px;
      margin-top: 50px;
    }
    .note {
      margin-top: 18px;
      font-size: 11px;
      color: #64748b;
    }
    @media print {
      body { margin: 18mm; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">
      <h1>KAM GRAINS SUPPLIES</h1>
      <p>Integrated Business Management System</p>
      <p>Supplier invoice generated from KAM GRAINS.</p>
    </div>
    <div class="doc-title">
      <h2>SUPPLIER INVOICE</h2>
      <p><strong>${escapeHtml(invoiceNo)}</strong></p>
      <span class="badge">${escapeHtml(status)}</span>
    </div>
  </div>

  <div class="section grid">
    <div>
      <div class="label">Supplier</div>
      <div class="value">${escapeHtml(supplierName)}</div>
    </div>
    <div>
      <div class="label">GRN No</div>
      <div class="value">${escapeHtml(grnNo)}</div>
    </div>
    <div>
      <div class="label">Invoice Date</div>
      <div class="value">${escapeHtml(invoiceDate)}</div>
    </div>
    <div>
      <div class="label">Due Date</div>
      <div class="value">${escapeHtml(dueDate)}</div>
    </div>
    <div>
      <div class="label">Journal ID</div>
      <div class="value">${escapeHtml(invoice.posted_journal_id || "-")}</div>
    </div>
    <div>
      <div class="label">Created At</div>
      <div class="value">${escapeHtml(formatDateTime(invoice.created_at))}</div>
    </div>
  </div>

  <div class="section">
    <div class="label">Invoice Lines</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>SKU</th>
          <th>Product</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th>UOM</th>
          <th class="num">Unit Price</th>
          <th class="num">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="8">No invoice lines found.</td></tr>`}
      </tbody>
    </table>

    <div class="summary">
      <div class="summary-row total">
        <span>Invoice Total</span>
        <span>${escapeHtml(formatMoney(invoiceTotal))}</span>
      </div>
      <div class="summary-row">
        <span>Amount Paid</span>
        <span>${escapeHtml(formatMoney(amountPaid))}</span>
      </div>
      <div class="summary-row">
        <span>Balance Due</span>
        <span>${escapeHtml(formatMoney(balance))}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="signature">Prepared By</div>
    <div class="signature">Approved By</div>
  </div>

  <p class="note">
    This document is system-generated from KAM GRAINS SUPPLIES records.
    For PDF output, choose "Save as PDF" in the print dialog.
  </p>

  <script>
    window.onload = function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;
}

function openSupplierInvoicePrintWindow(
  invoice: ApInvoiceSummaryRow,
  lines: ApInvoiceLineRow[]
) {
  const printWindow = window.open("", "_blank", "width=980,height=720");

  if (!printWindow) {
    window.alert("Pop-up blocked. Please allow pop-ups and try again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildSupplierInvoicePrintHtml(invoice, lines));
  printWindow.document.close();
}

export default function ApInvoices() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedGrnNo, setSelectedGrnNo] = useState("");

  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());

  // PHASE 4: backdating here is implicit — if invoiceDate is in the past,
  // the backend (POST /ap-invoices/from-grn) automatically flags the invoice
  // as backdated and requires ADMIN/MANAGER + a reason. The reason field
  // only had nowhere to go before; it's added here so that flow can succeed
  // instead of always 400'ing with "A backdate reason must be provided".
  const [backdateReason, setBackdateReason] = useState("");
  const isPastDate = Boolean(invoiceDate) && invoiceDate < todayIso();

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const invoicesQuery = useQuery({
    queryKey: ["ap-invoice-summary"],
    queryFn: getApInvoiceSummary,
  });

  const grnQuery = useQuery({
    queryKey: ["posted-grns-for-ap-invoice"],
    queryFn: getGoodsReceiptSummary,
  });

  const detailQuery = useQuery({
    queryKey: ["ap-invoice-detail", selectedInvoiceId],
    queryFn: () => getApInvoiceById(selectedInvoiceId as string),
    enabled: Boolean(selectedInvoiceId && isDetailsOpen),
  });

  async function invalidateApInvoiceQueries() {
    await queryClient.invalidateQueries({ queryKey: ["ap-invoice-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["posted-grns-for-ap-invoice"] });
    await queryClient.invalidateQueries({ queryKey: ["supplier-open-invoices"] });
    if (selectedInvoiceId) {
      await queryClient.invalidateQueries({
        queryKey: ["ap-invoice-detail", selectedInvoiceId],
      });
    }
  }

  const createFromGrnMutation = useMutation({
    mutationFn: createApInvoiceFromGrn,
    onSuccess: async () => {
      await invalidateApInvoiceQueries();
      resetCreateForm(false);
      setLastRefreshed(new Date());
    },
  });
  const postInvoiceMutation = useMutation({
    mutationFn: (invoiceNo: string) => postApInvoice(invoiceNo),
    onSuccess: async () => {
      await invalidateApInvoiceQueries();
      setLastRefreshed(new Date());
    },
  });
  const invoices: ApInvoiceSummaryRow[] = invoicesQuery.data?.data || [];

  const grns: GoodsReceiptSummaryRow[] = grnQuery.data?.data || [];

  const invoicedGrnNos = new Set(
    invoices
      .map((invoice) => String(invoice.grn_no || "").trim().toUpperCase())
      .filter(Boolean)
  );

  const postedGrns = grns.filter((grn) => {
    const grnNo = String(grn.grn_no || "").trim().toUpperCase();

    return grn.is_posted === true && grnNo && !invoicedGrnNos.has(grnNo);
  });

  const filteredRows = (() => {
    const term = search.trim().toLowerCase();

    if (!term) return invoices;

    return invoices.filter((row) =>
      [
        row.invoice_no,
        row.supplier_name,
        row.grn_no,
        row.status,
        row.invoice_date,
        row.due_date,
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
    (sum, row) => sum + Number(row.total_paid || row.amount_paid || 0),
    0
  );

  const totalBalance = filteredRows.reduce(
    (sum, row) => sum + Number(row.balance_due || row.balance || 0),
    0
  );

  const detailHeader: ApInvoiceSummaryRow | undefined =
    detailQuery.data?.ap_invoice;

  const detailLines: ApInvoiceLineRow[] =
    detailQuery.data?.lines || [];

  async function handleRefresh() {
    await invoicesQuery.refetch();
    await grnQuery.refetch();
    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `AP_Invoices_${formatDateKey()}.xlsx`,
        sheetName: "AP Invoices",
        rows: filteredRows,
        columns: [
          {
            header: "AP Invoice No",
            value: (row: ApInvoiceSummaryRow) => row.invoice_no || "",
            width: 18,
            type: "text",
          },
          {
            header: "Supplier",
            value: (row: ApInvoiceSummaryRow) => row.supplier_name || "",
            width: 28,
            type: "text",
          },
          {
            header: "GRN/Receipt No",
            value: (row: ApInvoiceSummaryRow) => row.grn_no || "",
            width: 18,
            type: "text",
          },
          {
            header: "Invoice Date",
            value: (row: ApInvoiceSummaryRow) => row.invoice_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Due Date",
            value: (row: ApInvoiceSummaryRow) => row.due_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Status",
            value: (row: ApInvoiceSummaryRow) => row.status || "",
            width: 14,
            type: "text",
          },
          {
            header: "Posted Status",
            value: (row: ApInvoiceSummaryRow) => (row.is_posted ? "Posted" : "Not Posted"),
            width: 14,
            type: "text",
          },
          {
            header: "Invoice Total",
            value: (row: ApInvoiceSummaryRow) => Number(row.invoice_total || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Amount Paid",
            value: (row: ApInvoiceSummaryRow) => Number(row.total_paid || row.amount_paid || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Balance",
            value: (row: ApInvoiceSummaryRow) => Number(row.balance_due || row.balance || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Backdated",
            value: (row: ApInvoiceSummaryRow) => (row.backdate_flag ? "Yes" : "No"),
            width: 12,
            type: "text",
          },
          {
            header: "Backdate Reason",
            value: (row: ApInvoiceSummaryRow) => row.backdate_reason || "",
            width: 24,
            type: "text",
          },
          {
            header: "Journal ID",
            value: (row: ApInvoiceSummaryRow) => row.posted_journal_id || "",
            width: 24,
            type: "text",
          },
          {
            header: "Created At",
            value: (row: ApInvoiceSummaryRow) => row.created_at || "",
            width: 20,
            type: "datetime",
          },
        ],
      });
    } finally {
      setIsExporting(false);
    }
  }

  function resetCreateForm(closeDialog = true) {
    setSelectedGrnNo("");

    setInvoiceDate(todayIso());
    setDueDate(todayIso());
    setBackdateReason("");

    if (closeDialog) {
      setIsCreateOpen(false);
    }
  }

  function openDetails(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setIsDetailsOpen(true);
  }

  function handleCreateFromGrn() {
  if (!selectedGrnNo) return;

  createFromGrnMutation.mutate({
    grn_no: selectedGrnNo,
    invoice_date: invoiceDate,
    due_date: dueDate,
    // PHASE 4
    transaction_date: invoiceDate,
    backdate_flag: isPastDate,
    backdate_reason: isPastDate ? backdateReason : null,
    });
  }
function handlePostInvoice() {
  if (!detailHeader?.invoice_no) return;

  const confirmed = window.confirm(
    `Post supplier invoice ${detailHeader.invoice_no}? This will create the accounting journal.`
  );

  if (!confirmed) return;

  postInvoiceMutation.mutate(detailHeader.invoice_no);
}

  function handlePrintInvoice() {
    if (!detailHeader) return;

    openSupplierInvoicePrintWindow(detailHeader, detailLines);
  }

  function handleDownloadPdf() {
    if (!detailHeader) return;

    openSupplierInvoicePrintWindow(detailHeader, detailLines);
  }
  const createFormIsValid =
  selectedGrnNo &&
  invoiceDate &&
  dueDate &&
  selectedGrnNo !== "NO_POSTED_GRNS" &&
  (!isPastDate || Boolean(backdateReason.trim()));

  if (invoicesQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (invoicesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>AP invoices failed to load</AlertTitle>
        <AlertDescription>
          Check backend connection and AP invoice routes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            AP Invoices
          </h1>
          <p className="mt-1 text-slate-500">
            Create supplier invoices from posted GRNs and track supplier balances.
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
            disabled={invoicesQuery.isFetching || grnQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_AP_INVOICE}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Invoice from GRN
            </Button>
          </Can>
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-slate-500">
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
        </p>
      )}
       {postInvoiceMutation.isSuccess && (
  <Alert>
    <AlertTitle>Supplier invoice posted</AlertTitle>
    <AlertDescription>
      The supplier invoice has been posted and the invoice list has been refreshed.
    </AlertDescription>
  </Alert>
)}

{postInvoiceMutation.isError && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Failed to post supplier invoice</AlertTitle>
    <AlertDescription>
      {getErrorMessage(
        postInvoiceMutation.error,
        "Confirm posting setup, invoice status, and backend connection."
      )}
    </AlertDescription>
  </Alert>
)}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Supplier Invoices
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
            Supplier Invoice List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search invoice, supplier, GRN, status..."
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
                  <TableHead>Supplier</TableHead>
                  <TableHead>GRN No</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Due Date</TableHead>
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
                    <TableCell colSpan={14} className="h-24 text-center">
                      No supplier invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.ap_invoice_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openDetails(row.ap_invoice_id)}
                    >
                      <TableCell className="font-medium">
                        {row.invoice_no}
                      </TableCell>
                      <TableCell>{row.supplier_name || "-"}</TableCell>
                      <TableCell>{row.grn_no || "-"}</TableCell>
                      <TableCell>{formatDate(row.invoice_date)}</TableCell>
                      <TableCell>{formatDate(row.due_date)}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell>{getPostedBadge(row.is_posted)}</TableCell>
                      <TableCell>{getBackdatedBadge(row.backdate_flag)}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.total_qty)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.invoice_total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.total_paid || row.amount_paid)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.balance_due || row.balance)}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
                        {row.posted_journal_id || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(row.ap_invoice_id)}
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
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[900px] overflow-y-auto sm:!max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Create Supplier Invoice from GRN</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <Alert>
              <AlertTitle>Posted GRN required</AlertTitle>
              <AlertDescription>
                Only posted GRNs that do not already have supplier invoices can be converted into supplier invoices.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Posted GRN</Label>
                <Select value={selectedGrnNo} onValueChange={setSelectedGrnNo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select posted uninvoiced GRN" />
                  </SelectTrigger>
                  <SelectContent>
                    {postedGrns.length === 0 ? (
                      <SelectItem value="NO_POSTED_GRNS" disabled>
                        No posted uninvoiced GRNs found
                      </SelectItem>
                    ) : (
                      postedGrns.map((grn) => (
                        <SelectItem key={grn.grn_id} value={grn.grn_no}>
                          {grn.grn_no} - {grn.supplier_name || "-"} -{" "}
                          {formatMoney(
  grn.total_grn_value ||
    grn.total_value ||
    grn.grn_total ||
    grn.total_received_value ||
    0
)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
              <Label>Supplier Invoice No</Label>
              <Input value="Auto-generated on save" disabled />
              </div>

              <div className="space-y-2">
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>

            {/* PHASE 4: backdating is implied by picking a past Invoice Date.
                Only ADMIN/MANAGER can actually submit a past-dated invoice —
                the backend enforces this; here we just surface it clearly
                and collect the required reason so the request doesn't fail. */}
            {isPastDate && (
              <Can
                roles={ACTION_ROLES.CREATE_BACKDATED_AP_INVOICE}
                fallback={
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Backdated invoice date selected</AlertTitle>
                    <AlertDescription>
                      The invoice date is in the past. Only ADMIN or MANAGER
                      roles can create backdated supplier invoices — choose
                      today's date, or ask an admin/manager to create this
                      invoice.
                    </AlertDescription>
                  </Alert>
                }
              >
                <Card className="rounded-2xl border-amber-200 bg-amber-50/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-amber-800">
                      Backdated Invoice — Reason Required
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label>Backdate Reason</Label>
                      <Input
                        value={backdateReason}
                        onChange={(event) => setBackdateReason(event.target.value)}
                        placeholder="Why is this supplier invoice dated in the past?"
                      />
                    </div>
                  </CardContent>
                </Card>
              </Can>
            )}

            {createFromGrnMutation.isSuccess && (
              <Alert>
                <AlertTitle>Supplier invoice created</AlertTitle>
                <AlertDescription>
                  The AP invoice list has been refreshed.
                </AlertDescription>
              </Alert>
            )}

            {createFromGrnMutation.isError && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Failed to create supplier invoice</AlertTitle>
    <AlertDescription>
      {getErrorMessage(
        createFromGrnMutation.error,
        "Confirm the GRN is posted, invoice number is not duplicated, and backend connection is working."
      )}
    </AlertDescription>
  </Alert>
)}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => resetCreateForm(true)}>
                Close
              </Button>

              <Can roles={ACTION_ROLES.CREATE_AP_INVOICE}>
                <Button
                  onClick={handleCreateFromGrn}
                  disabled={!createFormIsValid || createFromGrnMutation.isPending}
                >
                  {createFromGrnMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Supplier Invoice"
                  )}
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1100px] overflow-y-auto sm:!max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>AP Invoice Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load supplier invoice</AlertTitle>
              <AlertDescription>Please try again.</AlertDescription>
            </Alert>
          ) : !detailHeader ? (
            <Alert>
              <AlertTitle>No supplier invoice data</AlertTitle>
              <AlertDescription>
                The selected supplier invoice could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Invoice No" value={detailHeader.invoice_no || "-"} />
                <InfoBox label="Supplier" value={detailHeader.supplier_name || "-"} />
                <InfoBox label="GRN No" value={detailHeader.grn_no || "-"} />
                <InfoBox
                  label="Invoice Date"
                  value={formatDate(detailHeader.invoice_date)}
                />
                <InfoBox label="Due Date" value={formatDate(detailHeader.due_date)} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <div className="mt-1">{getStatusBadge(detailHeader.status)}</div>
                </div>
                <InfoBox
                  label="Invoice Total"
                  value={formatMoney(detailHeader.invoice_total)}
                />
                <InfoBox
                  label="Amount Paid"
                  value={formatMoney(detailHeader.amount_paid || detailHeader.total_paid)}
                />
                <InfoBox
                  label="Balance"
                  value={formatMoney(detailHeader.balance || detailHeader.balance_due)}
                />
                <InfoBox
                  label="Journal ID"
                  value={detailHeader.posted_journal_id || "-"}
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
                    {getBackdatedBadge(detailHeader.backdate_flag)}
                  </div>
                </div>
                {detailHeader.backdate_flag && (
                  <InfoBox
                    label="Backdate Reason"
                    value={detailHeader.backdate_reason || "-"}
                  />
                )}
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailHeader.created_at)}
                />
              </div>

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
                        <TableRow key={line.ap_invoice_line_id}>
                          <TableCell className="font-medium">
                            {line.product_name || "-"}
                          </TableCell>
                          <TableCell>{line.sku || "-"}</TableCell>
                          <TableCell>{line.description || "-"}</TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.qty)}
                          </TableCell>
                          <TableCell>{line.uom_code || "KG"}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(line.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(
                              line.line_total ||
                                Number(line.qty || 0) * Number(line.unit_price || 0)
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                <Button
                  variant="outline"
                  onClick={handlePrintInvoice}
                  disabled={!detailHeader}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print Invoice
                </Button>

                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={!detailHeader}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <Button
                  onClick={handlePostInvoice}
                  disabled={
                    Boolean(detailHeader?.is_posted) ||
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
