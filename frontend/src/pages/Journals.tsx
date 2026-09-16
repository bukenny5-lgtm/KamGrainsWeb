import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import {
  createManualJournal,
  getFinanceGlAccounts,
  getFinanceJournalByNo,
  getFinanceJournals,
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

type JournalLineInput = {
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

function getBalancedBadge(difference: unknown) {
  const diff = Number(difference || 0);

  if (Math.abs(diff) < 1) {
    return <Badge className="bg-green-600 hover:bg-green-600">Balanced</Badge>;
  }

  return <Badge variant="destructive">Difference {formatMoney(diff)}</Badge>;
}

function getErrorMessage(error: unknown) {
  const err = error as {
    response?: {
      data?: {
        message?: string;
        error?: string;
      };
    };
    message?: string;
  };

  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Action failed. Please try again."
  );
}

export default function Journals() {
  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [journalDate, setJournalDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState("");
  const [sourceModule, setSourceModule] = useState("MANUAL");
  const [lines, setLines] = useState<JournalLineInput[]>([
    {
      account_id: "",
      party_id: "",
      memo: "",
      debit: "",
      credit: "",
    },
    {
      account_id: "",
      party_id: "",
      memo: "",
      debit: "",
      credit: "",
    },
  ]);

  const [selectedJournalNo, setSelectedJournalNo] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const journalsQuery = useQuery({
    queryKey: ["journals-page-list"],
    queryFn: getFinanceJournals,
  });

  const accountsQuery = useQuery({
    queryKey: ["journals-page-gl-accounts"],
    queryFn: getFinanceGlAccounts,
  });

  const detailQuery = useQuery({
    queryKey: ["journals-page-detail", selectedJournalNo],
    queryFn: () => getFinanceJournalByNo(selectedJournalNo as string),
    enabled: Boolean(selectedJournalNo && isDetailsOpen),
  });

  const createMutation = useMutation({
    mutationFn: createManualJournal,
    onSuccess: async () => {
      await journalsQuery.refetch();
      resetCreateForm();
      setLastRefreshed(new Date());
    },
  });

  const journals: AnyRecord[] = normalizeArray(journalsQuery.data, ["data"]);
  const accounts: AnyRecord[] = normalizeArray(accountsQuery.data, ["data"]);

  const activeAccounts = accounts.filter(
    (account) => account.is_active !== false
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return journals;

    return journals.filter((row) =>
      [
        row.journal_no,
        row.journal_date,
        row.description,
        row.source_module,
        row.source_id,
        row.created_by,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [journals, search]);

  const totalDebit = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_debit || 0),
    0
  );

  const totalCredit = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_credit || 0),
    0
  );

  const createTotalDebit = lines.reduce(
    (sum, line) => sum + Number(line.debit || 0),
    0
  );

  const createTotalCredit = lines.reduce(
    (sum, line) => sum + Number(line.credit || 0),
    0
  );

  const createDifference = createTotalDebit - createTotalCredit;

  const journalDetail: AnyRecord | undefined = detailQuery.data?.data;
  const journalLines: AnyRecord[] = journalDetail?.lines || [];
  const journalTotals: AnyRecord = journalDetail?.totals || {};

  const createFormIsValid =
    Boolean(journalDate) &&
    Boolean(description.trim()) &&
    lines.length >= 2 &&
    createTotalDebit > 0 &&
    createTotalCredit > 0 &&
    Math.abs(createDifference) < 1 &&
    lines.every((line) => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      return (
        line.account_id &&
        debit >= 0 &&
        credit >= 0 &&
        !(debit > 0 && credit > 0) &&
        (debit > 0 || credit > 0)
      );
    });

  async function handleRefresh() {
    await Promise.all([journalsQuery.refetch(), accountsQuery.refetch()]);
    setLastRefreshed(new Date());
  }

  function openDetails(journalNo: string) {
    setSelectedJournalNo(journalNo);
    setIsDetailsOpen(true);
  }

  function resetCreateForm() {
    setJournalDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setSourceModule("MANUAL");
    setLines([
      {
        account_id: "",
        party_id: "",
        memo: "",
        debit: "",
        credit: "",
      },
      {
        account_id: "",
        party_id: "",
        memo: "",
        debit: "",
        credit: "",
      },
    ]);
    setIsCreateOpen(false);
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        account_id: "",
        party_id: "",
        memo: "",
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
    field: keyof JournalLineInput,
    value: string
  ) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;

        const updated = {
          ...line,
          [field]: value,
        };

        if (field === "debit" && Number(value || 0) > 0) {
          updated.credit = "";
        }

        if (field === "credit" && Number(value || 0) > 0) {
          updated.debit = "";
        }

        return updated;
      })
    );
  }

  function handleCreateJournal() {
    createMutation.mutate({
      journal_date: journalDate,
      description: description.trim(),
      source_module: sourceModule || "MANUAL",
      created_by: null,
      lines: lines.map((line) => ({
        account_id: line.account_id,
        party_id: line.party_id || null,
        memo: line.memo || null,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      })),
    });
  }

  if (journalsQuery.isLoading || accountsQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (journalsQuery.isError || accountsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Journals failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(journalsQuery.error || accountsQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Journals</h1>
          <p className="mt-1 text-slate-500">
            View GL journals and create balanced manual journal entries.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={journalsQuery.isFetching || accountsQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_JOURNAL}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Manual Journal
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
              Journal Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Debit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalDebit)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Credit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalCredit)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Difference
            </CardTitle>
          </CardHeader>
          <CardContent>{getBalancedBadge(totalDebit - totalCredit)}</CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Journal List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search journal, date, source, description..."
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
                  <TableHead>Journal No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      No journals found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.journal_id || row.journal_no}>
                      <TableCell className="font-medium">
                        {row.journal_no}
                      </TableCell>
                      <TableCell>{formatDate(row.journal_date)}</TableCell>
                      <TableCell className="max-w-80 truncate">
                        {row.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.source_module || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.total_debit)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.total_credit)}
                      </TableCell>
                      <TableCell>{getBalancedBadge(row.difference)}</TableCell>
                      <TableCell>{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(row.journal_no)}
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
            <DialogTitle>New Manual Journal</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Journal must balance</AlertTitle>
              <AlertDescription>
                Total debit must equal total credit. A line cannot have both
                debit and credit.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Journal Date</Label>
                <Input
                  type="date"
                  value={journalDate}
                  onChange={(event) => setJournalDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Source Module</Label>
                <Input
                  value={sourceModule}
                  onChange={(event) => setSourceModule(event.target.value)}
                  placeholder="MANUAL"
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Example: Owner capital introduced, correction entry, expense adjustment..."
                  className="min-h-20"
                />
              </div>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Journal Lines</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-[minmax(260px,1.1fr)_minmax(220px,1fr)_130px_130px_90px] gap-3 px-1 text-sm font-medium text-slate-600">
                  <div>GL Account</div>
                  <div>Memo</div>
                  <div className="text-right">Debit</div>
                  <div className="text-right">Credit</div>
                  <div></div>
                </div>

                {lines.map((line, index) => (
                  <div
                    key={`${index}-${line.account_id}`}
                    className="grid grid-cols-[minmax(260px,1.1fr)_minmax(220px,1fr)_130px_130px_90px] items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
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
                        {activeAccounts.map((account) => (
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
                      value={line.memo}
                      onChange={(event) =>
                        updateLine(index, "memo", event.target.value)
                      }
                      placeholder="Line memo"
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
                      Remove
                    </Button>
                  </div>
                ))}

                <div className="flex items-center justify-between border-t pt-4">
                  <Button variant="outline" onClick={addLine}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Line
                  </Button>

                  <div className="grid gap-2 text-right md:grid-cols-3">
                    <div>
                      <p className="text-xs text-slate-500">Total Debit</p>
                      <p className="font-bold">{formatMoney(createTotalDebit)}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Total Credit</p>
                      <p className="font-bold">{formatMoney(createTotalCredit)}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Difference</p>
                      <p className="font-bold">{formatMoney(createDifference)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create journal</AlertTitle>
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
                  onClick={handleCreateJournal}
                  disabled={!createFormIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Journal"
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
            <DialogTitle>Journal Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load journal</AlertTitle>
              <AlertDescription>
                {getErrorMessage(detailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !journalDetail ? (
            <Alert>
              <AlertTitle>No journal data</AlertTitle>
              <AlertDescription>
                The selected journal could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox
                  label="Journal No"
                  value={journalDetail.journal_no || "-"}
                />
                <InfoBox
                  label="Journal Date"
                  value={formatDate(journalDetail.journal_date)}
                />
                <InfoBox
                  label="Source"
                  value={journalDetail.source_module || "-"}
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(journalDetail.created_at)}
                />
                <div className="md:col-span-4">
                  <InfoBox
                    label="Description"
                    value={journalDetail.description || "-"}
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Code</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {journalLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          No journal lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      journalLines.map((line) => (
                        <TableRow key={line.journal_line_id}>
                          <TableCell>{line.account_code}</TableCell>
                          <TableCell className="font-medium">
                            {line.account_name}
                          </TableCell>
                          <TableCell>{line.account_type}</TableCell>
                          <TableCell>{line.party_name || "-"}</TableCell>
                          <TableCell>{line.memo || "-"}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(line.debit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(line.credit)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}

                    <TableRow>
                      <TableCell className="font-bold">Totals</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right font-bold">
                        {formatMoney(journalTotals.total_debit)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatMoney(journalTotals.total_credit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between border-t pt-4">
                {getBalancedBadge(journalTotals.difference)}
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
