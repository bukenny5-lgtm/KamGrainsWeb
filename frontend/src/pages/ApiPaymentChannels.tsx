import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Cable,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { getApiPaymentChannels, updateApiPaymentChannel } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    "Failed to load API payment channels."
  );
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatBool(value: unknown) {
  return value ? "Yes" : "No";
}

function safeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function channelName(row: AnyRecord) {
  return safeText(row.channel_name || row.channel_code || row.channel_type);
}

function getStatusBadge(row: AnyRecord) {
  const status = String(row.status || "").toUpperCase();
  const apiEnabled = Boolean(row.api_enabled);

  if (apiEnabled) {
    return (
      <Badge className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        API Enabled
      </Badge>
    );
  }

  if (status === "ACTIVE") {
    return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Active Manual</Badge>;
  }

  if (status === "TESTING") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Testing Only
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1">
      <XCircle className="h-3 w-3" />
      {status || "Inactive"}
    </Badge>
  );
}

export default function ApiPaymentChannels() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const manualEnable = useMutation({
    mutationFn: (row: AnyRecord) => updateApiPaymentChannel(row.api_payment_channel_id, { mode: "MANUAL", status: "ACTIVE", collection_enabled: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-payment-channels"] }),
  });

  const channelsQuery = useQuery({
    queryKey: ["api-payment-channels"],
    queryFn: getApiPaymentChannels,
  });

  const channels: AnyRecord[] = normalizeArray(channelsQuery.data, [
    "channels",
    "api_payment_channels",
    "payment_channels",
    "data",
  ]);

  const filteredChannels = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return channels;

    return channels.filter((row) =>
      Object.values(row).join(" ").toLowerCase().includes(term)
    );
  }, [channels, search]);

  const totalChannels = channels.length;
  const apiEnabledChannels = channels.filter((row) => row.api_enabled).length;
  const inactiveChannels = channels.filter(
    (row) => String(row.status || "").toUpperCase() === "INACTIVE"
  ).length;
  const testingChannels = channels.filter(
    (row) => String(row.status || "").toUpperCase() === "TESTING"
  ).length;

  if (channelsQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (channelsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>API payment channels failed to load</AlertTitle>
        <AlertDescription>{getErrorMessage(channelsQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            API Payment Channels
          </h1>
          <p className="mt-1 text-slate-500">
            Future integration register for MTN Mobile Money, Airtel Money, bank
            accounts, and payment gateways.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => channelsQuery.refetch()}
          disabled={channelsQuery.isFetching}
        >
          {channelsQuery.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Version 1 safety rule</AlertTitle>
        <AlertDescription>
          These channels are prepared for future integration only. Live API
          actions remain disabled until provider documentation, approvals,
          contracts, credentials, callback URLs, and test certification are
          obtained.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Total Channels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalChannels}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Inactive
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{inactiveChannels}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Testing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{testingChannels}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              API Enabled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{apiEnabledChannels}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <Cable className="h-5 w-5" />
            Channel Register
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search channel, provider, account, status..."
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
                  <TableHead>Channel</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Payment Account</TableHead>
                  <TableHead>GL Account</TableHead>
                  <TableHead>Account / Wallet</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Disbursement</TableHead>
                  <TableHead>Queue</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Webhook URL</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredChannels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="h-24 text-center">
                      No API payment channels found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChannels.map((row, index) => (
                    <TableRow
                      key={
                        row.api_payment_channel_id ||
                        row.channel_id ||
                        row.channel_code ||
                        index
                      }
                    >
                      <TableCell className="font-medium">
                        {channelName(row)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{safeText(row.channel_type)}</Badge>
                      </TableCell>
                      <TableCell>{safeText(row.provider_name)}</TableCell>
                      <TableCell><Badge variant="outline">{safeText(row.mode || "MANUAL")}</Badge></TableCell>
                      <TableCell>
                        {safeText(
                          row.payment_account_name || row.payment_account_code
                        )}
                      </TableCell>
                      <TableCell>
                        {safeText(row.gl_account_name || row.gl_account_code)}
                      </TableCell>
                      <TableCell>
                        {safeText(
                          row.account_number_masked ||
                            row.wallet_number_masked ||
                            row.masked_number
                        )}
                      </TableCell>
                      <TableCell>{formatBool(row.collection_enabled)}</TableCell>
                      <TableCell>{formatBool(row.disbursement_enabled)}</TableCell>
                      <TableCell>{safeText(row.total_queue_count)}</TableCell>
                      <TableCell>{safeText(row.failed_count)}</TableCell>
                      <TableCell>{getStatusBadge(row)}</TableCell>
                      <TableCell className="max-w-[260px] truncate">
                        {safeText(row.webhook_url)}
                      </TableCell>
                      <TableCell>{formatDateTime(row.created_at)}</TableCell>
                      <TableCell><Button size="sm" variant="outline" disabled={manualEnable.isPending || String(row.status).toUpperCase() === "ACTIVE"} onClick={() => manualEnable.mutate(row)}>Enable Manual</Button></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
