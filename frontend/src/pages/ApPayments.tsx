import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Edit,
  Download,
  Eye,
  FileDown,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";

import {
 createApPayment,
  deleteApPayment,
  getApPaymentById,
  getApPaymentSummary,
  getParties,
  getSupplierOpenInvoices,
  postApPayment,
  updateApPayment,
  voidApPayment,
} from "@/api/client";
import type {
  ApPaymentApplicationRow,
  ApPaymentHeader,
  ApPaymentSummaryRow,
  SupplierOpenInvoiceRow,
} from "@/types/api";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// removed: import { Checkbox } from "@/components/ui/checkbox";
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

type PaymentApplication = {
  ap_invoice_id: string;
  invoice_no?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  invoice_total?: string | number | null;
  amount_paid?: string | number | null;
  balance?: string | number | null;
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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildSupplierPaymentPrintHtml(
  header: ApPaymentHeader,
  applications: ApPaymentApplicationRow[]
) {
  const appliedTotal = applications.reduce(
    (sum, row) => sum + Number(row.applied_amount || 0),
    0
  );
  const unappliedAmount = Number(header.amount || 0) - appliedTotal;

  const rowsHtml =
    applications.length === 0
      ? `<tr><td colspan="7" class="center muted">No payment applications found.</td></tr>`
      : applications
          .map((item) => {
            return `
              <tr>
                <td>${escapeHtml(item.invoice_no || "-")}</td>
                <td>${escapeHtml(formatDate(item.invoice_date))}</td>
                <td>${escapeHtml(formatDate(item.due_date))}</td>
                <td>${escapeHtml(item.status || "-")}</td>
                <td class="right">${escapeHtml(formatMoney(item.invoice_total || 0))}</td>
                <td class="right">${escapeHtml(formatMoney(item.applied_amount || 0))}</td>
                <td class="right">${escapeHtml(formatMoney(item.invoice_balance || 0))}</td>
              </tr>
            `;
          })
          .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Supplier Payment Voucher - ${escapeHtml(header.payment_no || "")}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 28px;
            font-size: 12px;
          }
          .top {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            border-bottom: 2px solid #111827;
            padding-bottom: 14px;
            margin-bottom: 18px;
          }
          h1 { margin: 0; font-size: 22px; }
          h2 { margin: 0 0 8px; font-size: 15px; }
          .muted { color: #64748b; }
          .box {
            border: 1px solid #d1d5db;
            border-radius: 10px;
            padding: 14px;
            margin-bottom: 14px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
          }
          .label {
            font-size: 10px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: bold;
            margin-bottom: 4px;
          }
          .value { font-weight: bold; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            border-bottom: 1px solid #e5e7eb;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f8fafc;
            font-size: 11px;
            text-transform: uppercase;
            color: #475569;
          }
          .right { text-align: right; }
          .center { text-align: center; }
          .totals {
            width: 340px;
            margin-left: auto;
            margin-top: 16px;
          }
          .totals div {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid #e5e7eb;
            padding: 7px 0;
          }
          .signatures {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-top: 54px;
          }
          .signature-line {
            border-top: 1px solid #111827;
            padding-top: 7px;
            text-align: center;
          }
          @media print {
            body { margin: 18mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="top">
          <div>
            <h1>KAM GRAINS SUPPLIES</h1>
            <div class="muted">Integrated Business Management System</div>
          </div>
          <div class="right">
            <h2>Supplier Payment Voucher</h2>
            <div>${escapeHtml(header.payment_no || "-")}</div>
          </div>
        </div>

        <div class="box grid">
          <div>
            <div class="label">Supplier</div>
            <div class="value">${escapeHtml(header.supplier_name || "-")}</div>
          </div>
          <div>
            <div class="label">Payment Date</div>
            <div class="value">${escapeHtml(formatDate(header.payment_date))}</div>
          </div>
          <div>
            <div class="label">Method</div>
            <div class="value">${escapeHtml(header.method || "-")}</div>
          </div>
          <div>
            <div class="label">Posted</div>
            <div class="value">${header.is_posted ? "Yes" : "No"}</div>
          </div>
          <div>
            <div class="label">Reference</div>
            <div class="value">${escapeHtml(header.reference || "-")}</div>
          </div>
          <div>
            <div class="label">Payment Amount</div>
            <div class="value">${escapeHtml(formatMoney(header.amount))}</div>
          </div>
          <div>
            <div class="label">Journal ID</div>
            <div class="value">${escapeHtml(header.posted_journal_id || "-")}</div>
          </div>
          <div>
            <div class="label">Created At</div>
            <div class="value">${escapeHtml(formatDateTime(header.created_at))}</div>
          </div>
        </div>

        <div class="box">
          <h2>Applied Supplier Invoices</h2>
          <table>
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>Status</th>
                <th class="right">Invoice Total</th>
                <th class="right">Applied Amount</th>
                <th class="right">Invoice Balance</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <div class="totals">
            <div><strong>Payment Amount</strong><strong>${escapeHtml(formatMoney(header.amount))}</strong></div>
            <div><span>Total Applied</span><span>${escapeHtml(formatMoney(appliedTotal))}</span></div>
            <div><span>Unapplied Amount</span><span>${escapeHtml(formatMoney(unappliedAmount))}</span></div>
          </div>
        </div>

        <div class="signatures">
          <div class="signature-line">Prepared By</div>
          <div class="signature-line">Checked By</div>
          <div class="signature-line">Received / Approved By</div>
        </div>
      </body>
    </html>
  `;
}

function openPrintableSupplierPayment(
  header: ApPaymentHeader | undefined,
  applications: ApPaymentApplicationRow[]
) {
  if (!header) return;

  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups to print or save PDF.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildSupplierPaymentPrintHtml(header, applications));
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 300);
}

export default function ApPayments() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [applications, setApplications] = useState<PaymentApplication[]>([]);

  // PHASE 4: backdate controls. transaction_date/backdate_flag/backdate_reason
  // live on the pur.ap_payment HEADER (see migration + backend route), so
  // unlike AR receipts this is a single set of fields for the whole payment.
  const [isBackdateChecked, setIsBackdateChecked] = useState(false);
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [backdateReason, setBackdateReason] = useState("");

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const paymentsQuery = useQuery({
    queryKey: ["ap-payment-summary"],
    queryFn: getApPaymentSummary,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties-for-ap-payments"],
    queryFn: getParties,
  });

  const openInvoicesQuery = useQuery({
    queryKey: ["supplier-open-invoices", supplierId],
    queryFn: () => getSupplierOpenInvoices(supplierId),
    enabled: Boolean(supplierId && isCreateOpen),
  });

  const detailQuery = useQuery({
    queryKey: ["ap-payment-detail", selectedPaymentId],
    queryFn: () => getApPaymentById(selectedPaymentId as string),
    enabled: Boolean(selectedPaymentId && isDetailsOpen),
  });

  async function invalidateApPaymentQueries() {
    await queryClient.invalidateQueries({
      queryKey: ["ap-payment-summary"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["ap-invoice-summary"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["supplier-open-invoices"],
    });

    if (selectedPaymentId) {
      await queryClient.invalidateQueries({
        queryKey: ["ap-payment-detail", selectedPaymentId],
      });
    }
  }

  const createMutation = useMutation({
    mutationFn: createApPayment,
    onSuccess: async () => {
      await invalidateApPaymentQueries();
      resetCreateForm();
      setLastRefreshed(new Date());
    },
  });

  const postMutation = useMutation({
    mutationFn: (paymentId: string) => postApPayment(paymentId),
    onSuccess: async () => {
      await invalidateApPaymentQueries();
      setLastRefreshed(new Date());
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      voidApPayment(paymentId, reason),
    onSuccess: async () => {
      await invalidateApPaymentQueries();
      setLastRefreshed(new Date());
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { paymentId: string; data: unknown }) =>
      updateApPayment(payload.paymentId, payload.data),
    onSuccess: async () => {
      await invalidateApPaymentQueries();
      setLastRefreshed(new Date());
      setIsCreateOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (paymentId: string) => deleteApPayment(paymentId),
    onSuccess: async () => {
      await invalidateApPaymentQueries();
      setIsDetailsOpen(false);
      setSelectedPaymentId(null);
      setLastRefreshed(new Date());
    },
  });

  const payments: ApPaymentSummaryRow[] = normalizeArray<ApPaymentSummaryRow>(
  paymentsQuery.data,
  ["ap_payments", "data"]
);

  type PartyOption = {
  party_id: string;
  party_name: string;
  party_type?: string | null;
};

const parties: PartyOption[] = normalizeArray<PartyOption>(
  partiesQuery.data,
  ["parties", "data"]
);

  const supplierOptions = parties.filter((party) => {
    const type = String(party.party_type || "").toUpperCase();
    return !type || type.includes("SUPPLIER") || type.includes("BOTH");
  });

  const openInvoices: SupplierOpenInvoiceRow[] =
  openInvoicesQuery.data?.open_invoices ?? [];

  useEffect(() => {
    if (!supplierId || !isCreateOpen) return;

    setApplications([]);
    setAmount("");
  }, [supplierId, isCreateOpen]);

  useEffect(() => {
    if (transactionDate && transactionDate < todayIso()) {
      setIsBackdateChecked(true);
    }
  }, [transactionDate]);

  const filteredRows = (() => {
    const term = search.trim().toLowerCase();

    if (!term) return payments;

    return payments.filter((row) =>
      [
        row.payment_no,
        row.supplier_name,
        row.payment_date,
        row.method,
        row.reference,
        row.applied_invoices,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  })();

  const totalPaidOut = filteredRows.reduce(
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

  const detailHeader: ApPaymentHeader | undefined =
  detailQuery.data?.ap_payment;
  const detailApplications: ApPaymentApplicationRow[] =
  detailQuery.data?.applications ?? [];
  const applicationTotal = applications.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const applicationInvoiceBalanceTotal = applications.reduce(
    (sum, item) => sum + Number(item.balance || 0),
    0
  );

  const paymentAmountNumber =
    applications.length > 0 ? applicationTotal : Number(amount || 0);
  const unappliedPreview = Math.max(paymentAmountNumber - applicationTotal, 0);
  const remainingInvoiceBalancePreview = Math.max(
    applicationInvoiceBalanceTotal - applicationTotal,
    0
  );

  useEffect(() => {
    const nextTotal = applications.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    setAmount(applications.length > 0 ? String(nextTotal) : '');
  }, [applications]);

  const createFormIsValid =
    supplierId &&
    paymentDate &&
    applications.length > 0 &&
    applicationTotal > 0 &&
    paymentAmountNumber > 0 &&
    Math.abs(applicationTotal - paymentAmountNumber) <= 0.01 &&
    applications.every((item) => {
      const applicationAmount = Number(item.amount || 0);
      const invoiceBalance = Number(item.balance || 0);
      return applicationAmount > 0 && applicationAmount <= invoiceBalance;
    }) &&
    (!isBackdateChecked || Boolean(backdateReason.trim()));

  async function handleRefresh() {
    await paymentsQuery.refetch();
    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `AP_Payments_${formatDateKey()}.xlsx`,
        sheetName: "AP Payments",
        rows: filteredRows,
        columns: [
          {
            header: "Payment No",
            value: (row: AnyRecord) => row.payment_no || "",
            width: 18,
            type: "text",
          },
          {
            header: "Supplier",
            value: (row: AnyRecord) => row.supplier_name || "",
            width: 28,
            type: "text",
          },
          {
            header: "Payment Date",
            value: (row: AnyRecord) => row.payment_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Method",
            value: (row: AnyRecord) => row.method || "",
            width: 14,
            type: "text",
          },
          {
            header: "Reference",
            value: (row: AnyRecord) => row.reference || "",
            width: 20,
            type: "text",
          },
          {
            header: "Amount",
            value: (row: AnyRecord) => Number(row.amount || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Applied Amount",
            value: (row: AnyRecord) => Number(row.applied_amount || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Unapplied Amount",
            value: (row: AnyRecord) => Number(row.unapplied_amount || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Applied Invoices",
            value: (row: AnyRecord) => row.applied_invoices || "",
            width: 34,
            type: "text",
          },
          {
  header: "Backdated",
  value: (row: AnyRecord) =>
    row.backdate_flag ? "Yes" : "No",
  width: 12,
  type: "text",
},
          {
            header: "Posted Status",
            value: (row: AnyRecord) => (row.is_posted ? "Posted" : "Not Posted"),
            width: 14,
            type: "text",
          },
          {
            header: "Journal ID",
            value: (row: AnyRecord) => row.posted_journal_id || "",
            width: 24,
            type: "text",
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

  function resetCreateForm() {
    setSupplierId("");
    setPaymentDate(todayIso());
    setAmount("");
    setMethod("CASH");
    setReference("");
    setApplications([]);
    setEditingPaymentId(null);
    setIsBackdateChecked(false);
    setTransactionDate(todayIso());
    setBackdateReason("");
    setIsCreateOpen(false);
  }

  function openDetails(paymentId: string) {
    setSelectedPaymentId(paymentId);
    setIsDetailsOpen(true);
  }

  function startEditPayment() {
    if (!detailHeader || detailHeader.is_posted) return;

    setEditingPaymentId(detailHeader.ap_payment_id);
    setSupplierId(detailHeader.supplier_id || "");
    setPaymentDate(String(detailHeader.payment_date || new Date().toISOString()).slice(0, 10));
    setAmount(String(Number(detailHeader.amount || 0)));
    setMethod(detailHeader.method || "CASH");
    setReference(detailHeader.reference || "");
    setIsBackdateChecked(Boolean(detailHeader.backdate_flag));
    setTransactionDate(
      String(
        detailHeader.transaction_date || detailHeader.payment_date || new Date().toISOString()
      ).slice(0, 10)
    );
    setBackdateReason(detailHeader.backdate_reason || "");

    setApplications(
      detailApplications.map((item) => ({
        ap_invoice_id: item.ap_invoice_id,
        invoice_no: item.invoice_no,
        invoice_date: item.invoice_date,
        due_date: item.due_date,
        status: item.status,
        invoice_total: item.invoice_total,
        amount_paid: Number(item.amount_paid || 0) - Number(item.applied_amount || 0),
        balance:
          Number(item.invoice_balance || 0) + Number(item.applied_amount || 0),
        amount: String(Number(item.applied_amount || 0)),
      }))
    );

    setIsDetailsOpen(false);
    setIsCreateOpen(true);
  }

  function addApplication(invoice: SupplierOpenInvoiceRow) {
    const exists = applications.some(
      (item) => item.ap_invoice_id === invoice.ap_invoice_id
    );

    if (exists) return;

    const invoiceBalance = Number(invoice.balance || 0);
    const paymentAmount = Number(amount || 0);

    if (invoiceBalance <= 0) return;

    const alreadyApplied = applications.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const remainingPaymentAmount = Math.max(paymentAmount - alreadyApplied, 0);

    const applyAmount =
      paymentAmount > 0 ? Math.min(invoiceBalance, remainingPaymentAmount) : invoiceBalance;

    setApplications((current) => [
      ...current,
      {
        ap_invoice_id: invoice.ap_invoice_id,
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

  }

  function removeApplication(invoiceId: string) {
    setApplications((current) =>
      current.filter((item) => item.ap_invoice_id !== invoiceId)
    );
  }

  function recalculateApplicationsForPaymentAmount(
    currentApplications: PaymentApplication[],
    nextPaymentAmount: number
  ) {
    let remainingPayment = Math.max(nextPaymentAmount, 0);

    return currentApplications.map((item) => {
      const invoiceBalance = Number(item.balance || 0);
      const nextApplyAmount = Math.min(invoiceBalance, remainingPayment);

      remainingPayment = Math.max(remainingPayment - nextApplyAmount, 0);

      return {
        ...item,
        amount: String(nextApplyAmount),
      };
    });
  }

  function handlePaymentAmountChange(value: string) {
    setAmount(value);

    const nextPaymentAmount = Number(value || 0);

    setApplications((current) =>
      recalculateApplicationsForPaymentAmount(current, nextPaymentAmount)
    );
  }

  function updateApplicationAmount(invoiceId: string, value: string) {
    setApplications((current) =>
      current.map((item) =>
        item.ap_invoice_id === invoiceId ? { ...item, amount: value } : item
      )
    );
  }

  function buildPaymentPayload() {
    return {
      supplier_id: supplierId,
      payment_date: paymentDate,
      amount: applicationTotal,
      method,
      reference: reference || null,
      applications: applications.map((item) => ({
        ap_invoice_id: item.ap_invoice_id,
        amount: Number(item.amount || 0),
      })),
      // PHASE 4
      transaction_date: isBackdateChecked ? transactionDate : paymentDate,
      backdate_flag: isBackdateChecked,
      backdate_reason: isBackdateChecked ? backdateReason : null,
    };
  }

  function handleCreatePayment() {
    const payload = buildPaymentPayload();

    if (editingPaymentId) {
      updateMutation.mutate({
        paymentId: editingPaymentId,
        data: payload,
      });
      return;
    }

    createMutation.mutate(payload);
  }

  function handleDeletePayment() {
    if (!detailHeader?.ap_payment_id || detailHeader?.is_posted) return;

    const confirmed = window.confirm(
      `Delete unposted supplier payment ${detailHeader.payment_no}? This cannot be undone.`
    );

    if (!confirmed) return;

    deleteMutation.mutate(detailHeader.ap_payment_id);
  }

  function handlePostPayment() {
    if (!detailHeader?.ap_payment_id) return;

    const confirmed = window.confirm(
      `Post supplier payment ${detailHeader.payment_no}? This will create the accounting journal.`
    );

    if (!confirmed) return;

    postMutation.mutate(detailHeader.ap_payment_id);
  }

  function handleVoidPayment() {
    if (!detailHeader?.ap_payment_id) return;
    if (detailHeader?.is_posted !== true) {
      window.alert("Only posted AP payments can be voided.");
      return;
    }

    if (String(detailHeader?.status || "").toUpperCase() === "VOID") {
      window.alert("This supplier payment is already voided.");
      return;
    }

    const reason = window.prompt(
      `Enter a reason for voiding supplier payment ${detailHeader.payment_no}:`,
      ""
    );

    if (reason === null) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      window.alert("A void reason is required.");
      return;
    }

    const confirmed = window.confirm(
      `Void supplier payment ${detailHeader.payment_no}? This creates a reversal journal and keeps the original journal unchanged.`
    );

    if (!confirmed) return;

    voidMutation.mutate({
      paymentId: detailHeader.ap_payment_id,
      reason: trimmedReason,
    });
  }

  if (paymentsQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (paymentsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Supplier payments failed to load</AlertTitle>
        <AlertDescription>
          Check backend connection and AP payment routes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AP Payments</h1>
          <p className="mt-1 text-slate-500">
            Record supplier payments and apply them to open supplier invoices.
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
            disabled={paymentsQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Supplier Payment
          </Button>
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
              Payment Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Paid Out
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalPaidOut)}</p>
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
            Supplier Payment List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search payment, supplier, method, reference, invoice..."
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
                  <TableHead>Payment No</TableHead>
                  <TableHead>Supplier</TableHead>
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
                      No supplier payments found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.ap_payment_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openDetails(row.ap_payment_id)}
                    >
                      <TableCell className="font-medium">
                        {row.payment_no}
                      </TableCell>
                      <TableCell>{row.supplier_name || "-"}</TableCell>
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
                          onClick={() => openDetails(row.ap_payment_id)}
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
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1150px] overflow-y-auto sm:!max-w-[1150px]">
          <DialogHeader>
            <DialogTitle>
              {editingPaymentId ? "Edit Supplier Payment" : "New Supplier Payment"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((party) => (
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
                <Label>Payment Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(event) => handlePaymentAmountChange(
                    event.target.value
                  )}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label>Reference</Label>
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Cash payment, mobile money transaction ID, bank ref..."
                />
              </div>
            </div>

            {/* PHASE 4: Backdate Transaction controls — ADMIN/MANAGER only */}
            <Can roles={ACTION_ROLES.CREATE_BACKDATED_AP_PAYMENT}>
              <Card className="rounded-2xl border-amber-200 bg-amber-50/60 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ap-payment-backdate"
                      checked={isBackdateChecked}
                      onChange={(e) => setIsBackdateChecked(e.target.checked)}
                      className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <Label
                      htmlFor="ap-payment-backdate"
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
                        placeholder="Why is this payment being recorded for a past date?"
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            </Can>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Open Posted Supplier Invoices
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Listed oldest business date first (FIFO).
                </p>
              </CardHeader>

              <CardContent>
                {!supplierId ? (
                  <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
                    Select a supplier to load open invoices.
                  </div>
                ) : openInvoicesQuery.isLoading ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                  </div>
                ) : openInvoices.length === 0 ? (
                  <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
                    No posted supplier invoices with an outstanding balance were found for this supplier.
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
                          <TableRow key={invoice.ap_invoice_id}>
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
                                disabled={
                                  applications.some(
                                    (item) =>
                                      item.ap_invoice_id === invoice.ap_invoice_id
                                  ) || Number(invoice.balance || 0) <= 0
                                }
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
                  Payment Applications
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
                          <TableRow key={item.ap_invoice_id}>
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
                                className="ml-auto w-40 text-right"
                                value={item.amount}
                                onChange={(event) =>
                                  updateApplicationAmount(
                                    item.ap_invoice_id,
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
                                  removeApplication(item.ap_invoice_id)
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
                          <TableCell />
                          <TableCell className="text-right font-bold">
                            {formatMoney(applicationTotal)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-slate-50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Payment Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <InfoBox
                    label="Payment Amount"
                    value={formatMoney(paymentAmountNumber)}
                  />
                  <InfoBox
                    label="Applied Amount"
                    value={formatMoney(applicationTotal)}
                  />
                  <InfoBox
                    label="Unapplied Amount"
                    value={formatMoney(unappliedPreview)}
                  />
                  <InfoBox
                    label="Invoice Balance After"
                    value={formatMoney(remainingInvoiceBalancePreview)}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Payment Amount is synchronized to the total applied amount.
                  Edit application amounts directly; supplier invoice payments
                  therefore keep the unapplied amount at zero.
                </p>
              </CardContent>
            </Card>

            {applicationTotal > Number(amount || 0) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Applied amount exceeds payment amount</AlertTitle>
                <AlertDescription>
                  Reduce application amounts or increase the payment amount.
                </AlertDescription>
              </Alert>
            )}

            {isBackdateChecked && !backdateReason.trim() && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Backdate reason required</AlertTitle>
                <AlertDescription>
                  Enter a reason for backdating this payment before saving.
                </AlertDescription>
              </Alert>
            )}

            {createMutation.isSuccess && (
              <Alert>
                <AlertTitle>Supplier payment created</AlertTitle>
                <AlertDescription>
                  The payment list has been refreshed.
                </AlertDescription>
              </Alert>
            )}

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create supplier payment</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            {updateMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to update supplier payment</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(updateMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={resetCreateForm}>
                Close
              </Button>

              <Button
                onClick={handleCreatePayment}
                disabled={
                  !createFormIsValid ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingPaymentId ? "Updating..." : "Creating..."}
                  </>
                ) : editingPaymentId ? (
                  "Update Supplier Payment"
                ) : (
                  "Create Supplier Payment"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1050px] overflow-y-auto sm:!max-w-[1050px]">
          <DialogHeader>
            <DialogTitle>Supplier Payment Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load supplier payment</AlertTitle>
              <AlertDescription>Please try again.</AlertDescription>
            </Alert>
          ) : !detailHeader ? (
            <Alert>
              <AlertTitle>No supplier payment data</AlertTitle>
              <AlertDescription>
                The selected supplier payment could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox
                  label="Payment No"
                  value={detailHeader.payment_no || "-"}
                />
                <InfoBox
                  label="Supplier"
                  value={detailHeader.supplier_name || "-"}
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
                  label="Status"
                  value={
                    String(detailHeader.status || (detailHeader.is_posted ? "POSTED" : "DRAFT")).toUpperCase()
                  }
                />
                <InfoBox
                  label="Posted"
                  value={detailHeader.is_posted ? "Yes" : "No"}
                />
                <InfoBox
                  label="Journal ID"
                  value={detailHeader.posted_journal_id || "-"}
                />
                {detailHeader.reversal_journal_id && (
                  <InfoBox
                    label="Reversal Journal"
                    value={detailHeader.reversal_journal_id || "-"}
                  />
                )}
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

              {postMutation.isSuccess && (
                <Alert>
                  <AlertTitle>Supplier payment posted</AlertTitle>
                  <AlertDescription>
                    The supplier payment has been posted and the payment list has
                    been refreshed.
                  </AlertDescription>
                </Alert>
              )}

              {voidMutation.isSuccess && (
                <Alert>
                  <AlertTitle>Supplier payment voided</AlertTitle>
                  <AlertDescription>
                    The payment is now marked VOID and a reversal journal has been
                    created.
                  </AlertDescription>
                </Alert>
              )}

              {postMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to post supplier payment</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(postMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {voidMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to void supplier payment</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(voidMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {deleteMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to delete supplier payment</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(deleteMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        Applied Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailApplications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          No payment applications found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailApplications.map((item) => (
                        <TableRow
                          key={`${item.ap_payment_id}-${item.ap_invoice_id}`}
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
                  Close
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    openPrintableSupplierPayment(detailHeader, detailApplications)
                  }
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print Voucher
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    openPrintableSupplierPayment(detailHeader, detailApplications)
                  }
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Save PDF
                </Button>

                <Button
                  variant="outline"
                  onClick={startEditPayment}
                  disabled={Boolean(detailHeader?.is_posted)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>

                <Button
                  variant="destructive"
                  onClick={handleDeletePayment}
                  disabled={
                    Boolean(detailHeader?.is_posted) ||
                    deleteMutation.isPending ||
                    !detailHeader?.ap_payment_id
                  }
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete
                </Button>

                <Button
                  variant="outline"
                  onClick={handleVoidPayment}
                  disabled={
                    !detailHeader?.ap_payment_id ||
                    detailHeader?.is_posted !== true ||
                    String(detailHeader?.status || "").toUpperCase() === "VOID" ||
                    voidMutation.isPending
                  }
                >
                  {voidMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Voiding...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Void Payment
                    </>
                  )}
                </Button>

                <Button
                  onClick={handlePostPayment}
                  disabled={
                    Boolean(detailHeader?.is_posted) ||
                    postMutation.isPending ||
                    !detailHeader?.ap_payment_id
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
                      Post Payment
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
