import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  XCircle,
} from "lucide-react";

import {
  cancelReconciliation,
  confirmReconciliation,
  createReconciliation,
  getNextReconciliationNo,
  getPaymentAccounts,
  getReconciliationByNo,
  getReconciliations,
  getReconciliationSystemTransactions,
  saveReconciliationMatches,
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

type AnyRecord = Record<string, any>;

type StatementLineForm = {
  transaction_date: string;
  reference_no: string;
  description: string;
  money_in: string;
  money_out: string;
};

function normalizeArray(data: any, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;

  return [];
}

function formatMoney(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
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

function getStatusBadge(status: unknown) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "RECONCILED") {
    return <Badge className="bg-green-600 hover:bg-green-600">RECONCILED</Badge>;
  }

  if (text === "DRAFT") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">DRAFT</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
}

function makeDefaultStatementLine(): StatementLineForm {
  return {
    transaction_date: new Date().toISOString().slice(0, 10),
    reference_no: "",
    description: "",
    money_in: "",
    money_out: "",
  };
}

function systemTransactionLabel(row: AnyRecord) {
  const amount = Number(row.money_in || 0) > 0 ? row.money_in : row.money_out;
  const direction = Number(row.money_in || 0) > 0 ? "IN" : "OUT";

  return [
    row.journal_date,
    row.journal_no,
    row.source_module,
    row.memo || row.journal_description,
    `${direction}: ${formatMoney(amount)}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

export default function Reconciliations() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedReconciliationNo, setSelectedReconciliationNo] = useState<
    string | null
  >(null);

  const [reconciliationNo, setReconciliationNo] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [statementDate, setStatementDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [periodFrom, setPeriodFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [periodTo, setPeriodTo] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [openingStatementBalance, setOpeningStatementBalance] = useState("0");
  const [closingStatementBalance, setClosingStatementBalance] = useState("0");
  const [notes, setNotes] = useState("");
  const [statementLines, setStatementLines] = useState<StatementLineForm[]>([
    makeDefaultStatementLine(),
  ]);

  const [matchSelections, setMatchSelections] = useState<
    Record<string, string>
  >({});

  const reconciliationsQuery = useQuery({
    queryKey: ["reconciliations"],
    queryFn: getReconciliations,
  });

  const paymentAccountsQuery = useQuery({
    queryKey: ["payment-accounts-for-reconciliation"],
    queryFn: getPaymentAccounts,
    enabled: isCreateOpen,
  });

  const nextNoQuery = useQuery({
    queryKey: ["next-reconciliation-no", isCreateOpen],
    queryFn: getNextReconciliationNo,
    enabled: isCreateOpen,
  });

  const systemTransactionsForCreateQuery = useQuery({
    queryKey: [
      "reconciliation-system-transactions-create",
      paymentAccountId,
      periodFrom,
      periodTo,
    ],
    queryFn: () =>
      getReconciliationSystemTransactions({
        payment_account_id: paymentAccountId,
        period_from: periodFrom || undefined,
        period_to: periodTo || undefined,
      }),
    enabled: Boolean(isCreateOpen && paymentAccountId),
  });

  const detailsQuery = useQuery({
    queryKey: ["reconciliation-detail", selectedReconciliationNo],
    queryFn: () => getReconciliationByNo(selectedReconciliationNo as string),
    enabled: Boolean(selectedReconciliationNo && isDetailsOpen),
  });

  const reconciliations: AnyRecord[] = normalizeArray(reconciliationsQuery.data, [
    "data",
    "rows",
  ]);

  const paymentAccounts: AnyRecord[] = normalizeArray(paymentAccountsQuery.data, [
    "data",
    "rows",
  ]).filter((account: AnyRecord) => account.is_payment_account !== false);

  const systemTransactionsForCreate: AnyRecord[] = normalizeArray(
    systemTransactionsForCreateQuery.data,
    ["data", "rows"]
  );

  const detailData: AnyRecord = detailsQuery.data?.data || {};
  const detailStatementLines: AnyRecord[] = detailData.statement_lines || [];
  const detailSystemTransactions: AnyRecord[] =
    detailData.system_transactions || [];

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return reconciliations;

    return reconciliations.filter((row) =>
      [
        row.reconciliation_no,
        row.statement_date,
        row.payment_account_code,
        row.payment_account_name,
        row.channel_type,
        row.provider_name,
        row.status,
        row.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [reconciliations, search]);

  const createStatementMoneyIn = statementLines.reduce(
    (sum, line) => sum + Number(line.money_in || 0),
    0
  );
  const createStatementMoneyOut = statementLines.reduce(
    (sum, line) => sum + Number(line.money_out || 0),
    0
  );
  const createStatementNet = createStatementMoneyIn - createStatementMoneyOut;
  const calculatedClosingBalance =
    Number(openingStatementBalance || 0) + createStatementNet;
  const createStatementDifference =
    calculatedClosingBalance - Number(closingStatementBalance || 0);

  const createFormIsValid =
    Boolean(paymentAccountId) &&
    Boolean(statementDate) &&
    statementLines.length > 0 &&
    statementLines.every((line) => {
      const moneyIn = Number(line.money_in || 0);
      const moneyOut = Number(line.money_out || 0);

      return (
        Boolean(line.transaction_date) &&
        Boolean(line.description.trim()) &&
        moneyIn >= 0 &&
        moneyOut >= 0 &&
        ((moneyIn > 0 && moneyOut === 0) || (moneyOut > 0 && moneyIn === 0))
      );
    });

  const createMutation = useMutation({
    mutationFn: createReconciliation,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      const createdNo =
        data?.data?.reconciliation_no || data?.reconciliation_no || null;

      resetCreateForm();

      if (createdNo) {
        openDetails(createdNo);
      }

      setIsCreateOpen(false);
      setLastRefreshed(new Date());
    },
  });

  const saveMatchesMutation = useMutation({
    mutationFn: ({
      reconciliationNoValue,
      payload,
    }: {
      reconciliationNoValue: string;
      payload: AnyRecord;
    }) => saveReconciliationMatches(reconciliationNoValue, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["reconciliation-detail", selectedReconciliationNo],
      });
      await queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      setLastRefreshed(new Date());
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmReconciliation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      await queryClient.invalidateQueries({
        queryKey: ["reconciliation-detail", selectedReconciliationNo],
      });
      setLastRefreshed(new Date());
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      reconciliationNoValue,
      payload,
    }: {
      reconciliationNoValue: string;
      payload: AnyRecord;
    }) => cancelReconciliation(reconciliationNoValue, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      await queryClient.invalidateQueries({
        queryKey: ["reconciliation-detail", selectedReconciliationNo],
      });
      setLastRefreshed(new Date());
    },
  });

  async function handleRefresh() {
    await reconciliationsQuery.refetch();
    setLastRefreshed(new Date());
  }

  function resetCreateForm() {
    setReconciliationNo("");
    setPaymentAccountId("");
    setStatementDate(new Date().toISOString().slice(0, 10));
    setPeriodFrom(new Date().toISOString().slice(0, 10));
    setPeriodTo(new Date().toISOString().slice(0, 10));
    setOpeningStatementBalance("0");
    setClosingStatementBalance("0");
    setNotes("");
    setStatementLines([makeDefaultStatementLine()]);
    setMatchSelections({});
  }

  function openDetails(reconciliationNoValue: string) {
    setSelectedReconciliationNo(reconciliationNoValue);
    setIsDetailsOpen(true);
    setMatchSelections({});
  }

  function addStatementLine() {
    setStatementLines((current) => [...current, makeDefaultStatementLine()]);
  }

  function removeStatementLine(index: number) {
    setStatementLines((current) =>
      current.filter((_, lineIndex) => lineIndex !== index)
    );
  }

  function updateStatementLine(
    index: number,
    field: keyof StatementLineForm,
    value: string
  ) {
    setStatementLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;

        const nextLine = {
          ...line,
          [field]: value,
        };

        if (field === "money_in" && Number(value || 0) > 0) {
          nextLine.money_out = "";
        }

        if (field === "money_out" && Number(value || 0) > 0) {
          nextLine.money_in = "";
        }

        return nextLine;
      })
    );
  }

  function useSelectedSystemTransactionAsStatementLine(row: AnyRecord) {
    const moneyIn = Number(row.money_in || 0);
    const moneyOut = Number(row.money_out || 0);

    setStatementLines((current) => [
      ...current,
      {
        transaction_date:
          row.journal_date || new Date().toISOString().slice(0, 10),
        reference_no: row.journal_no || "",
        description:
          row.memo ||
          row.journal_description ||
          row.source_module ||
          "System transaction",
        money_in: moneyIn > 0 ? String(moneyIn) : "",
        money_out: moneyOut > 0 ? String(moneyOut) : "",
      },
    ]);
  }

  function handleCreate() {
    if (!createFormIsValid) return;

    createMutation.mutate({
      reconciliation_no:
        reconciliationNo.trim() ||
        nextNoQuery.data?.reconciliation_no ||
        undefined,
      statement_date: statementDate,
      period_from: periodFrom || null,
      period_to: periodTo || null,
      payment_account_id: paymentAccountId,
      opening_statement_balance: Number(openingStatementBalance || 0),
      closing_statement_balance: Number(closingStatementBalance || 0),
      notes: notes || null,
      statement_lines: statementLines.map((line, index) => ({
        line_no: index + 1,
        transaction_date: line.transaction_date,
        reference_no: line.reference_no || null,
        description: line.description,
        money_in: Number(line.money_in || 0),
        money_out: Number(line.money_out || 0),
      })),
    });
  }

  function handleSaveMatches() {
    if (!selectedReconciliationNo) return;

    const matches = Object.entries(matchSelections)
      .filter(([, journalLineId]) => journalLineId && journalLineId !== "NO_MATCH")
      .map(([statementLineId, journalLineId]) => {
        const statementLine = detailStatementLines.find(
          (line) => line.statement_line_id === statementLineId
        );

        return {
          statement_line_id: statementLineId,
          journal_line_id: journalLineId,
          matched_amount: Number(statementLine?.statement_signed_amount || 0),
          match_note: "Matched from reconciliation screen",
        };
      });

    saveMatchesMutation.mutate({
      reconciliationNoValue: selectedReconciliationNo,
      payload: { matches },
    });
  }

  function handleConfirm() {
    if (!selectedReconciliationNo) return;

    const confirmed = window.confirm(
      `Confirm reconciliation ${selectedReconciliationNo}? This will lock the document.`
    );

    if (!confirmed) return;

    confirmMutation.mutate(selectedReconciliationNo);
  }

  function handleCancel() {
    if (!selectedReconciliationNo) return;

    const reason = window.prompt(
      `Enter cancellation reason for ${selectedReconciliationNo}:`
    );

    if (reason === null) return;

    cancelMutation.mutate({
      reconciliationNoValue: selectedReconciliationNo,
      payload: { cancel_reason: reason || "Cancelled by user" },
    });
  }

  if (reconciliationsQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (reconciliationsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Reconciliations failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(reconciliationsQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  const detailIsDraft = String(detailData.status || "").toUpperCase() === "DRAFT";
  const detailIsReconciled =
    String(detailData.status || "").toUpperCase() === "RECONCILED";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Payment Account Reconciliation
          </h1>
          <p className="mt-1 text-slate-500">
            Compare cash, bank, and mobile money statement lines against system
            payment account transactions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={reconciliationsQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {reconciliationsQuery.isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          <Can roles={ACTION_ROLES.CREATE_RECONCILIATION}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Reconciliation
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
            <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
              <Landmark className="h-4 w-4" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {
                filteredRows.filter(
                  (row) => String(row.status || "").toUpperCase() === "DRAFT"
                ).length
              }
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Reconciled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {
                filteredRows.filter(
                  (row) =>
                    String(row.status || "").toUpperCase() === "RECONCILED"
                ).length
              }
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Difference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(
                filteredRows.reduce(
                  (sum, row) =>
                    sum + Number(row.statement_balance_difference || 0),
                  0
                )
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>Reconciliation List</CardTitle>

          <Input
            className="max-w-xl"
            placeholder="Search document, account, status, channel..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Document No</th>
                  <th className="p-3">Statement Date</th>
                  <th className="p-3">Payment Account</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Opening</th>
                  <th className="p-3 text-right">Closing</th>
                  <th className="p-3 text-right">Difference</th>
                  <th className="p-3 text-right">Matched</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center">
                      No reconciliations found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.reconciliation_id || row.reconciliation_no}
                      className="border-t hover:bg-slate-50"
                    >
                      <td className="p-3 font-medium">
                        {row.reconciliation_no}
                      </td>
                      <td className="p-3">{formatDate(row.statement_date)}</td>
                      <td className="p-3">
                        {row.payment_account_code} -{" "}
                        {row.payment_account_name}
                      </td>
                      <td className="p-3">
                        {row.channel_type || "-"}
                        {row.provider_name ? ` / ${row.provider_name}` : ""}
                      </td>
                      <td className="p-3">{getStatusBadge(row.status)}</td>
                      <td className="p-3 text-right">
                        {formatMoney(row.opening_statement_balance)}
                      </td>
                      <td className="p-3 text-right">
                        {formatMoney(row.closing_statement_balance)}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {formatMoney(row.statement_balance_difference)}
                      </td>
                      <td className="p-3 text-right">
                        {row.matched_line_count || 0}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDetails(row.reconciliation_no)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);

          if (!open) {
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1200px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Reconciliation</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <Alert>
              <AlertTitle>Controlled reconciliation</AlertTitle>
              <AlertDescription>
                Create the document from your actual cash count, bank statement,
                or mobile money statement. You can later match each statement
                line to a system transaction before confirming.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Document No</Label>
                <Input
                  value={
                    reconciliationNo ||
                    nextNoQuery.data?.reconciliation_no ||
                    ""
                  }
                  onChange={(event) => setReconciliationNo(event.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>

              <div className="space-y-2">
                <Label>Statement Date</Label>
                <Input
                  type="date"
                  value={statementDate}
                  onChange={(event) => setStatementDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Period From</Label>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(event) => setPeriodFrom(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Period To</Label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(event) => setPeriodTo(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Payment Account</Label>
                <Select
                  value={paymentAccountId}
                  onValueChange={setPaymentAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select cash, bank, or mobile money account" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((account) => (
                      <SelectItem
                        key={account.account_id}
                        value={account.account_id}
                      >
                        {account.account_code} - {account.account_name} |{" "}
                        {account.channel_type}
                        {account.provider_name
                          ? ` / ${account.provider_name}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Opening Statement Balance</Label>
                <Input
                  type="number"
                  className="text-right"
                  value={openingStatementBalance}
                  onChange={(event) =>
                    setOpeningStatementBalance(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Closing Statement Balance</Label>
                <Input
                  type="number"
                  className="text-right"
                  value={closingStatementBalance}
                  onChange={(event) =>
                    setClosingStatementBalance(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-4">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Example: End of day cash count / MTN statement / bank statement review"
                />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    Statement / Manual Lines
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {statementLines.map((line, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-12"
                    >
                      <div className="space-y-1 md:col-span-2">
                        <Label>Date</Label>
                        <Input
                          type="date"
                          value={line.transaction_date}
                          onChange={(event) =>
                            updateStatementLine(
                              index,
                              "transaction_date",
                              event.target.value
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <Label>Reference</Label>
                        <Input
                          value={line.reference_no}
                          onChange={(event) =>
                            updateStatementLine(
                              index,
                              "reference_no",
                              event.target.value
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-4">
                        <Label>Description</Label>
                        <Input
                          value={line.description}
                          onChange={(event) =>
                            updateStatementLine(
                              index,
                              "description",
                              event.target.value
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <Label>Money In</Label>
                        <Input
                          type="number"
                          className="text-right"
                          value={line.money_in}
                          onChange={(event) =>
                            updateStatementLine(
                              index,
                              "money_in",
                              event.target.value
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <Label>Money Out</Label>
                        <Input
                          type="number"
                          className="text-right"
                          value={line.money_out}
                          onChange={(event) =>
                            updateStatementLine(
                              index,
                              "money_out",
                              event.target.value
                            )
                          }
                        />
                      </div>

                      <div className="md:col-span-12">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={statementLines.length <= 1}
                          onClick={() => removeStatementLine(index)}
                        >
                          Remove Line
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button variant="outline" onClick={addStatementLine}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Statement Line
                  </Button>

                  <div className="grid gap-3 border-t pt-4 md:grid-cols-4">
                    <InfoBox label="Money In" value={formatMoney(createStatementMoneyIn)} />
                    <InfoBox label="Money Out" value={formatMoney(createStatementMoneyOut)} />
                    <InfoBox label="Net" value={formatMoney(createStatementNet)} />
                    <InfoBox
                      label="Closing Difference"
                      value={formatMoney(createStatementDifference)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    System Transactions Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!paymentAccountId ? (
                    <p className="text-sm text-slate-500">
                      Select a payment account to preview available system
                      transactions.
                    </p>
                  ) : systemTransactionsForCreateQuery.isLoading ? (
                    <div className="flex h-40 items-center justify-center">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading transactions...
                    </div>
                  ) : systemTransactionsForCreate.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No unmatched system transactions found for this account and
                      period.
                    </p>
                  ) : (
                    <div className="max-h-[480px] overflow-auto rounded-xl border">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="p-2">Date</th>
                            <th className="p-2">Journal</th>
                            <th className="p-2">Memo</th>
                            <th className="p-2 text-right">In</th>
                            <th className="p-2 text-right">Out</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {systemTransactionsForCreate.map((row) => (
                            <tr key={row.journal_line_id} className="border-t">
                              <td className="p-2">{formatDate(row.journal_date)}</td>
                              <td className="p-2">{row.journal_no}</td>
                              <td className="p-2">
                                {row.memo || row.journal_description || "-"}
                              </td>
                              <td className="p-2 text-right">
                                {formatMoney(row.money_in)}
                              </td>
                              <td className="p-2 text-right">
                                {formatMoney(row.money_out)}
                              </td>
                              <td className="p-2 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    useSelectedSystemTransactionAsStatementLine(
                                      row
                                    )
                                  }
                                >
                                  Use
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create reconciliation</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_RECONCILIATION}>
                <Button
                  onClick={handleCreate}
                  disabled={!createFormIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Create Reconciliation
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1250px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reconciliation Details</DialogTitle>
          </DialogHeader>

          {detailsQuery.isLoading ? (
            <div className="flex h-60 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load reconciliation</AlertTitle>
              <AlertDescription>
                {getErrorMessage(detailsQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailData?.reconciliation_no ? (
            <Alert>
              <AlertTitle>No reconciliation data</AlertTitle>
              <AlertDescription>
                The selected reconciliation document was not found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {detailData.reconciliation_no}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {detailData.payment_account_code} -{" "}
                    {detailData.payment_account_name} |{" "}
                    {detailData.channel_type}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(detailData.status)}

                  {detailIsReconciled && (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Locked
                    </Badge>
                  )}

                  <Can roles={ACTION_ROLES.CREATE_RECONCILIATION}>
                    <Button
                      variant="outline"
                      disabled={!detailIsDraft || saveMatchesMutation.isPending}
                      onClick={handleSaveMatches}
                    >
                      {saveMatchesMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Matches
                    </Button>
                  </Can>

                  <Can roles={ACTION_ROLES.CONFIRM_RECONCILIATION}>
                    <Button
                      disabled={!detailIsDraft || confirmMutation.isPending}
                      onClick={handleConfirm}
                    >
                      {confirmMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Confirm
                    </Button>
                  </Can>

                  <Can roles={ACTION_ROLES.CANCEL_RECONCILIATION}>
                    <Button
                      variant="destructive"
                      disabled={!detailIsDraft || cancelMutation.isPending}
                      onClick={handleCancel}
                    >
                      {cancelMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-2 h-4 w-4" />
                      )}
                      Cancel
                    </Button>
                  </Can>
                </div>
              </div>

              {(saveMatchesMutation.isError ||
                confirmMutation.isError ||
                cancelMutation.isError) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Action failed</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(
                      saveMatchesMutation.error ||
                        confirmMutation.error ||
                        cancelMutation.error
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox
                  label="Statement Date"
                  value={formatDate(detailData.statement_date)}
                />
                <InfoBox
                  label="Period"
                  value={`${formatDate(detailData.period_from)} - ${formatDate(
                    detailData.period_to
                  )}`}
                />
                <InfoBox
                  label="Opening"
                  value={formatMoney(detailData.opening_statement_balance)}
                />
                <InfoBox
                  label="Closing"
                  value={formatMoney(detailData.closing_statement_balance)}
                />
                <InfoBox
                  label="Statement Net"
                  value={formatMoney(detailData.statement_net)}
                />
                <InfoBox
                  label="Statement Difference"
                  value={formatMoney(detailData.statement_balance_difference)}
                />
                <InfoBox
                  label="Match Difference"
                  value={formatMoney(detailData.match_difference)}
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailData.created_at)}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle>Statement Lines</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[520px] overflow-auto rounded-xl border">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="p-2">Line</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">Description</th>
                            <th className="p-2 text-right">In</th>
                            <th className="p-2 text-right">Out</th>
                            <th className="p-2">Matched System Transaction</th>
                          </tr>
                        </thead>

                        <tbody>
                          {detailStatementLines.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-10 text-center">
                                No statement lines found.
                              </td>
                            </tr>
                          ) : (
                            detailStatementLines.map((line) => (
                              <tr
                                key={line.statement_line_id}
                                className="border-t"
                              >
                                <td className="p-2">{line.line_no}</td>
                                <td className="p-2">
                                  {formatDate(line.transaction_date)}
                                </td>
                                <td className="p-2">
                                  <div className="font-medium">
                                    {line.description}
                                  </div>
                                  <div className="text-slate-500">
                                    {line.reference_no || "-"}
                                  </div>
                                  {line.is_matched && (
                                    <Badge className="mt-1 bg-green-600 hover:bg-green-600">
                                      Matched
                                    </Badge>
                                  )}
                                </td>
                                <td className="p-2 text-right">
                                  {formatMoney(line.money_in)}
                                </td>
                                <td className="p-2 text-right">
                                  {formatMoney(line.money_out)}
                                </td>
                                <td className="p-2">
                                  {detailIsDraft ? (
                                    <Select
                                      value={
                                        matchSelections[
                                          line.statement_line_id
                                        ] ||
                                        line.journal_line_id ||
                                        "NO_MATCH"
                                      }
                                      onValueChange={(value) =>
                                        setMatchSelections((current) => ({
                                          ...current,
                                          [line.statement_line_id]: value,
                                        }))
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select matching system transaction" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="NO_MATCH">
                                          No match
                                        </SelectItem>
                                        {detailSystemTransactions.map((txn) => (
                                          <SelectItem
                                            key={txn.journal_line_id}
                                            value={txn.journal_line_id}
                                          >
                                            {systemTransactionLabel(txn)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span>
                                      {line.journal_no
                                        ? `${line.journal_no} - ${
                                            line.journal_line_memo || ""
                                          }`
                                        : "-"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle>System Transactions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[520px] overflow-auto rounded-xl border">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="p-2">Date</th>
                            <th className="p-2">Journal</th>
                            <th className="p-2">Memo</th>
                            <th className="p-2 text-right">In</th>
                            <th className="p-2 text-right">Out</th>
                            <th className="p-2">Status</th>
                          </tr>
                        </thead>

                        <tbody>
                          {detailSystemTransactions.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-10 text-center">
                                No available system transactions found.
                              </td>
                            </tr>
                          ) : (
                            detailSystemTransactions.map((txn) => (
                              <tr key={txn.journal_line_id} className="border-t">
                                <td className="p-2">
                                  {formatDate(txn.journal_date)}
                                </td>
                                <td className="p-2">{txn.journal_no}</td>
                                <td className="p-2">
                                  <div className="font-medium">
                                    {txn.memo ||
                                      txn.journal_description ||
                                      "-"}
                                  </div>
                                  <div className="text-slate-500">
                                    {txn.source_module || "-"}
                                  </div>
                                </td>
                                <td className="p-2 text-right">
                                  {formatMoney(txn.money_in)}
                                </td>
                                <td className="p-2 text-right">
                                  {formatMoney(txn.money_out)}
                                </td>
                                <td className="p-2">
                                  {txn.is_selected_in_this_reconciliation ? (
                                    <Badge className="bg-green-600 hover:bg-green-600">
                                      Selected
                                    </Badge>
                                  ) : txn.is_matched_elsewhere ? (
                                    <Badge variant="destructive">
                                      Matched Elsewhere
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">Available</Badge>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  Close
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
