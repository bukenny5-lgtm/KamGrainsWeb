import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Edit,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import {
  getPaymentAccounts,
  updatePaymentAccountControl,
  testPaymentAccountCanPay,
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
import { Textarea } from "@/components/ui/textarea";

type AnyRecord = Record<string, any>;

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

function getChannelBadge(channelType: string) {
  const channel = String(channelType || "").toUpperCase();

  if (channel === "CASH") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">CASH</Badge>;
  }

  if (channel === "BANK") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">BANK</Badge>;
  }

  if (channel === "MOBILE_MONEY") {
    return (
      <Badge className="bg-purple-600 hover:bg-purple-600">
        MOBILE MONEY
      </Badge>
    );
  }

  return <Badge variant="outline">{channel || "UNKNOWN"}</Badge>;
}

export default function PaymentAccounts() {
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AnyRecord | null>(
    null
  );

  const [channelType, setChannelType] = useState("");
  const [providerName, setProviderName] = useState("");
  const [accountNumberMasked, setAccountNumberMasked] = useState("");
  const [allowNegative, setAllowNegative] = useState("false");
  const [overdraftLimit, setOverdraftLimit] = useState("0");
  const [overdraftExpiryDate, setOverdraftExpiryDate] = useState("");
  const [isActive, setIsActive] = useState("true");
  const [notes, setNotes] = useState("");

  const [testAmount, setTestAmount] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["payment-accounts"],
    queryFn: getPaymentAccounts,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      accountId,
      payload,
    }: {
      accountId: string;
      payload: unknown;
    }) => updatePaymentAccountControl(accountId, payload),
    onSuccess: async () => {
      await accountsQuery.refetch();
      setLastRefreshed(new Date());
      setEditOpen(false);
      setSelectedAccount(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: ({
      accountId,
      payload,
    }: {
      accountId: string;
      payload: unknown;
    }) => testPaymentAccountCanPay(accountId, payload),
  });

  const accounts: AnyRecord[] = normalizeArray(accountsQuery.data, ["data"]);

  const totals = useMemo(() => {
    return accounts.reduce(
      (acc, row) => {
        acc.currentBalance += Number(row.current_balance || 0);
        acc.availableBalance += Number(row.available_balance || 0);

        if (String(row.channel_type).toUpperCase() === "CASH") {
          acc.cash += Number(row.current_balance || 0);
        }

        if (String(row.channel_type).toUpperCase() === "BANK") {
          acc.bank += Number(row.current_balance || 0);
        }

        if (String(row.channel_type).toUpperCase() === "MOBILE_MONEY") {
          acc.mobileMoney += Number(row.current_balance || 0);
        }

        return acc;
      },
      {
        cash: 0,
        bank: 0,
        mobileMoney: 0,
        currentBalance: 0,
        availableBalance: 0,
      }
    );
  }, [accounts]);

  async function handleRefresh() {
    await accountsQuery.refetch();
    setLastRefreshed(new Date());
  }

  function openEdit(row: AnyRecord) {
    setSelectedAccount(row);
    setChannelType(String(row.channel_type || "CASH"));
    setProviderName(String(row.provider_name || ""));
    setAccountNumberMasked(String(row.account_number_masked || ""));
    setAllowNegative(String(Boolean(row.allow_negative)));
    setOverdraftLimit(String(row.overdraft_limit || 0));
    setOverdraftExpiryDate(
      row.overdraft_expiry_date
        ? String(row.overdraft_expiry_date).slice(0, 10)
        : ""
    );
    setIsActive(String(Boolean(row.is_active)));
    setNotes(String(row.notes || ""));
    setTestAmount("");
    testMutation.reset();
    setEditOpen(true);
  }

  function handleUpdate() {
    if (!selectedAccount?.account_id) return;

    updateMutation.mutate({
      accountId: selectedAccount.account_id,
      payload: {
        channel_type: channelType,
        provider_name: providerName || null,
        account_number_masked: accountNumberMasked || null,
        allow_negative: allowNegative === "true",
        overdraft_limit: Number(overdraftLimit || 0),
        overdraft_expiry_date: overdraftExpiryDate || null,
        is_active: isActive === "true",
        notes: notes || null,
      },
    });
  }

  function handleTestPayment() {
    if (!selectedAccount?.account_id) return;

    testMutation.mutate({
      accountId: selectedAccount.account_id,
      payload: {
        amount: Number(testAmount || 0),
      },
    });
  }

  if (accountsQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (accountsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Payment accounts failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(accountsQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Payment Account Control
          </h1>
          <p className="mt-1 text-slate-500">
            Control Cash, Bank, and Mobile Money balances, overdraft rules, and
            payment availability.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={accountsQuery.isFetching}
        >
          {accountsQuery.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
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
              <Banknote className="h-4 w-4" />
              Cash Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totals.cash)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
              <WalletCards className="h-4 w-4" />
              Bank Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totals.bank)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
              <WalletCards className="h-4 w-4" />
              Mobile Money
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(totals.mobileMoney)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4" />
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(totals.availableBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Standard control rule</AlertTitle>
        <AlertDescription>
          Cash and Mobile Money should not go negative. Bank can only go
          negative when overdraft is enabled and the payment is within the
          approved overdraft limit.
        </AlertDescription>
      </Alert>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Controlled Payment Accounts</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead className="text-right">Current Balance</TableHead>
                  <TableHead className="text-right">Available Balance</TableHead>
                  <TableHead>Allow Negative</TableHead>
                  <TableHead className="text-right">Overdraft Limit</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center">
                      No payment accounts configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((row) => (
                    <TableRow key={row.account_id}>
                      <TableCell className="font-medium">
                        {row.account_code} - {row.account_name}
                      </TableCell>
                      <TableCell>{getChannelBadge(row.channel_type)}</TableCell>
                      <TableCell>{row.provider_name || "-"}</TableCell>
                      <TableCell>{row.account_number_masked || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.current_balance)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.available_balance)}
                      </TableCell>
                      <TableCell>
                        {row.allow_negative ? (
                          <Badge className="bg-amber-600 hover:bg-amber-600">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.overdraft_limit)}
                      </TableCell>
                      <TableCell>{formatDate(row.overdraft_expiry_date)}</TableCell>
                      <TableCell>
                        {row.is_active ? (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Can roles={ACTION_ROLES.CREATE_SETUP}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(row)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        </Can>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[850px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Payment Account Control</DialogTitle>
          </DialogHeader>

          {!selectedAccount ? (
            <Alert>
              <AlertTitle>No account selected</AlertTitle>
              <AlertDescription>Select an account to edit.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border bg-slate-50 p-5">
                <p className="text-sm text-slate-500">GL Account</p>
                <p className="text-lg font-semibold">
                  {selectedAccount.account_code} - {selectedAccount.account_name}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Current Balance:{" "}
                  <span className="font-semibold text-slate-900">
                    {formatMoney(selectedAccount.current_balance)}
                  </span>{" "}
                  | Available:{" "}
                  <span className="font-semibold text-slate-900">
                    {formatMoney(selectedAccount.available_balance)}
                  </span>
                </p>
              </div>

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Channel Type</Label>
                  <Select value={channelType} onValueChange={setChannelType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">CASH</SelectItem>
                      <SelectItem value="BANK">BANK</SelectItem>
                      <SelectItem value="MOBILE_MONEY">MOBILE MONEY</SelectItem>
                      <SelectItem value="CARD">CARD</SelectItem>
                      <SelectItem value="BANK_TRANSFER">BANK TRANSFER</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={isActive} onValueChange={setIsActive}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Provider Name</Label>
                  <Input
                    value={providerName}
                    onChange={(event) => setProviderName(event.target.value)}
                    placeholder="Example: Main Cash Till, Stanbic Bank, MTN MoMo"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Masked Account / Wallet Number</Label>
                  <Input
                    value={accountNumberMasked}
                    onChange={(event) =>
                      setAccountNumberMasked(event.target.value)
                    }
                    placeholder="Example: ****1234 or 077****890"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Allow Negative / Overdraft</Label>
                  <Select
                    value={allowNegative}
                    onValueChange={setAllowNegative}
                    disabled={channelType !== "BANK"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Allow negative?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">No</SelectItem>
                      <SelectItem value="true">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                  {channelType !== "BANK" && (
                    <p className="text-xs text-slate-500">
                      Only bank accounts can allow overdraft.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Overdraft Limit</Label>
                  <Input
                    type="number"
                    min="0"
                    value={overdraftLimit}
                    onChange={(event) => setOverdraftLimit(event.target.value)}
                    disabled={channelType !== "BANK" || allowNegative !== "true"}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Overdraft Expiry Date</Label>
                  <Input
                    type="date"
                    value={overdraftExpiryDate}
                    onChange={(event) =>
                      setOverdraftExpiryDate(event.target.value)
                    }
                    disabled={channelType !== "BANK" || allowNegative !== "true"}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Test Payment Amount</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={testAmount}
                      onChange={(event) => setTestAmount(event.target.value)}
                      placeholder="Example: 500000"
                    />
                    <Button
                      variant="outline"
                      onClick={handleTestPayment}
                      disabled={!testAmount || testMutation.isPending}
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Test"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Internal notes about this payment account..."
                    className="min-h-24"
                  />
                </div>
              </div>

              {testMutation.isSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Payment test passed</AlertTitle>
                  <AlertDescription>
                    This account can pay the test amount under the current
                    balance and overdraft rules.
                  </AlertDescription>
                </Alert>
              )}

              {testMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Payment test failed</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(testMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {updateMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to update payment account</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(updateMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-3 border-t pt-4">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Close
                </Button>

                <Can roles={ACTION_ROLES.CREATE_SETUP}>
                  <Button
                    onClick={handleUpdate}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
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
