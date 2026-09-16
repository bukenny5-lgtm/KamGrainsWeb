import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Send,
  WalletCards,
  Trash2,
} from "lucide-react";

import {
  createAccruedExpense,
  getAccruedExpenseByNo,
  getAccruedExpenses,
  getFinanceGlAccounts,
  getParties,
  getPaymentAccounts,
  payAccruedExpense,
  postAccruedExpense,
} from "@/api/client";

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

type AccruedExpenseLine = {
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

function formatMoney(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function getStatusBadge(status: unknown) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "PAID") {
    return <Badge className="bg-green-600 hover:bg-green-600">PAID</Badge>;
  }

  if (text === "POSTED") {
    return <Badge className="bg-amber-600 hover:bg-amber-600">POSTED</Badge>;
  }

  if (text === "DRAFT") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">DRAFT</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
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

function openPrintDocument(title: string, html: string) {
  const printWindow = window.open("", "_blank", "width=900,height=700");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups, then try again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page {
            size: A4;
            margin: 14mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            margin: 0;
            font-size: 12px;
          }

          .document {
            width: 100%;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #111827;
            padding-bottom: 12px;
            margin-bottom: 18px;
          }

          .business-name {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.04em;
          }

          .business-subtitle {
            font-size: 12px;
            color: #4b5563;
            margin-top: 3px;
          }

          .document-title {
            text-align: right;
          }

          .document-title h1 {
            margin: 0;
            font-size: 20px;
          }

          .status {
            display: inline-block;
            margin-top: 6px;
            padding: 4px 8px;
            border: 1px solid #111827;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
          }

          .section {
            margin-top: 14px;
          }

          .section-title {
            font-weight: 700;
            font-size: 13px;
            margin-bottom: 8px;
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 4px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px 14px;
          }

          .label {
            font-size: 10px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .value {
            font-weight: 700;
            margin-top: 2px;
            word-break: break-word;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }

          th,
          td {
            border: 1px solid #d1d5db;
            padding: 7px;
            vertical-align: top;
          }

          th {
            background: #f3f4f6;
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
          }

          .right {
            text-align: right;
          }

          .total-row td {
            font-weight: 800;
            background: #f9fafb;
          }

          .notes {
            min-height: 45px;
            border: 1px solid #d1d5db;
            padding: 8px;
            white-space: pre-wrap;
          }

          .signatures {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-top: 46px;
          }

          .signature-line {
            border-top: 1px solid #111827;
            padding-top: 6px;
            text-align: center;
            font-size: 11px;
          }

          .footer {
            margin-top: 28px;
            border-top: 1px solid #d1d5db;
            padding-top: 8px;
            font-size: 10px;
            color: #6b7280;
            display: flex;
            justify-content: space-between;
          }

          @media print {
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = function() {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export default function AccruedExpenses() {
  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [documentDate, setDocumentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState("");
  const [partyId, setPartyId] = useState("");
  const [liabilityAccountId, setLiabilityAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<AccruedExpenseLine[]>([
    {
      expense_account_id: "",
      description: "",
      amount: "",
    },
  ]);

  const [selectedDocumentNo, setSelectedDocumentNo] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [isPayOpen, setIsPayOpen] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");

  const documentsQuery = useQuery({
    queryKey: ["accrued-expenses"],
    queryFn: getAccruedExpenses,
  });

  const accountsQuery = useQuery({
    queryKey: ["finance-gl-accounts-for-accrued-expenses"],
    queryFn: getFinanceGlAccounts,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties-for-accrued-expenses"],
    queryFn: getParties,
  });

  const paymentAccountsQuery = useQuery({
    queryKey: ["payment-accounts-for-accrued-expense-payments"],
    queryFn: getPaymentAccounts,
  });

  const detailQuery = useQuery({
    queryKey: ["accrued-expense-detail", selectedDocumentNo],
    queryFn: () => getAccruedExpenseByNo(selectedDocumentNo as string),
    enabled: Boolean(selectedDocumentNo && isDetailsOpen),
  });

  const createMutation = useMutation({
    mutationFn: createAccruedExpense,
    onSuccess: async () => {
      await documentsQuery.refetch();
      resetCreateForm();
      setLastRefreshed(new Date());
    },
  });

  const postMutation = useMutation({
    mutationFn: (documentNo: string) => postAccruedExpense(documentNo),
    onSuccess: async () => {
      await documentsQuery.refetch();
      await detailQuery.refetch();
      setLastRefreshed(new Date());
    },
  });

  const payMutation = useMutation({
    mutationFn: ({
      documentNo,
      payload,
    }: {
      documentNo: string;
      payload: unknown;
    }) => payAccruedExpense(documentNo, payload),
    onSuccess: async () => {
      await documentsQuery.refetch();
      await paymentAccountsQuery.refetch();
      await detailQuery.refetch();
      setIsPayOpen(false);
      setPaymentAccountId("");
      setPaymentMethod("CASH");
      setPaymentReference("");
      setLastRefreshed(new Date());
    },
  });

  const documents: AnyRecord[] = normalizeArray(documentsQuery.data, ["data"]);
  const accounts: AnyRecord[] = normalizeArray(accountsQuery.data, ["data"]);
  const parties: AnyRecord[] = normalizeArray(partiesQuery.data, [
    "parties",
    "data",
  ]);
  const paymentAccounts: AnyRecord[] = normalizeArray(paymentAccountsQuery.data, [
    "data",
  ]);

  const expenseAccounts = accounts.filter((account) => {
    const type = String(account.account_type || "").toUpperCase();
    return account.is_active !== false && type === "EXPENSE";
  });

  const liabilityAccounts = accounts.filter((account) => {
    const type = String(account.account_type || "").toUpperCase();
    return account.is_active !== false && type === "LIABILITY";
  });

  const activePaymentAccounts = paymentAccounts.filter(
    (account) => account.is_active !== false && account.is_payment_account !== false
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return documents;

    return documents.filter((row) =>
      [
        row.document_no,
        row.document_date,
        row.due_date,
        row.party_name,
        row.liability_account_name,
        row.status,
        row.notes,
        row.posted_journal_no,
        row.paid_journal_no,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [documents, search]);

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

  const paidCount = filteredRows.filter(
    (row) => String(row.status || "").toUpperCase() === "PAID"
  ).length;

  const detailData: AnyRecord | undefined =
    detailQuery.data?.data || detailQuery.data?.accrued_expense;

  const detailLines: AnyRecord[] = detailData?.lines || [];
  const detailTotals: AnyRecord = detailData?.totals || {};

  const totalLineAmount = lines.reduce(
    (sum, line) => sum + Number(line.amount || 0),
    0
  );

  const createFormIsValid =
    documentDate &&
    liabilityAccountId &&
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.expense_account_id &&
        line.description.trim() &&
        Number(line.amount) > 0
    );

  const canPost =
    String(detailData?.status || "").toUpperCase() === "DRAFT" &&
    !detailData?.posted_journal_id;

  const canPay =
    String(detailData?.status || "").toUpperCase() === "POSTED" &&
    !detailData?.paid_journal_id;

  const payFormIsValid = Boolean(paymentAccountId && paymentMethod);

  async function handleRefresh() {
    await Promise.all([
      documentsQuery.refetch(),
      accountsQuery.refetch(),
      partiesQuery.refetch(),
      paymentAccountsQuery.refetch(),
    ]);
    setLastRefreshed(new Date());
  }

  function resetCreateForm() {
    setDocumentDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setPartyId("");
    setLiabilityAccountId("");
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
    setSelectedDocumentNo(row.document_no);
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

  function updateLine(index: number, field: keyof AccruedExpenseLine, value: string) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [field]: value } : line))
    );
  }

  function handleCreateAccruedExpense() {
    createMutation.mutate({
      document_date: documentDate,
      due_date: dueDate || null,
      party_id: partyId || null,
      liability_account_id: liabilityAccountId,
      notes: notes || null,
      lines: lines.map((line) => ({
        expense_account_id: line.expense_account_id,
        description: line.description,
        amount: Number(line.amount || 0),
      })),
    });
  }

  function handlePostAccruedExpense() {
    if (!detailData?.document_no) return;

    const confirmed = window.confirm(
      `Post accrued expense ${detailData.document_no}? This will debit expense and credit the payable account.`
    );

    if (!confirmed) return;

    postMutation.mutate(detailData.document_no);
  }

  function openPayDialog() {
    setPaymentAccountId("");
    setPaymentMethod("CASH");
    setPaymentReference("");
    payMutation.reset();
    setIsPayOpen(true);
  }

  function handlePayAccruedExpense() {
    if (!detailData?.document_no) return;

    payMutation.mutate({
      documentNo: detailData.document_no,
      payload: {
        payment_account_id: paymentAccountId,
        payment_method: paymentMethod,
        payment_reference: paymentReference || null,
      },
    });
  }

  function buildAccruedExpensePrintHtml() {
    if (!detailData) return "";

    const totalAmount = detailTotals.total_amount || 0;
    const lineRows = detailLines
      .map(
        (line) => `
          <tr>
            <td>${escapeHtml(
              line.expense_account_code
                ? `${line.expense_account_code} - ${line.expense_account_name}`
                : line.expense_account_name || "-"
            )}</td>
            <td>${escapeHtml(line.description || "-")}</td>
            <td class="right">${escapeHtml(formatMoney(line.amount))}</td>
          </tr>
        `
      )
      .join("");

    return `
      <div class="document">
        <div class="header">
          <div>
            <div class="business-name">KAM GRAINS SUPPLIES</div>
            <div class="business-subtitle">Supplies Management System</div>
            <div class="business-subtitle">Kampala, Uganda</div>
          </div>
          <div class="document-title">
            <h1>ACCRUED EXPENSE / PAYABLE</h1>
            <div class="status">${escapeHtml(detailData.status || "DRAFT")}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Document Details</div>
          <div class="grid">
            <div>
              <div class="label">Document No</div>
              <div class="value">${escapeHtml(detailData.document_no || "-")}</div>
            </div>
            <div>
              <div class="label">Document Date</div>
              <div class="value">${escapeHtml(formatDate(detailData.document_date))}</div>
            </div>
            <div>
              <div class="label">Due Date</div>
              <div class="value">${escapeHtml(formatDate(detailData.due_date))}</div>
            </div>
            <div>
              <div class="label">Party</div>
              <div class="value">${escapeHtml(detailData.party_name || "-")}</div>
            </div>
            <div>
              <div class="label">Payable Account</div>
              <div class="value">${escapeHtml(
                detailData.liability_account_code
                  ? `${detailData.liability_account_code} - ${detailData.liability_account_name}`
                  : "-"
              )}</div>
            </div>
            <div>
              <div class="label">Posted Journal</div>
              <div class="value">${escapeHtml(detailData.posted_journal_no || "-")}</div>
            </div>
            <div>
              <div class="label">Paid Journal</div>
              <div class="value">${escapeHtml(detailData.paid_journal_no || "-")}</div>
            </div>
            <div>
              <div class="label">Total Amount</div>
              <div class="value">${escapeHtml(formatMoney(totalAmount))}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Payment Details</div>
          <div class="grid">
            <div>
              <div class="label">Payment Account</div>
              <div class="value">${escapeHtml(
                detailData.payment_account_code
                  ? `${detailData.payment_account_code} - ${detailData.payment_account_name}`
                  : "-"
              )}</div>
            </div>
            <div>
              <div class="label">Payment Method</div>
              <div class="value">${escapeHtml(detailData.payment_method || "-")}</div>
            </div>
            <div>
              <div class="label">Payment Reference</div>
              <div class="value">${escapeHtml(detailData.payment_reference || "-")}</div>
            </div>
            <div>
              <div class="label">Paid At</div>
              <div class="value">${escapeHtml(formatDateTime(detailData.paid_at))}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Expense Lines</div>
          <table>
            <thead>
              <tr>
                <th>Expense Account</th>
                <th>Description</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${
                lineRows ||
                `<tr><td colspan="3" class="right">No lines available</td></tr>`
              }
              <tr class="total-row">
                <td colspan="2">Total</td>
                <td class="right">${escapeHtml(formatMoney(totalAmount))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Notes</div>
          <div class="notes">${escapeHtml(detailData.notes || "-")}</div>
        </div>

        <div class="signatures">
          <div class="signature-line">Prepared By</div>
          <div class="signature-line">Checked By</div>
          <div class="signature-line">Approved / Paid By</div>
        </div>

        <div class="footer">
          <span>Generated from KAM GRAINS SUPPLIES system</span>
          <span>Printed: ${escapeHtml(new Date().toLocaleString())}</span>
        </div>
      </div>
    `;
  }

  function handlePrintAccruedExpense() {
    if (!detailData) return;
    openPrintDocument(
      `Accrued Expense ${detailData.document_no || ""}`,
      buildAccruedExpensePrintHtml()
    );
  }

  function handleDownloadAccruedExpensePdf() {
    handlePrintAccruedExpense();
  }

  if (
    documentsQuery.isLoading ||
    accountsQuery.isLoading ||
    partiesQuery.isLoading ||
    paymentAccountsQuery.isLoading
  ) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    documentsQuery.isError ||
    accountsQuery.isError ||
    partiesQuery.isError ||
    paymentAccountsQuery.isError
  ) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Accrued expenses failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(
            documentsQuery.error ||
              accountsQuery.error ||
              partiesQuery.error ||
              paymentAccountsQuery.error
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Accrued Expenses / Expense Payables
          </h1>
          <p className="mt-1 text-slate-500">
            Record expenses incurred now and pay them later through Cash, Bank,
            or Mobile Money.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={
              documentsQuery.isFetching ||
              accountsQuery.isFetching ||
              partiesQuery.isFetching ||
              paymentAccountsQuery.isFetching
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_EXPENSE_VOUCHER}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Accrued Expense
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
              Document Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
            <p className="mt-1 text-xs text-slate-500">
              Draft: {draftCount} | Posted: {postedCount} | Paid: {paidCount}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Accrued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalAmount)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Unpaid Posted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{postedCount}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Paid Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{paidCount}</p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>Accounting flow</AlertTitle>
        <AlertDescription>
          Posting creates Dr Expense and Cr Accrued Expense Payable. Payment
          later creates Dr Accrued Expense Payable and Cr Cash/Bank/Mobile Money.
        </AlertDescription>
      </Alert>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Accrued Expense List
          </CardTitle>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search document, party, account, status, note..."
            className="max-w-xl"
          />
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Payable Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Posted Journal</TableHead>
                  <TableHead>Paid Journal</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center">
                      No accrued expenses found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.accrued_expense_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openDetails(row)}
                    >
                      <TableCell className="font-medium">
                        {row.document_no}
                      </TableCell>
                      <TableCell>{formatDate(row.document_date)}</TableCell>
                      <TableCell>{formatDate(row.due_date)}</TableCell>
                      <TableCell>{row.party_name || "-"}</TableCell>
                      <TableCell>
                        {row.liability_account_code
                          ? `${row.liability_account_code} - ${row.liability_account_name}`
                          : row.liability_account_name || "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        {Number(row.line_count || 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.total_amount)}
                      </TableCell>
                      <TableCell>{row.posted_journal_no || "-"}</TableCell>
                      <TableCell>{row.paid_journal_no || "-"}</TableCell>
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
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1150px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Accrued Expense</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Document Date</Label>
                <Input
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Due Date Optional</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Party Optional</Label>
                <Select value={partyId || "NO_PARTY"} onValueChange={(value) => setPartyId(value === "NO_PARTY" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier, staff, or leave blank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NO_PARTY">No party</SelectItem>
                    {parties.map((party) => (
                      <SelectItem key={party.party_id} value={party.party_id}>
                        {party.party_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Accrued Expense Payable Account</Label>
                <Select
                  value={liabilityAccountId}
                  onValueChange={setLiabilityAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select accrued expense/payable liability account" />
                  </SelectTrigger>
                  <SelectContent>
                    {liabilityAccounts.map((account) => (
                      <SelectItem
                        key={account.account_id}
                        value={account.account_id}
                      >
                        {account.account_code} - {account.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  This is credited when the expense is posted.
                </p>
              </div>

              <div className="space-y-2 md:col-span-4">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Example: Labour cost for cleaning batch to be paid later..."
                  className="min-h-20"
                />
              </div>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Expense Lines</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-[minmax(260px,1.1fr)_minmax(280px,1.2fr)_150px_80px] gap-3 px-1 text-sm font-medium text-slate-600">
                  <div>Expense Account</div>
                  <div>Description</div>
                  <div className="text-right">Amount</div>
                  <div></div>
                </div>

                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(260px,1.1fr)_minmax(280px,1.2fr)_150px_80px] items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
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
                        {expenseAccounts.map((account) => (
                          <SelectItem
                            key={account.account_id}
                            value={account.account_id}
                          >
                            {account.account_code} - {account.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      value={line.description}
                      onChange={(event) =>
                        updateLine(index, "description", event.target.value)
                      }
                      placeholder="Description"
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
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(index)}
                    >
                      <Trash2 className="h-4 w-4" />
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
                <AlertTitle>Failed to create accrued expense</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={resetCreateForm}>
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_EXPENSE_VOUCHER}>
                <Button
                  onClick={handleCreateAccruedExpense}
                  disabled={!createFormIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Accrued Expense"
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
            <DialogTitle>Accrued Expense Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load accrued expense</AlertTitle>
              <AlertDescription>{getErrorMessage(detailQuery.error)}</AlertDescription>
            </Alert>
          ) : !detailData ? (
            <Alert>
              <AlertTitle>No accrued expense data</AlertTitle>
              <AlertDescription>
                The selected accrued expense document could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {detailData.document_no}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {detailData.notes || "No notes"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>

                  <Button variant="outline" onClick={handlePrintAccruedExpense}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>

                  <Button variant="outline" onClick={handleDownloadAccruedExpensePdf}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>

                  {getStatusBadge(detailData.status)}

                  {detailData.posted_journal_id ? (
                    <Badge className="bg-amber-600 hover:bg-amber-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Posted
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Posted</Badge>
                  )}

                  {detailData.paid_journal_id ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <WalletCards className="mr-1 h-3 w-3" />
                      Paid
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Paid</Badge>
                  )}

                  <Can roles={ACTION_ROLES.CREATE_EXPENSE_VOUCHER}>
                    <Button
                      onClick={handlePostAccruedExpense}
                      disabled={!canPost || postMutation.isPending}
                    >
                      {postMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Post
                    </Button>
                  </Can>

                  <Can roles={ACTION_ROLES.CREATE_EXPENSE_VOUCHER}>
                    <Button
                      onClick={openPayDialog}
                      disabled={!canPay || payMutation.isPending}
                    >
                      <WalletCards className="mr-2 h-4 w-4" />
                      Pay
                    </Button>
                  </Can>
                </div>
              </div>

              {postMutation.isSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Accrued expense posted</AlertTitle>
                  <AlertDescription>
                    Expense was posted to GL and payable account was credited.
                  </AlertDescription>
                </Alert>
              )}

              {postMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to post accrued expense</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(postMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {payMutation.isSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Accrued expense paid</AlertTitle>
                  <AlertDescription>
                    Payment journal was created and payment account balance was
                    updated.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Document No" value={detailData.document_no} />
                <InfoBox
                  label="Document Date"
                  value={formatDate(detailData.document_date)}
                />
                <InfoBox label="Due Date" value={formatDate(detailData.due_date)} />
                <InfoBox label="Party" value={detailData.party_name || "-"} />
                <InfoBox
                  label="Payable Account"
                  value={
                    detailData.liability_account_code
                      ? `${detailData.liability_account_code} - ${detailData.liability_account_name}`
                      : "-"
                  }
                />
                <InfoBox
                  label="Total Amount"
                  value={formatMoney(detailTotals.total_amount)}
                />
                <InfoBox
                  label="Posted Journal"
                  value={detailData.posted_journal_no || "-"}
                />
                <InfoBox
                  label="Paid Journal"
                  value={detailData.paid_journal_no || "-"}
                />
                <InfoBox
                  label="Payment Account"
                  value={
                    detailData.payment_account_code
                      ? `${detailData.payment_account_code} - ${detailData.payment_account_name}`
                      : "-"
                  }
                />
                <InfoBox
                  label="Payment Method"
                  value={detailData.payment_method || "-"}
                />
                <InfoBox
                  label="Payment Reference"
                  value={detailData.payment_reference || "-"}
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailData.created_at)}
                />
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
                          No accrued expense lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <TableRow key={line.accrued_expense_line_id}>
                          <TableCell className="font-medium">
                            {line.expense_account_code} -{" "}
                            {line.expense_account_name}
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
                      <TableCell />
                      <TableCell className="text-right font-bold">
                        {formatMoney(detailTotals.total_amount)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button variant="outline" onClick={handlePrintAccruedExpense}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
                <Button variant="outline" onClick={handleDownloadAccruedExpensePdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[750px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pay Accrued Expense</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <Alert>
              <WalletCards className="h-4 w-4" />
              <AlertTitle>Payment control active</AlertTitle>
              <AlertDescription>
                The selected account must have enough available balance before
                payment can be posted.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-2">
              <InfoBox
                label="Document"
                value={detailData?.document_no || "-"}
              />
              <InfoBox
                label="Amount to Pay"
                value={formatMoney(detailTotals.total_amount)}
              />

              <div className="space-y-2 md:col-span-2">
                <Label>Payment Account</Label>
                <Select
                  value={paymentAccountId}
                  onValueChange={setPaymentAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Cash, Bank, or Mobile Money" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePaymentAccounts.map((account) => (
                      <SelectItem
                        key={account.account_id}
                        value={account.account_id}
                      >
                        {account.account_code} - {account.account_name} |{" "}
                        Available: {formatMoney(account.available_balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                <Label>Payment Reference Optional</Label>
                <Input
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Receipt, transaction ID, cheque no..."
                />
              </div>
            </div>

            {payMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to pay accrued expense</AlertTitle>
                <AlertDescription>{getErrorMessage(payMutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setIsPayOpen(false)}>
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_EXPENSE_VOUCHER}>
                <Button
                  onClick={handlePayAccruedExpense}
                  disabled={!payFormIsValid || payMutation.isPending}
                >
                  {payMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Paying...
                    </>
                  ) : (
                    "Pay Accrued Expense"
                  )}
                </Button>
              </Can>
            </div>
          </div>
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
