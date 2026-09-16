import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Eye,
  FileText,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  WalletCards,
} from "lucide-react";

import {
  getBalanceSheetReport,
  getCashbookReport,
  getFinanceJournalByNo,
  getFinanceJournals,
  getProfitAndLossReport,
  getTrialBalanceReport,
} from "@/api/client";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AnyRecord = Record<string, any>;

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

  return <Badge variant="destructive">Difference: {formatMoney(diff)}</Badge>;
}

export default function Finance() {
  const [search, setSearch] = useState("");
  const [selectedJournalNo, setSelectedJournalNo] = useState<string | null>(
    null
  );
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const journalsQuery = useQuery({
    queryKey: ["finance-journals"],
    queryFn: getFinanceJournals,
  });

  const trialBalanceQuery = useQuery({
    queryKey: ["finance-trial-balance"],
    queryFn: getTrialBalanceReport,
  });

  const profitLossQuery = useQuery({
    queryKey: ["finance-profit-loss"],
    queryFn: getProfitAndLossReport,
  });

  const balanceSheetQuery = useQuery({
    queryKey: ["finance-balance-sheet"],
    queryFn: getBalanceSheetReport,
  });

  const cashbookQuery = useQuery({
    queryKey: ["finance-cashbook"],
    queryFn: getCashbookReport,
  });

  const journalDetailQuery = useQuery({
    queryKey: ["finance-journal-detail", selectedJournalNo],
    queryFn: () => getFinanceJournalByNo(selectedJournalNo as string),
    enabled: Boolean(selectedJournalNo && isJournalOpen),
  });

  const journals: AnyRecord[] = normalizeArray(journalsQuery.data, ["data"]);
  const trialBalanceRows: AnyRecord[] = normalizeArray(trialBalanceQuery.data, [
    "data",
  ]);
  const profitLossRows: AnyRecord[] = normalizeArray(profitLossQuery.data, [
    "data",
  ]);
  const balanceSheetRows: AnyRecord[] = normalizeArray(balanceSheetQuery.data, [
    "data",
  ]);
  const cashbookRows: AnyRecord[] = normalizeArray(cashbookQuery.data, ["data"]);

  const filteredJournals = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return journals;

    return journals.filter((row) =>
      [
        row.journal_no,
        row.journal_date,
        row.description,
        row.source_module,
        row.source_id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [journals, search]);

  const trialTotals = trialBalanceQuery.data?.totals || {};
  const plSummary = profitLossQuery.data?.summary || {};
  const cashSummary = cashbookQuery.data?.summary || {};

  const totalJournalDebit = filteredJournals.reduce(
    (sum, row) => sum + Number(row.total_debit || 0),
    0
  );

  const totalJournalCredit = filteredJournals.reduce(
    (sum, row) => sum + Number(row.total_credit || 0),
    0
  );

  const journalDetail = journalDetailQuery.data?.data;
  const journalLines: AnyRecord[] = journalDetail?.lines || [];

  async function handleRefresh() {
    await Promise.all([
      journalsQuery.refetch(),
      trialBalanceQuery.refetch(),
      profitLossQuery.refetch(),
      balanceSheetQuery.refetch(),
      cashbookQuery.refetch(),
    ]);

    setLastRefreshed(new Date());
  }

  function openJournal(journalNo: string) {
    setSelectedJournalNo(journalNo);
    setIsJournalOpen(true);
  }

  if (
    journalsQuery.isLoading ||
    trialBalanceQuery.isLoading ||
    profitLossQuery.isLoading ||
    balanceSheetQuery.isLoading ||
    cashbookQuery.isLoading
  ) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    journalsQuery.isError ||
    trialBalanceQuery.isError ||
    profitLossQuery.isError ||
    balanceSheetQuery.isError ||
    cashbookQuery.isError
  ) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Finance failed to load</AlertTitle>
        <AlertDescription>
          Check that the backend is running and finance routes are registered.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
          <p className="mt-1 text-slate-500">
            Review journals, trial balance, profit and loss, balance sheet, and cashbook.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={
            journalsQuery.isFetching ||
            trialBalanceQuery.isFetching ||
            profitLossQuery.isFetching ||
            balanceSheetQuery.isFetching ||
            cashbookQuery.isFetching
          }
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
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
              <FileText className="h-4 w-4" />
              Journals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredJournals.length}</p>
            <p className="mt-1 text-xs text-slate-500">
              Debits: {formatMoney(totalJournalDebit)}
            </p>
            <p className="text-xs text-slate-500">
              Credits: {formatMoney(totalJournalCredit)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
              <BookOpen className="h-4 w-4" />
              Trial Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">
              {getBalancedBadge(trialTotals.difference)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Debit: {formatMoney(trialTotals.total_debit)}
            </p>
            <p className="text-xs text-slate-500">
              Credit: {formatMoney(trialTotals.total_credit)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
              <WalletCards className="h-4 w-4" />
              Profit / Loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(plSummary.net_profit)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Income: {formatMoney(plSummary.income)}
            </p>
            <p className="text-xs text-slate-500">
              Expenses: {formatMoney(plSummary.expenses)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
              <Landmark className="h-4 w-4" />
              Cashbook
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(cashSummary.net_cash_movement)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Cash In: {formatMoney(cashSummary.cash_in)}
            </p>
            <p className="text-xs text-slate-500">
              Cash Out: {formatMoney(cashSummary.cash_out)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>GL Journals</CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search journal number, source, description..."
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
                {filteredJournals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      No journals found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJournals.map((row) => (
                    <TableRow key={row.journal_id}>
                      <TableCell className="font-medium">
                        {row.journal_no}
                      </TableCell>
                      <TableCell>{formatDate(row.journal_date)}</TableCell>
                      <TableCell className="max-w-72 truncate">
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
                          onClick={() => openJournal(row.journal_no)}
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

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportCard
          title="Trial Balance"
          rows={trialBalanceRows}
          columns={[
            "account_code",
            "account_name",
            "account_type",
            "debit",
            "credit",
            "net_balance",
          ]}
        />

        <ReportCard
          title="Profit and Loss"
          rows={profitLossRows}
          columns={[
            "account_type",
            "account_code",
            "account_name",
            "debit",
            "credit",
            "amount",
          ]}
        />

        <ReportCard
          title="Balance Sheet"
          rows={balanceSheetRows}
          columns={[
            "account_type",
            "account_code",
            "account_name",
            "debit",
            "credit",
            "amount",
          ]}
        />

        <ReportCard
          title="Cashbook"
          rows={cashbookRows}
          columns={[
            "journal_no",
            "journal_date",
            "source_module",
            "account_name",
            "cash_in",
            "cash_out",
            "net_cash_movement",
          ]}
        />
      </div>

      <Dialog open={isJournalOpen} onOpenChange={setIsJournalOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1100px] overflow-y-auto sm:!max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>Journal Details</DialogTitle>
          </DialogHeader>

          {journalDetailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : journalDetailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load journal</AlertTitle>
              <AlertDescription>Please try again.</AlertDescription>
            </Alert>
          ) : !journalDetail ? (
            <Alert>
              <AlertTitle>No journal data</AlertTitle>
              <AlertDescription>The selected journal was not found.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Journal No" value={journalDetail.journal_no} />
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
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button variant="outline" onClick={() => setIsJournalOpen(false)}>
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

function ReportCard({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: AnyRecord[];
  columns: string[];
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="max-h-[420px] overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column.replaceAll("_", " ")}</TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No data found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={index}>
                    {columns.map((column) => {
                      const value = row[column];

                      const isMoneyColumn = [
                        "debit",
                        "credit",
                        "net_balance",
                        "amount",
                        "cash_in",
                        "cash_out",
                        "net_cash_movement",
                      ].includes(column);

                      return (
                        <TableCell
                          key={column}
                          className={isMoneyColumn ? "text-right" : ""}
                        >
                          {isMoneyColumn
                            ? formatMoney(value)
                            : column.includes("date")
                            ? formatDate(value)
                            : value || "-"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
