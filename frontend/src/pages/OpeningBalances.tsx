import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";

import {
  createOpeningBalance,
  getFinanceGlAccounts,
  getOpeningBalanceByNo,
  getOpeningBalances,
  getParties,
  postOpeningBalance,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AnyRecord = Record<string, any>;

type OpeningBalanceLine = {
  account_id: string;
  party_id: string;
  memo: string;
  debit: string;
  credit: string;
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

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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

export default function OpeningBalances() {
  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [openingDate, setOpeningDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(
    "Opening balances for business go-live"
  );

  const [lines, setLines] = useState<OpeningBalanceLine[]>([
    {
      account_id: "",
      party_id: "",
      memo: "Opening balance",
      debit: "",
      credit: "",
    },
    {
      account_id: "",
      party_id: "",
      memo: "Opening balance balancing entry",
      debit: "",
      credit: "",
    },
  ]);

  const [selectedDocumentNo, setSelectedDocumentNo] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const openingBalancesQuery = useQuery({
    queryKey: ["opening-balances"],
    queryFn: getOpeningBalances,
  });

  const accountsQuery = useQuery({
    queryKey: ["finance-gl-accounts-for-opening-balances"],
    queryFn: getFinanceGlAccounts,
    enabled: isCreateOpen || isDetailsOpen,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties-for-opening-balances"],
    queryFn: getParties,
    enabled: isCreateOpen || isDetailsOpen,
  });

  const detailQuery = useQuery({
    queryKey: ["opening-balance-detail", selectedDocumentNo],
    queryFn: () => getOpeningBalanceByNo(selectedDocumentNo as string),
    enabled: Boolean(selectedDocumentNo && isDetailsOpen),
  });

  const createMutation = useMutation({
    mutationFn: createOpeningBalance,
    onSuccess: async () => {
      await openingBalancesQuery.refetch();
      resetCreateForm();
      setLastRefreshed(new Date());
    },
  });

  const postMutation = useMutation({
    mutationFn: (documentNo: string) => postOpeningBalance(documentNo),
    onSuccess: async () => {
      await openingBalancesQuery.refetch();
      await detailQuery.refetch();
      setLastRefreshed(new Date());
    },
  });

  const documents: AnyRecord[] = normalizeArray(openingBalancesQuery.data, [
    "data",
  ]);

  const accounts: AnyRecord[] = normalizeArray(accountsQuery.data, ["data"]);

  const parties: AnyRecord[] = normalizeArray(partiesQuery.data, [
    "parties",
    "data",
  ]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return documents;

    return documents.filter((row) =>
      [
        row.document_no,
        row.opening_date,
        row.description,
        row.status,
        row.posted_journal_no,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [documents, search]);

  const totalDebit = lines.reduce(
    (sum, line) => sum + Number(line.debit || 0),
    0
  );

  const totalCredit = lines.reduce(
    (sum, line) => sum + Number(line.credit || 0),
    0
  );

  const difference = totalDebit - totalCredit;

  const createFormIsValid =
    openingDate &&
    description.trim() &&
    lines.length >= 2 &&
    lines.every((line) => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      return (
        line.account_id &&
        debit >= 0 &&
        credit >= 0 &&
        ((debit > 0 && credit === 0) || (credit > 0 && debit === 0))
      );
    }) &&
    totalDebit > 0 &&
    totalCredit > 0 &&
    Math.round(difference * 100) === 0;

  const summary = filteredRows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.totalDebit += Number(row.total_debit || 0);
      acc.totalCredit += Number(row.total_credit || 0);

      if (String(row.status || "").toUpperCase() === "DRAFT") {
        acc.draft += 1;
      }

      if (String(row.status || "").toUpperCase() === "POSTED") {
        acc.posted += 1;
      }

      return acc;
    },
    {
      count: 0,
      draft: 0,
      posted: 0,
      totalDebit: 0,
      totalCredit: 0,
    }
  );

  const detailData: AnyRecord | undefined =
    detailQuery.data?.data || detailQuery.data?.opening_balance;

  const detailLines: AnyRecord[] = detailData?.lines || [];
  const detailTotals: AnyRecord = detailData?.totals || {};

  async function handleRefresh() {
    await openingBalancesQuery.refetch();
    setLastRefreshed(new Date());
  }

  function resetCreateForm() {
    setOpeningDate(new Date().toISOString().slice(0, 10));
    setDescription("Opening balances for business go-live");
    setLines([
      {
        account_id: "",
        party_id: "",
        memo: "Opening balance",
        debit: "",
        credit: "",
      },
      {
        account_id: "",
        party_id: "",
        memo: "Opening balance balancing entry",
        debit: "",
        credit: "",
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
        account_id: "",
        party_id: "",
        memo: "Opening balance",
        debit: "",
        credit: "",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  function updateLine(
    index: number,
    field: keyof OpeningBalanceLine,
    value: string
  ) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;

        if (field === "debit") {
          return {
            ...line,
            debit: value,
            credit: value && Number(value) > 0 ? "" : line.credit,
          };
        }

        if (field === "credit") {
          return {
            ...line,
            credit: value,
            debit: value && Number(value) > 0 ? "" : line.debit,
          };
        }

        return {
          ...line,
          [field]: value,
        };
      })
    );
  }

  function handleCreateOpeningBalance() {
    createMutation.mutate({
      opening_date: openingDate,
      description,
      lines: lines.map((line) => ({
        account_id: line.account_id,
        party_id: line.party_id || null,
        memo: line.memo || null,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      })),
    });
  }

  function handlePostOpeningBalance() {
    if (!detailData?.document_no) return;

    const confirmed = window.confirm(
      `Post opening balance ${detailData.document_no}? This will create a GL journal and lock the document.`
    );

    if (!confirmed) return;

    postMutation.mutate(detailData.document_no);
  }

  if (openingBalancesQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (openingBalancesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Opening balances failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(openingBalancesQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Opening Balances
          </h1>
          <p className="mt-1 text-slate-500">
            Capture starting balances for Cash, Bank, Mobile Money, Inventory,
            Receivables, Payables, Capital, and other GL accounts.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={openingBalancesQuery.isFetching}
          >
            {openingBalancesQuery.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_JOURNAL}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Opening Balance
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
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.count}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.draft}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Posted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.posted}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Opening Debit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(summary.totalDebit)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <FileText className="h-4 w-4" />
        <AlertTitle>Standard accounting rule</AlertTitle>
        <AlertDescription>
          Opening balances must be balanced. Total debit must equal total
          credit. Assets and expenses usually open on the debit side. Capital,
          liabilities, and payables usually open on the credit side.
        </AlertDescription>
      </Alert>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Opening Balance List
          </CardTitle>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search document, description, status, journal..."
            className="max-w-xl"
          />
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document No</TableHead>
                  <TableHead>Opening Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total Debit</TableHead>
                  <TableHead className="text-right">Total Credit</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Journal</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center">
                      No opening balance documents found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.opening_balance_id}>
                      <TableCell className="font-medium">
                        {row.document_no}
                      </TableCell>
                      <TableCell>{formatDate(row.opening_date)}</TableCell>
                      <TableCell className="max-w-64 truncate">
                        {row.description}
                      </TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(row.line_count)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.total_debit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.total_credit)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.difference)}
                      </TableCell>
                      <TableCell>{row.posted_journal_no || "-"}</TableCell>
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
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1200px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Opening Balance</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Opening Date</Label>
                <Input
                  type="date"
                  value={openingDate}
                  onChange={(event) => setOpeningDate(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Opening balances for go-live date"
                />
              </div>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Opening Balance Lines</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-[minmax(260px,1.1fr)_minmax(180px,0.7fr)_minmax(240px,1fr)_140px_140px_70px] gap-3 px-1 text-sm font-medium text-slate-600">
                  <div>Account</div>
                  <div>Party Optional</div>
                  <div>Memo</div>
                  <div className="text-right">Debit</div>
                  <div className="text-right">Credit</div>
                  <div></div>
                </div>

                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(260px,1.1fr)_minmax(180px,0.7fr)_minmax(240px,1fr)_140px_140px_70px] items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
                  >
                    <Select
                      value={line.account_id}
                      onValueChange={(value) =>
                        updateLine(index, "account_id", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem
                            key={account.account_id}
                            value={account.account_id}
                          >
                            {account.account_code} - {account.account_name} (
                            {account.account_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={line.party_id || "NO_PARTY"}
                      onValueChange={(value) =>
                        updateLine(
                          index,
                          "party_id",
                          value === "NO_PARTY" ? "" : value
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Optional party" />
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

                    <Input
                      value={line.memo}
                      onChange={(event) =>
                        updateLine(index, "memo", event.target.value)
                      }
                      placeholder="Memo"
                    />

                    <Input
                      type="number"
                      min="0"
                      className="text-right"
                      value={line.debit}
                      onChange={(event) =>
                        updateLine(index, "debit", event.target.value)
                      }
                    />

                    <Input
                      type="number"
                      min="0"
                      className="text-right"
                      value={line.credit}
                      onChange={(event) =>
                        updateLine(index, "credit", event.target.value)
                      }
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={lines.length <= 2}
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

                  <div className="grid grid-cols-3 gap-6 text-right">
                    <div>
                      <p className="text-xs text-slate-500">Total Debit</p>
                      <p className="text-lg font-bold">
                        {formatMoney(totalDebit)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Total Credit</p>
                      <p className="text-lg font-bold">
                        {formatMoney(totalCredit)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Difference</p>
                      <p
                        className={`text-lg font-bold ${
                          Math.round(difference * 100) === 0
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {formatMoney(difference)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {Math.round(difference * 100) !== 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Opening balance is not balanced</AlertTitle>
                <AlertDescription>
                  Total debit must equal total credit before saving.
                </AlertDescription>
              </Alert>
            )}

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create opening balance</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={resetCreateForm}>
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_JOURNAL}>
                <Button
                  onClick={handleCreateOpeningBalance}
                  disabled={!createFormIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Opening Balance"
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
            <DialogTitle>Opening Balance Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load opening balance</AlertTitle>
              <AlertDescription>{getErrorMessage(detailQuery.error)}</AlertDescription>
            </Alert>
          ) : !detailData ? (
            <Alert>
              <AlertTitle>No opening balance data</AlertTitle>
              <AlertDescription>
                The selected opening balance document could not be found.
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
                    {detailData.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(detailData.status)}

                  {detailData.posted_journal_id ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Posted
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Posted</Badge>
                  )}

                  <Can roles={ACTION_ROLES.CREATE_JOURNAL}>
                    <Button
                      onClick={handlePostOpeningBalance}
                      disabled={
                        String(detailData.status || "").toUpperCase() !==
                          "DRAFT" ||
                        Boolean(detailData.posted_journal_id) ||
                        postMutation.isPending
                      }
                    >
                      {postMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Post Opening Balance
                    </Button>
                  </Can>
                </div>
              </div>

              {postMutation.isSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Opening balance posted</AlertTitle>
                  <AlertDescription>
                    The opening balance journal has been created and the
                    document has been locked.
                  </AlertDescription>
                </Alert>
              )}

              {postMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to post opening balance</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(postMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Document No" value={detailData.document_no} />
                <InfoBox
                  label="Opening Date"
                  value={formatDate(detailData.opening_date)}
                />
                <InfoBox label="Status" value={detailData.status} />
                <InfoBox
                  label="Journal"
                  value={detailData.posted_journal_no || "-"}
                />
                <InfoBox
                  label="Total Debit"
                  value={formatMoney(detailTotals.total_debit)}
                />
                <InfoBox
                  label="Total Credit"
                  value={formatMoney(detailTotals.total_credit)}
                />
                <InfoBox
                  label="Difference"
                  value={formatMoney(detailTotals.difference)}
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
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          No opening balance lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <TableRow key={line.opening_balance_line_id}>
                          <TableCell className="font-medium">
                            {line.account_code} - {line.account_name}
                          </TableCell>
                          <TableCell>{line.account_type}</TableCell>
                          <TableCell>{line.party_name || "-"}</TableCell>
                          <TableCell>{line.memo || "-"}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(line.debit)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(line.credit)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}

                    <TableRow>
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right font-bold">
                        {formatMoney(detailTotals.total_debit)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatMoney(detailTotals.total_credit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
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
