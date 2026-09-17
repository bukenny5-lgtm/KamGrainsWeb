import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Eye,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";

import {
  createArPayment,
  getArPaymentById,
  getArPaymentSummary,
  getCustomerOpenInvoices,
  getParties,
  postArPayment,
} from "@/api/client";
import type {
  ArPaymentApplication,
  ArPaymentDetailResponse,
  ArPaymentOpenInvoice,
  ArPaymentSummaryRow,
} from "@/types/api";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";
import { BUSINESS_PROFILE_FALLBACK } from "@/lib/businessProfile";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Removed: import { Checkbox } from "@/components/ui/checkbox";
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

type ArPaymentHeader = ArPaymentDetailResponse["ar_payment"];

type PartyOption = {
  party_id: string;
  party_name: string;
  party_type?: string | null;
};

type ReceiptApplication = ArPaymentOpenInvoice & {
  amount: string;
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString();
}

function formatDateTime(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
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

function buildReceiptHtml(
  header: ArPaymentHeader,
  applications: ArPaymentApplication[]
) {
  const appliedTotal = applications.reduce(
    (sum, item) => sum + Number(item.applied_amount || 0),
    0
  );

  const rows = applications
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.invoice_no || "-")}</td>
          <td>${escapeHtml(formatDate(item.invoice_date))}</td>
          <td>${escapeHtml(formatDate(item.due_date))}</td>
          <td>${escapeHtml(item.status || "-")}</td>
          <td class="right">${escapeHtml(formatMoney(item.applied_amount))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Customer Receipt ${escapeHtml(header.receipt_no || "")}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 28px;
            background: #ffffff;
            font-size: 13px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          h1, h2, p { margin: 0; }
          h1 { font-size: 24px; letter-spacing: 0.5px; }
          h2 { font-size: 16px; margin-bottom: 8px; }
          .muted { color: #64748b; }
          .box {
            border: 1px solid #d1d5db;
            border-radius: 10px;
            padding: 14px;
            margin-bottom: 18px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
          }
          .label {
            color: #64748b;
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .value { font-weight: 700; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            border-bottom: 1px solid #e5e7eb;
            padding: 9px;
            text-align: left;
          }
          th {
            background: #f8fafc;
            font-size: 12px;
            text-transform: uppercase;
            color: #475569;
          }
          .right { text-align: right; }
          .totals {
            margin-left: auto;
            width: 330px;
            margin-top: 18px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid #e5e7eb;
            padding: 8px 0;
          }
          .grand {
            font-size: 16px;
            font-weight: 800;
          }
          .footer {
            margin-top: 36px;
            display: flex;
            justify-content: space-between;
            gap: 40px;
          }
          .signature {
            border-top: 1px solid #111827;
            width: 240px;
            padding-top: 8px;
            color: #64748b;
          }
          @media print {
            body { padding: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${BUSINESS_PROFILE_FALLBACK.company_name}</h1>
            <p class="muted">Customer Payment Receipt</p>
          </div>
          <div class="right">
            <h2>RECEIPT</h2>
            <p><strong>No:</strong> ${escapeHtml(header.receipt_no || "-")}</p>
            <p><strong>Date:</strong> ${escapeHtml(formatDate(header.payment_date))}</p>
          </div>
        </div>

        <div class="box grid">
          <div>
            <div class="label">Customer</div>
            <div class="value">${escapeHtml(header.customer_name || "-")}</div>
          </div>
          <div>
            <div class="label">Method</div>
            <div class="value">${escapeHtml(header.method || "-")}</div>
          </div>
          <div>
            <div class="label">Reference</div>
            <div class="value">${escapeHtml(header.reference || "-")}</div>
          </div>
          <div>
            <div class="label">Posted</div>
            <div class="value">${header.is_posted ? "Yes" : "No"}</div>
          </div>
        </div>

        <div class="box">
          <h2>Applied Invoices</h2>
          <table>
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>Status</th>
                <th class="right">Applied Amount</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows ||
                `<tr><td colspan="5" class="right">No applications found.</td></tr>`
              }
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-row">
              <span>Receipt Amount</span>
              <strong>${escapeHtml(formatMoney(header.amount))}</strong>
            </div>
            <div class="totals-row">
              <span>Applied Amount</span>
              <strong>${escapeHtml(formatMoney(appliedTotal))}</strong>
            </div>
            <div class="totals-row grand">
              <span>Unapplied Amount</span>
              <span>${escapeHtml(formatMoney(Number(header.amount || 0) - appliedTotal))}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="signature">Received By</div>
          <div class="signature">Authorized By</div>
        </div>
      </body>
    </html>
  `;
}

function printHtml(html: string) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Allow popups for this site, then try again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 300);
}

export default function ArPayments() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [applications, setApplications] = useState<ReceiptApplication[]>([]);

  // PHASE 4: backdate controls
  const [isBackdateChecked, setIsBackdateChecked] = useState(false);
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [backdateReason, setBackdateReason] = useState("");

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const paymentsQuery = useQuery({
    queryKey: ["ar-payment-summary"],
    queryFn: getArPaymentSummary,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties-for-ar-payments"],
    queryFn: getParties,
  });

  const openInvoicesQuery = useQuery({
    queryKey: ["customer-open-invoices", customerId],
    queryFn: () => getCustomerOpenInvoices(customerId),
    enabled: Boolean(customerId && isCreateOpen),
  });

  const detailQuery = useQuery({
    queryKey: ["ar-payment-detail", selectedPaymentId],
    queryFn: () => getArPaymentById(selectedPaymentId as string),
    enabled: Boolean(selectedPaymentId && isDetailsOpen),
  });

  async function invalidateArPaymentQueries() {
    await queryClient.invalidateQueries({ queryKey: ["ar-payment-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["ar-invoice-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-open-invoices"] });
    if (selectedPaymentId) {
      await queryClient.invalidateQueries({
        queryKey: ["ar-payment-detail", selectedPaymentId],
      });
    }
  }

  const createMutation = useMutation({
    mutationFn: createArPayment,
    onSuccess: async () => {
      await invalidateArPaymentQueries();
      resetCreateForm();
      setLastRefreshed(new Date());
    },
  });
  const postMutation = useMutation({
    mutationFn: (receiptNo: string) => postArPayment(receiptNo),
    onSuccess: async () => {
      await invalidateArPaymentQueries();
      setLastRefreshed(new Date());
    },
  });
  const payments: ArPaymentSummaryRow[] = paymentsQuery.data?.data ?? [];

  const parties: PartyOption[] = normalizeArray<PartyOption>(partiesQuery.data, [
    "parties",
    "data",
  ]);

  const customerOptions = parties.filter((party) => {
    const type = String(party.party_type || "").toUpperCase();
    return !type || type.includes("CUSTOMER") || type.includes("BOTH");
  });

  const openInvoices: ArPaymentOpenInvoice[] =
    openInvoicesQuery.data?.open_invoices ?? [];

  useEffect(() => {
    if (!customerId || !isCreateOpen) return;

    setApplications([]);
    setAmount("");
  }, [customerId, isCreateOpen]);

  // Keep backdate_flag in sync if the person picks a past transaction date
  // directly without ticking the checkbox first.
  useEffect(() => {
    if (transactionDate && transactionDate < todayIso()) {
      setIsBackdateChecked(true);
    }
  }, [transactionDate]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return payments;

    return payments.filter((row) =>
      [
        row.receipt_no,
        row.customer_name,
        row.payment_date,
        row.method,
        row.reference,
        row.applied_invoices,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [payments, search]);

  const totalReceived = filteredRows.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  const totalApplied = filteredRows.reduce(
    (sum, row) => sum + Number(row.applied_amount || 0),
    0
  );

  const totalUnapplied = filteredRows.reduce(
    (sum, row) => sum + Number(row.unapplied_amount || 0),
    0
  );

  const detailHeader: ArPaymentHeader | undefined =
    detailQuery.data?.ar_payment;
  const detailApplications: ArPaymentApplication[] =
    detailQuery.data?.applications ?? [];

  const applicationTotal = applications.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const receiptAmountNumber = Number(amount || 0);
  const selectedInvoiceBalanceTotal = applications.reduce(
    (sum, item) => sum + Number(item.balance || 0),
    0
  );
  const unappliedAmount = Math.max(receiptAmountNumber - applicationTotal, 0);
  const remainingInvoiceBalance = Math.max(
    selectedInvoiceBalanceTotal - applicationTotal,
    0
  );

  const createFormIsValid =
    Boolean(customerId) &&
    Boolean(paymentDate) &&
    Number(amount) > 0 &&
    applications.length > 0 &&
    applicationTotal > 0 &&
    applicationTotal <= Number(amount) &&
    applications.every(
      (item) => Number(item.amount || 0) <= Number(item.balance || 0)
    ) &&
    (!isBackdateChecked || Boolean(backdateReason.trim()));

  async function handleRefresh() {
    await Promise.all([paymentsQuery.refetch(), partiesQuery.refetch()]);
    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `Receipts_${formatDateKey()}.xlsx`,
        sheetName: "Receipts",
        rows: filteredRows,
        columns: [
          {
            header: "Receipt No",
            value: (row: ArPaymentSummaryRow) => row.receipt_no || "",
            width: 18,
            type: "text",
          },
          {
            header: "Customer",
            value: (row: ArPaymentSummaryRow) => row.customer_name || "",
            width: 28,
            type: "text",
          },
          {
            header: "Payment Date",
            value: (row: ArPaymentSummaryRow) => row.payment_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Method",
            value: (row: ArPaymentSummaryRow) => row.method || "",
            width: 14,
            type: "text",
          },
          {
            header: "Reference",
            value: (row: ArPaymentSummaryRow) => row.reference || "",
            width: 20,
            type: "text",
          },
          {
            header: "Amount",
            value: (row: ArPaymentSummaryRow) => Number(row.amount || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Applied Amount",
            value: (row: ArPaymentSummaryRow) => Number(row.applied_amount || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Unapplied Amount",
            value: (row: ArPaymentSummaryRow) => Number(row.unapplied_amount || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Applied Invoices",
            value: (row: ArPaymentSummaryRow) => row.applied_invoices || "",
            width: 34,
            type: "text",
          },
         {
  header: "Backdated",
  value: (row: ArPaymentSummaryRow) =>
    row.backdate_flag ? "Backdated" : "",
  width: 12,
  type: "text",
},
{
  header: "Posted Status",
  value: (row: ArPaymentSummaryRow) =>
    row.is_posted ? "Posted" : "Not Posted",
  width: 14,
  type: "text",
},
          {
            header: "Journal ID",
            value: (row: ArPaymentSummaryRow) => row.posted_journal_id || "",
            width: 24,
            type: "text",
          },
        ],
      });
    } finally {
      setIsExporting(false);
    }
  }

  function resetCreateForm() {
    setCustomerId("");
    setPaymentDate(todayIso());
    setAmount("");
    setMethod("CASH");
    setReference("");
    setApplications([]);
    setIsBackdateChecked(false);
    setTransactionDate(todayIso());
    setBackdateReason("");
    setIsCreateOpen(false);
  }

  function openDetails(paymentId: string) {
    setSelectedPaymentId(paymentId);
    setIsDetailsOpen(true);
  }

  function rebalanceApplicationsForAmount(
    nextAmount: number,
    source: ReceiptApplication[]
  ) {
    let remainingPayment = Math.max(nextAmount, 0);

    return source.map((item) => {
      const balance = Number(item.balance || 0);
      const nextApplyAmount = Math.min(balance, remainingPayment);
      remainingPayment = Math.max(remainingPayment - nextApplyAmount, 0);

      return {
        ...item,
        amount: String(nextApplyAmount),
      };
    });
  }

  function handleAmountChange(value: string) {
    setAmount(value);

    const nextAmount = Number(value || 0);

    setApplications((current) =>
      rebalanceApplicationsForAmount(nextAmount, current)
    );
  }

  function addApplication(invoice: ArPaymentOpenInvoice) {
    const exists = applications.some(
      (item) => item.ar_invoice_id === invoice.ar_invoice_id
    );

    if (exists) return;

    const invoiceBalance = Number(invoice.balance || 0);
    const receiptAmount = Number(amount || 0);

    const alreadyApplied = applications.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const remainingReceiptAmount = Math.max(receiptAmount - alreadyApplied, 0);

    const applyAmount =
      receiptAmount > 0
        ? Math.min(invoiceBalance, remainingReceiptAmount)
        : invoiceBalance;

    setApplications((current) => [
      ...current,
      {
        ar_invoice_id: invoice.ar_invoice_id,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        status: invoice.status,
        invoice_total: invoice.invoice_total,
        amount_paid: invoice.amount_paid,
        balance: invoice.balance,
        amount: String(applyAmount),
      },
    ]);

    if (!amount || Number(amount) <= 0) {
      setAmount(String(invoiceBalance));
    }
  }

  function removeApplication(invoiceId: string) {
    setApplications((current) =>
      current.filter((item) => item.ar_invoice_id !== invoiceId)
    );
  }

  function updateApplicationAmount(invoiceId: string, value: string) {
    setApplications((current) =>
      current.map((item) =>
        item.ar_invoice_id === invoiceId ? { ...item, amount: value } : item
      )
    );
  }

  function handleCreateReceipt() {
    createMutation.mutate({
      customer_id: customerId,
      payment_date: paymentDate,
      amount: Number(amount),
      method,
      reference: reference || null,
      applications: applications.map((item) => ({
        ar_invoice_id: item.ar_invoice_id,
        amount: Number(item.amount || 0),
      })),
      // PHASE 4
      transaction_date: isBackdateChecked ? transactionDate : paymentDate,
      backdate_flag: isBackdateChecked,
      backdate_reason: isBackdateChecked ? backdateReason : null,
    });
  }
  function handlePostReceipt() {
    if (!detailHeader?.receipt_no) return;

    const confirmed = window.confirm(
      `Post customer receipt ${detailHeader.receipt_no}? This will create the accounting journal.`
    );

    if (!confirmed) return;

    postMutation.mutate(detailHeader.receipt_no);
  }

  function handlePrintReceipt() {
    if (!detailHeader) return;
    printHtml(buildReceiptHtml(detailHeader, detailApplications));
  }

  function handleDownloadPdf() {
    if (!detailHeader) return;
    printHtml(buildReceiptHtml(detailHeader, detailApplications));
  }
  if (paymentsQuery.isLoading || partiesQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (paymentsQuery.isError || partiesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Receipts failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(paymentsQuery.error || partiesQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Receipts / AR Payments
          </h1>
          <p className="mt-1 text-slate-500">
            Record customer receipts and apply them to open invoices.
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
            disabled={paymentsQuery.isFetching || partiesQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_RECEIPT}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Receipt
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
              Receipt Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalReceived)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Applied Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalApplied)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Unapplied Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalUnapplied)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Receipt List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search receipt, customer, method, reference, invoice..."
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
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                  <TableHead className="text-right">Unapplied</TableHead>
                  <TableHead>Applied Invoices</TableHead>
                  <TableHead>Backdated</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Journal ID</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="h-24 text-center">
                      No customer receipts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.ar_payment_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openDetails(row.ar_payment_id)}
                    >
                      <TableCell className="font-medium">
                        {row.receipt_no}
                      </TableCell>
                      <TableCell>{row.customer_name || "-"}</TableCell>
                      <TableCell>{formatDate(row.payment_date)}</TableCell>
                      <TableCell>{row.method || "-"}</TableCell>
                      <TableCell>{row.reference || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.applied_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.unapplied_amount)}
                      </TableCell>
                      <TableCell className="max-w-56 truncate">
                        {row.applied_invoices || "-"}
                      </TableCell>
                      <TableCell>
                        {getBackdatedBadge(row.backdate_flag)}
                      </TableCell>
                      <TableCell>{getPostedBadge(row.is_posted)}</TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
                        {row.posted_journal_id || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(row.ar_payment_id)}
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

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1150px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Customer Receipt</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerOptions.map((party) => (
                      <SelectItem key={party.party_id} value={party.party_id}>
                        {party.party_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">CASH</SelectItem>
                    <SelectItem value="MOBILE_MONEY">MOBILE MONEY</SelectItem>
                    <SelectItem value="BANK">BANK</SelectItem>
                    <SelectItem value="CHEQUE">CHEQUE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Receipt Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(event) => handleAmountChange(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label>Reference</Label>
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Cash receipt, mobile money transaction ID, bank ref..."
                />
              </div>
            </div>

            {/* PHASE 4: Backdate Transaction controls — ADMIN/MANAGER only */}
            <Can roles={ACTION_ROLES.CREATE_BACKDATED_AR_PAYMENT}>
              <Card className="rounded-2xl border-amber-200 bg-amber-50/60 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ar-payment-backdate"
                      checked={isBackdateChecked}
                      onChange={(e) => setIsBackdateChecked(e.target.checked)}
                      className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <Label
                      htmlFor="ar-payment-backdate"
                      className="cursor-pointer text-sm font-semibold"
                    >
                      Backdate Transaction
                    </Label>
                  </div>
                </CardHeader>

                {isBackdateChecked && (
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Transaction Date (business date)</Label>
                      <Input
                        type="date"
                        value={transactionDate}
                        onChange={(event) =>
                          setTransactionDate(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Backdate Reason (required)</Label>
                      <Input
                        value={backdateReason}
                        onChange={(event) =>
                          setBackdateReason(event.target.value)
                        }
                        placeholder="Why is this receipt being recorded for a past date?"
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            </Can>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Open Customer Invoices
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Receipt Amount is the actual cash received. Applied Amount is the portion allocated to selected invoice balances. Invoices are listed oldest business date first (FIFO).
                </p>
              </CardHeader>

              <CardContent>
                {!customerId ? (
                  <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
                    Select a customer to load open invoices.
                  </div>
                ) : openInvoicesQuery.isLoading ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                  </div>
                ) : openInvoices.length === 0 ? (
                  <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
                    No open invoices found for this customer.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice No</TableHead>
                          <TableHead>Transaction Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {openInvoices.map((invoice) => (
                          <TableRow key={invoice.ar_invoice_id}>
                            <TableCell className="font-medium">
                              {invoice.invoice_no}
                              {invoice.backdate_flag && (
                                <Badge className="ml-2 bg-amber-500 hover:bg-amber-500">
                                  BD
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {formatDate(
                                invoice.transaction_date || invoice.invoice_date
                              )}
                            </TableCell>
                            <TableCell>{formatDate(invoice.due_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {invoice.status || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(invoice.invoice_total)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(invoice.amount_paid)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatMoney(invoice.balance)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addApplication(invoice)}
                                disabled={applications.some(
                                  (item) =>
                                    item.ar_invoice_id === invoice.ar_invoice_id
                                )}
                              >
                                Apply
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Receipt Applications
                </CardTitle>
              </CardHeader>

              <CardContent>
                {applications.length === 0 ? (
                  <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
                    No invoices selected for payment application.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice No</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead className="text-right">
                            Apply Amount
                          </TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {applications.map((item) => (
                          <TableRow key={item.ar_invoice_id}>
                            <TableCell className="font-medium">
                              {item.invoice_no}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(item.balance)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                max={Number(item.balance || 0)}
                                className="ml-auto w-40 text-right"
                                value={item.amount}
                                onChange={(event) =>
                                  updateApplicationAmount(
                                    item.ar_invoice_id,
                                    event.target.value
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  removeApplication(item.ar_invoice_id)
                                }
                              >
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}

                        <TableRow>
                          <TableCell className="font-bold">
                            Total Applied
                          </TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right font-bold">
                            {formatMoney(applicationTotal)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-4">
              <PreviewBox label="Receipt Amount" value={formatMoney(receiptAmountNumber)} />
              <PreviewBox label="Applied Amount" value={formatMoney(applicationTotal)} />
              <PreviewBox label="Unapplied Amount" value={formatMoney(unappliedAmount)} />
              <PreviewBox
                label="Invoice Balance After Receipt"
                value={formatMoney(remainingInvoiceBalance)}
              />
            </div>

            {applications.some(
              (item) => Number(item.amount || 0) > Number(item.balance || 0)
            ) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Applied amount exceeds invoice balance</AlertTitle>
                <AlertDescription>
                  One or more applied amounts are higher than the selected invoice balance.
                </AlertDescription>
              </Alert>
            )}

            {applicationTotal > Number(amount || 0) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Applied amount exceeds receipt amount</AlertTitle>
                <AlertDescription>
                  Reduce application amounts or increase the receipt amount.
                </AlertDescription>
              </Alert>
            )}

            {isBackdateChecked && !backdateReason.trim() && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Backdate reason required</AlertTitle>
                <AlertDescription>
                  Enter a reason for backdating this receipt before saving.
                </AlertDescription>
              </Alert>
            )}

            {createMutation.isSuccess && (
              <Alert>
                <AlertTitle>Receipt created</AlertTitle>
                <AlertDescription>
                  The receipt list has been refreshed.
                </AlertDescription>
              </Alert>
            )}
            {postMutation.isSuccess && (
              <Alert>
                <AlertTitle>Receipt posted</AlertTitle>
                <AlertDescription>
                  The customer receipt has been posted and the receipt list has been refreshed.
                </AlertDescription>
              </Alert>
            )}

            {postMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to post receipt</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(postMutation.error)}
                </AlertDescription>
              </Alert>
            )}
            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create receipt</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={resetCreateForm}>
                Close
              </Button>

              <Can roles={ACTION_ROLES.CREATE_RECEIPT}>
                <Button
                  onClick={handleCreateReceipt}
                  disabled={!createFormIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Receipt"
                  )}
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1050px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load receipt</AlertTitle>
              <AlertDescription>
                {getErrorMessage(detailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailHeader ? (
            <Alert>
              <AlertTitle>No receipt data</AlertTitle>
              <AlertDescription>
                The selected customer receipt could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox
                  label="Receipt No"
                  value={detailHeader.receipt_no || "-"}
                />
                <InfoBox
                  label="Customer"
                  value={detailHeader.customer_name || "-"}
                />
                <InfoBox
                  label="Payment Date"
                  value={formatDate(detailHeader.payment_date)}
                />
                <InfoBox label="Method" value={detailHeader.method || "-"} />
                <InfoBox
                  label="Reference"
                  value={detailHeader.reference || "-"}
                />
                <InfoBox
                  label="Amount"
                  value={formatMoney(detailHeader.amount)}
                />
                <InfoBox
                  label="Posted"
                  value={detailHeader.is_posted ? "Yes" : "No"}
                />
                <InfoBox
                  label="Journal ID"
                  value={detailHeader.posted_journal_id || "-"}
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailHeader.created_at)}
                />
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Backdated</TableHead>
                      <TableHead className="text-right">
                        Applied Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailApplications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          No receipt applications found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailApplications.map((item) => (
                        <TableRow
                          key={`${item.ar_payment_id}-${item.ar_invoice_id}`}
                        >
                          <TableCell className="font-medium">
                            {item.invoice_no || "-"}
                          </TableCell>
                          <TableCell>{formatDate(item.invoice_date)}</TableCell>
                          <TableCell>{formatDate(item.due_date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {item.status || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {getBackdatedBadge(item.backdate_flag)}
                            {item.backdate_flag && item.backdate_reason && (
                              <p
                                className="mt-1 max-w-48 truncate text-xs text-slate-500"
                                title={item.backdate_reason}
                              >
                                {item.backdate_reason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(item.applied_amount)}
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
                  onClick={() => setIsDetailsOpen(false)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <Button variant="outline" onClick={handlePrintReceipt}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Receipt
                </Button>

                <Button variant="outline" onClick={handleDownloadPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>

                <Button
                  onClick={handlePostReceipt}
                  disabled={
                    Boolean(detailHeader?.is_posted) ||
                    postMutation.isPending ||
                    !detailHeader?.receipt_no
                  }
                >
                  {postMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Post Receipt
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

function PreviewBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold">{value || "-"}</p>
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
