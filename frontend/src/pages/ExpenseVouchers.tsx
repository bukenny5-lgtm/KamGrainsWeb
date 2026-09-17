import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  ArrowLeft,
  Printer,
  Download,
} from "lucide-react";

import {
  createExpenseVoucher,
  getExpenseVoucherByNo,
  getExpenseVouchers,
  getFinanceGlAccounts,
  getParties,
  postExpenseVoucher,
} from "@/api/client";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";
import { BUSINESS_PROFILE_FALLBACK } from "@/lib/businessProfile";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AnyRecord = Record<string, any>;

type ExpenseLine = {
  expense_account_id: string;
  description: string;
  amount: string;
};

function normalizeArray(data: any, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;

  return [];
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

function formatMoney(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function getStatusBadge(status: unknown) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "POSTED") {
    return <Badge className="bg-green-600 hover:bg-green-600">POSTED</Badge>;
  }

  if (text === "DRAFT") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">DRAFT</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
}
function getErrorMessage(error: unknown, fallbackMessage: string) {
  const err = error as any;

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

const BUSINESS_NAME = BUSINESS_PROFILE_FALLBACK.company_name;
const SYSTEM_NAME = "Supplies Management System";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildExpenseVoucherPrintHtml(
  voucher: AnyRecord,
  voucherLines: AnyRecord[],
  totals: AnyRecord
) {
  const totalAmount =
    totals?.total_amount ??
    voucherLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

  const lineRows = voucherLines
    .map((line, index) => {
      const account = line.expense_account_code
        ? `${line.expense_account_code} - ${line.expense_account_name || ""}`
        : line.expense_account_name || "-";

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(account)}</td>
          <td>${escapeHtml(line.description || "-")}</td>
          <td class="right">${escapeHtml(formatMoney(line.amount))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Expense Voucher - ${escapeHtml(voucher.voucher_no || "")}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            margin: 0;
            padding: 28px;
            background: #ffffff;
          }
          .document {
            max-width: 960px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 3px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 18px;
          }
          .business-name {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 0.5px;
          }
          .system-name {
            margin-top: 4px;
            color: #4b5563;
            font-size: 13px;
          }
          .document-title {
            text-align: right;
            font-size: 22px;
            font-weight: 800;
          }
          .document-no {
            margin-top: 6px;
            color: #374151;
            font-size: 13px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin: 18px 0;
          }
          .box {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 10px;
            min-height: 62px;
          }
          .label {
            color: #6b7280;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .value {
            margin-top: 6px;
            font-size: 13px;
            font-weight: 700;
            overflow-wrap: anywhere;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 14px;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 9px;
            vertical-align: top;
          }
          th {
            background: #f3f4f6;
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
          }
          .right { text-align: right; }
          .total-row td {
            font-weight: 800;
            background: #f9fafb;
          }
          .notes {
            margin-top: 18px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 12px;
            min-height: 62px;
          }
          .signatures {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-top: 48px;
          }
          .signature-line {
            border-top: 1px solid #111827;
            padding-top: 8px;
            font-size: 12px;
            color: #374151;
          }
          .footer {
            margin-top: 28px;
            color: #6b7280;
            font-size: 11px;
            text-align: center;
          }
          @media print {
            body { padding: 18px; }
            button { display: none; }
            .document { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="document">
          <div class="header">
            <div>
              <div class="business-name">${BUSINESS_NAME}</div>
              <div class="system-name">${SYSTEM_NAME}</div>
            </div>
            <div>
              <div class="document-title">EXPENSE VOUCHER</div>
              <div class="document-no">Voucher No: ${escapeHtml(voucher.voucher_no || "-")}</div>
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">Voucher Date</div>
              <div class="value">${escapeHtml(formatDate(voucher.voucher_date))}</div>
            </div>
            <div class="box">
              <div class="label">Payee</div>
              <div class="value">${escapeHtml(voucher.payee_name || "-")}</div>
            </div>
            <div class="box">
              <div class="label">Payment Account</div>
              <div class="value">${
                voucher.payment_account_code
                  ? escapeHtml(`${voucher.payment_account_code} - ${voucher.payment_account_name || ""}`)
                  : escapeHtml(voucher.payment_account_name || "-")
              }</div>
            </div>
            <div class="box">
              <div class="label">Payment Method</div>
              <div class="value">${escapeHtml(voucher.payment_method || "-")}</div>
            </div>
            <div class="box">
              <div class="label">Reference</div>
              <div class="value">${escapeHtml(voucher.reference_no || "-")}</div>
            </div>
            <div class="box">
              <div class="label">Status</div>
              <div class="value">${escapeHtml(voucher.status || "-")}</div>
            </div>
            <div class="box">
              <div class="label">Journal ID</div>
              <div class="value">${escapeHtml(voucher.posted_journal_id || "-")}</div>
            </div>
            <div class="box">
              <div class="label">Total Amount</div>
              <div class="value">${escapeHtml(formatMoney(totalAmount))}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 52px;">#</th>
                <th>Expense Account</th>
                <th>Description</th>
                <th class="right" style="width: 160px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${
                lineRows ||
                `<tr><td colspan="4" style="text-align:center;">No expense lines found.</td></tr>`
              }
              <tr class="total-row">
                <td colspan="3" class="right">Total</td>
                <td class="right">${escapeHtml(formatMoney(totalAmount))}</td>
              </tr>
            </tbody>
          </table>

          <div class="notes">
            <div class="label">Notes</div>
            <div class="value">${escapeHtml(voucher.notes || "-")}</div>
          </div>

          <div class="signatures">
            <div class="signature-line">Prepared By</div>
            <div class="signature-line">Checked By</div>
            <div class="signature-line">Approved / Received By</div>
          </div>

          <div class="footer">
            Printed from ${BUSINESS_NAME} - ${SYSTEM_NAME} on ${escapeHtml(formatDateTime(new Date().toISOString()))}
          </div>
        </div>
      </body>
    </html>
  `;
}

function openPrintWindow(html: string) {
  const printWindow = window.open("", "_blank", "width=1100,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups, then try again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 400);
}

function printExpenseVoucher(
  voucher: AnyRecord,
  voucherLines: AnyRecord[],
  totals: AnyRecord
) {
  openPrintWindow(buildExpenseVoucherPrintHtml(voucher, voucherLines, totals));
}

export default function ExpenseVouchers() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [voucherNo, setVoucherNo] = useState("");
  const [voucherDate, setVoucherDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [payeeId, setPayeeId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ExpenseLine[]>([
    {
      expense_account_id: "",
      description: "",
      amount: "",
    },
  ]);

  const [selectedVoucherNo, setSelectedVoucherNo] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const vouchersQuery = useQuery({
    queryKey: ["expense-vouchers"],
    queryFn: getExpenseVouchers,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties-for-expense-vouchers"],
    queryFn: getParties,
  });

  const accountsQuery = useQuery({
    queryKey: ["gl-accounts-for-expense-vouchers"],
    queryFn: getFinanceGlAccounts,
  });

  const detailQuery = useQuery({
    queryKey: ["expense-voucher-detail", selectedVoucherNo],
    queryFn: () => getExpenseVoucherByNo(selectedVoucherNo as string),
    enabled: Boolean(selectedVoucherNo && isDetailsOpen),
  });

  const createMutation = useMutation({
    mutationFn: createExpenseVoucher,
    onSuccess: async () => {
      await vouchersQuery.refetch();
      resetCreateForm();
      setLastRefreshed(new Date());
    },
  });

  const postMutation = useMutation({
    mutationFn: (voucherNoToPost: string) => postExpenseVoucher(voucherNoToPost),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["expense-vouchers"] });
      await queryClient.invalidateQueries({
        queryKey: ["expense-voucher-detail", selectedVoucherNo],
      });
      setLastRefreshed(new Date());
    },
  });

  const vouchers: AnyRecord[] = normalizeArray(vouchersQuery.data, ["data"]);
  const parties: AnyRecord[] = normalizeArray(partiesQuery.data, [
    "parties",
    "data",
  ]);
  const accounts: AnyRecord[] = normalizeArray(accountsQuery.data, ["data"]);

  const paymentAccounts = accounts.filter((account) => {
    const type = String(account.account_type || "").toUpperCase();
    return (
      account.is_active !== false &&
      ["ASSET", "CASH", "BANK"].some((x) => type.includes(x))
    );
  });
const suggestedPaymentAccount = useMemo(() => {
  const method = String(paymentMethod || "").toUpperCase();

  if (method === "CASH") {
    return paymentAccounts.find(
      (account) =>
        String(account.account_code) === "1000" ||
        String(account.account_name || "").toUpperCase().includes("CASH")
    );
  }

  if (method === "BANK" || method === "CHEQUE") {
    return paymentAccounts.find(
      (account) =>
        String(account.account_code) === "1010" ||
        String(account.account_name || "").toUpperCase().includes("BANK")
    );
  }

  if (method === "MOBILE_MONEY") {
    return paymentAccounts.find(
      (account) =>
        String(account.account_code) === "1020" ||
        String(account.account_name || "").toUpperCase().includes("MOBILE MONEY")
    );
  }

  return null;
}, [paymentAccounts, paymentMethod]);

useEffect(() => {
  if (!isCreateOpen) return;
  if (paymentAccountId) return;
  if (!suggestedPaymentAccount?.account_id) return;

  setPaymentAccountId(suggestedPaymentAccount.account_id);
}, [
  isCreateOpen,
  paymentAccountId,
  suggestedPaymentAccount?.account_id,
]);
  const expenseAccounts = accounts.filter((account) => {
    const type = String(account.account_type || "").toUpperCase();
    return account.is_active !== false && type.includes("EXPENSE");
  });

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return vouchers;

    return vouchers.filter((row) =>
      [
        row.voucher_no,
        row.voucher_date,
        row.payee_name,
        row.payment_account_name,
        row.payment_method,
        row.reference_no,
        row.status,
        row.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [vouchers, search]);

  const totalAmount = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0
  );

  const draftCount = filteredRows.filter(
    (row) => String(row.status || "").toUpperCase() === "DRAFT"
  ).length;

  const postedCount = filteredRows.filter(
    (row) => String(row.status || "").toUpperCase() === "POSTED"
  ).length;

  const detailData: AnyRecord | undefined =
    detailQuery.data?.data || detailQuery.data?.expense_voucher;

  const detailLines: AnyRecord[] = detailData?.lines || [];
  const detailTotals: AnyRecord = detailData?.totals || {};

  const totalLineAmount = lines.reduce(
    (sum, line) => sum + Number(line.amount || 0),
    0
  );

  const createFormIsValid =
    voucherDate &&
    paymentAccountId &&
    paymentMethod &&
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.expense_account_id &&
        line.description.trim() &&
        Number(line.amount) > 0
    );

  async function handleRefresh() {
    await vouchersQuery.refetch();
    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `Vouchers_${formatDateKey()}.xlsx`,
        sheetName: "Vouchers",
        rows: filteredRows,
        columns: [
          {
            header: "Voucher No",
            value: (row: AnyRecord) => row.voucher_no || "",
            width: 18,
            type: "text",
          },
          {
            header: "Voucher Date",
            value: (row: AnyRecord) => row.voucher_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Payee",
            value: (row: AnyRecord) => row.payee_name || "",
            width: 28,
            type: "text",
          },
          {
            header: "Payment Account",
            value: (row: AnyRecord) =>
              row.payment_account_code
                ? `${row.payment_account_code} - ${row.payment_account_name || ""}`
                : row.payment_account_name || "",
            width: 30,
            type: "text",
          },
          {
            header: "Payment Method",
            value: (row: AnyRecord) => row.payment_method || "",
            width: 16,
            type: "text",
          },
          {
            header: "Reference",
            value: (row: AnyRecord) => row.reference_no || "",
            width: 20,
            type: "text",
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
              row.posted_journal_id || String(row.status || "").toUpperCase() === "POSTED"
                ? "Posted"
                : "Not Posted",
            width: 14,
            type: "text",
          },
          {
            header: "Lines",
            value: (row: AnyRecord) => Number(row.line_count || 0),
            width: 10,
            type: "number",
          },
          {
            header: "Total Amount",
            value: (row: AnyRecord) => Number(row.total_amount || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Journal ID",
            value: (row: AnyRecord) => row.posted_journal_id || "",
            width: 24,
            type: "text",
          },
          {
            header: "Notes",
            value: (row: AnyRecord) => row.notes || "",
            width: 36,
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
    setVoucherNo("");
    setVoucherDate(new Date().toISOString().slice(0, 10));
    setPayeeId("");
    setPaymentAccountId("");
    setPaymentMethod("CASH");
    setReferenceNo("");
    setNotes("");
    setLines([
      {
        expense_account_id: "",
        description: "",
        amount: "",
      },
    ]);
    setIsCreateOpen(false);
  }

  function openDetails(row: AnyRecord) {
    setSelectedVoucherNo(row.voucher_no);
    setIsDetailsOpen(true);
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        expense_account_id: "",
        description: "",
        amount: "",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof ExpenseLine, value: string) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [field]: value } : line))
    );
  }

  function handleCreateVoucher() {
    createMutation.mutate({
      voucher_no: voucherNo || undefined,
      voucher_date: voucherDate,
      payee_id: payeeId || null,
      payment_account_id: paymentAccountId,
      payment_method: paymentMethod,
      reference_no: referenceNo || null,
      notes: notes || null,
      created_by: null,
      lines: lines.map((line) => ({
        expense_account_id: line.expense_account_id,
        description: line.description,
        amount: Number(line.amount || 0),
      })),
    });
  }

  function handlePostVoucher() {
    if (!detailData?.voucher_no) return;
    postMutation.mutate(detailData.voucher_no);
  }

  function handlePrintVoucher() {
    if (!detailData) return;
    printExpenseVoucher(detailData, detailLines, detailTotals);
  }

  function handleDownloadPdf() {
    if (!detailData) return;
    printExpenseVoucher(detailData, detailLines, detailTotals);
  }

  if (vouchersQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (vouchersQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Expense vouchers failed to load</AlertTitle>
        <AlertDescription>
          Check backend connection and finance expense voucher routes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Expense Vouchers
          </h1>
          <p className="mt-1 text-slate-500">
            Record business expenses, then post them to the general ledger.
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
            disabled={vouchersQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_EXPENSE_VOUCHER}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Expense Voucher
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
              Voucher Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalAmount)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Draft Vouchers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{draftCount}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Posted Vouchers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{postedCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Expense Voucher List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search voucher, payee, account, status, reference..."
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
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Payment Account</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Journal ID</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center">
                      No expense vouchers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.expense_voucher_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openDetails(row)}
                    >
                      <TableCell className="font-medium">
                        {row.voucher_no}
                      </TableCell>
                      <TableCell>{formatDate(row.voucher_date)}</TableCell>
                      <TableCell>{row.payee_name || "-"}</TableCell>
                      <TableCell>
                        {row.payment_account_code
                          ? `${row.payment_account_code} - ${row.payment_account_name}`
                          : row.payment_account_name || "-"}
                      </TableCell>
                      <TableCell>{row.payment_method || "-"}</TableCell>
                      <TableCell>{row.reference_no || "-"}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        {Number(row.line_count || 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.total_amount)}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
                        {row.posted_journal_id || "-"}
                      </TableCell>
                      <TableCell>{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(row)}
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
            <DialogTitle>New Expense Voucher</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Voucher No Optional</Label>
                <Input
                  value={voucherNo}
                  onChange={(event) => setVoucherNo(event.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>

              <div className="space-y-2">
                <Label>Voucher Date</Label>
                <Input
                  type="date"
                  value={voucherDate}
                  onChange={(event) => setVoucherDate(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Payee Optional</Label>
                <Select value={payeeId} onValueChange={setPayeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payee, supplier, staff, or leave blank" />
                  </SelectTrigger>
                  <SelectContent>
                    {parties.map((party) => (
                      <SelectItem key={party.party_id} value={party.party_id}>
                        {party.party_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Payment Account - money paid from</Label>
                <Select
                  value={paymentAccountId}
                  onValueChange={setPaymentAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Cash, Bank, or Mobile Money Wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.length === 0 ? (
                      <SelectItem value="NO_PAYMENT_ACCOUNTS" disabled>
                        No payment accounts found
                      </SelectItem>
                    ) : (
                      paymentAccounts.map((account) => (
                        <SelectItem
                          key={account.account_id}
                          value={account.account_id}
                        >
                          {account.account_code} - {account.account_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500">
              This is the account money is paid from. The expense line below records what the money was spent on.
               </p>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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
                <Label>Reference No</Label>
                <Input
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  placeholder="Receipt, transaction ID..."
                />
              </div>

              <div className="space-y-2 md:col-span-4">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="General notes about this expense voucher..."
                  className="min-h-24"
                />
              </div>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Expense Lines</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-[minmax(260px,1.1fr)_minmax(280px,1.2fr)_150px_90px] gap-3 px-1 text-sm font-medium text-slate-600">
                  <div>Expense Account</div>
                  <div>Description</div>
                  <div className="text-right">Amount</div>
                  <div></div>
                </div>

                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(260px,1.1fr)_minmax(280px,1.2fr)_150px_90px] items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
                  >
                    <Select
                      value={line.expense_account_id}
                      onValueChange={(value) =>
                        updateLine(index, "expense_account_id", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select expense account" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseAccounts.length === 0 ? (
                          <SelectItem value="NO_EXPENSE_ACCOUNTS" disabled>
                            No expense accounts found
                          </SelectItem>
                        ) : (
                          expenseAccounts.map((account) => (
                            <SelectItem
                              key={account.account_id}
                              value={account.account_id}
                            >
                              {account.account_code} - {account.account_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>

                    <Input
                      value={line.description}
                      onChange={(event) =>
                        updateLine(index, "description", event.target.value)
                      }
                      placeholder="Example: Loading/offloading, transport, packaging..."
                    />

                    <Input
                      type="number"
                      min="0"
                      className="text-right"
                      value={line.amount}
                      onChange={(event) =>
                        updateLine(index, "amount", event.target.value)
                      }
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}

                <div className="flex items-center justify-between border-t pt-4">
                  <Button variant="outline" onClick={addLine}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Line
                  </Button>

                  <div className="text-right">
                    <p className="text-xs text-slate-500">Total Amount</p>
                    <p className="text-xl font-bold">
                      {formatMoney(totalLineAmount)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create expense voucher</AlertTitle>
                <AlertDescription>
                  {(createMutation.error as Error)?.message ||
                    "Check payment account, expense accounts, and amounts."}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={resetCreateForm}>
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_EXPENSE_VOUCHER}>
                <Button
                  onClick={handleCreateVoucher}
                  disabled={!createFormIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Voucher"
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
            <DialogTitle>Expense Voucher Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load voucher</AlertTitle>
              <AlertDescription>Please try again.</AlertDescription>
            </Alert>
          ) : !detailData ? (
            <Alert>
              <AlertTitle>No voucher data</AlertTitle>
              <AlertDescription>
                The selected expense voucher could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {detailData.voucher_no}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Payee:{" "}
                    <span className="font-medium text-slate-900">
                      {detailData.payee_name || "-"}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsDetailsOpen(false)}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>

                  <Button variant="outline" onClick={handlePrintVoucher}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Voucher
                  </Button>

                  <Button variant="outline" onClick={handleDownloadPdf}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>

                  {getStatusBadge(detailData.status)}

                  {detailData.posted_journal_id ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Posted
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Posted</Badge>
                  )}

                  <Can roles={ACTION_ROLES.POST_EXPENSE_VOUCHER}>
                    <Button
                      onClick={handlePostVoucher}
                      disabled={
                        Boolean(detailData.posted_journal_id) ||
                        String(detailData.status || "").toUpperCase() !== "DRAFT" ||
                        postMutation.isPending
                      }
                    >
                      {postMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Post Voucher
                    </Button>
                  </Can>
                </div>
              </div>

              {postMutation.isSuccess && (
                <Alert>
                  <AlertTitle>Expense voucher posted</AlertTitle>
                  <AlertDescription>
                    The posted journal reference has been refreshed.
                  </AlertDescription>
                </Alert>
              )}

              {postMutation.isError && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Failed to post voucher</AlertTitle>
    <AlertDescription>
      {getErrorMessage(
        postMutation.error,
        "Confirm voucher is still in DRAFT status, payment account has enough balance, and posting setup is valid."
      )}
    </AlertDescription>
  </Alert>
)}

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Voucher No" value={detailData.voucher_no || "-"} />
                <InfoBox
                  label="Voucher Date"
                  value={formatDate(detailData.voucher_date)}
                />
                <InfoBox label="Payee" value={detailData.payee_name || "-"} />
                <InfoBox
                  label="Payment Account"
                  value={
                    detailData.payment_account_code
                      ? `${detailData.payment_account_code} - ${detailData.payment_account_name}`
                      : detailData.payment_account_name || "-"
                  }
                />
                <InfoBox
                  label="Payment Method"
                  value={detailData.payment_method || "-"}
                />
                <InfoBox label="Reference" value={detailData.reference_no || "-"} />
                <InfoBox
                  label="Total Amount"
                  value={formatMoney(detailTotals.total_amount)}
                />
                <InfoBox
                  label="Journal ID"
                  value={detailData.posted_journal_id || "-"}
                />
                <InfoBox
                  label="Posted At"
                  value={formatDateTime(detailData.posted_at)}
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailData.created_at)}
                />
                <div className="md:col-span-4">
                  <InfoBox label="Notes" value={detailData.notes || "-"} />
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense Account</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center">
                          No expense lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <TableRow key={line.expense_voucher_line_id}>
                          <TableCell className="font-medium">
                            {line.expense_account_code
                              ? `${line.expense_account_code} - ${line.expense_account_name}`
                              : line.expense_account_name || "-"}
                          </TableCell>
                          <TableCell>{line.description || "-"}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}

                    <TableRow>
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right font-bold">
                        {formatMoney(detailTotals.total_amount)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                <Button variant="outline" onClick={handlePrintVoucher}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Voucher
                </Button>

                <Button variant="outline" onClick={handleDownloadPdf}>
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
