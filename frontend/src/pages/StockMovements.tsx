import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2, RefreshCcw, Search } from "lucide-react";

import { getStockMovements } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type StockMovementRow = {
  movement_id: string;
  movement_ts: string;
  movement_type: string;
  document_no: string | null;
  reason_code: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_username: string | null;
  created_by_name: string | null;
  created_at: string;

  movement_line_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  lot_id: string | null;
  lot_code: string | null;
  qty: string;
  unit_cost: string | null;

  from_location_id: string | null;
  from_location_code: string | null;
  from_location_name: string | null;

  to_location_id: string | null;
  to_location_code: string | null;
  to_location_name: string | null;
};

type MovementGroup = {
  movement_id: string;
  movement_ts: string;
  movement_type: string;
  document_no: string | null;
  reason_code: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_username: string | null;
  created_by_name: string | null;
  created_at: string;
  lines: StockMovementRow[];
  total_qty: number;
  total_value: number;
};

function normalizeArray(data: any, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;

  return [];
}

function formatQty(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatMoney(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function movementBadgeVariant(type: string) {
  const normalized = String(type || "").toLowerCase();

  if (
    normalized.includes("in") ||
    normalized.includes("receipt") ||
    normalized.includes("grn") ||
    normalized.includes("found")
  ) {
    return "default";
  }

  if (
    normalized.includes("out") ||
    normalized.includes("issue") ||
    normalized.includes("delivery") ||
    normalized.includes("sale") ||
    normalized.includes("loss")
  ) {
    return "destructive";
  }

  return "outline";
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
    "Stock movements failed to load. Check backend connection."
  );
}

function groupMovements(rows: StockMovementRow[]) {
  const map = new Map<string, MovementGroup>();

  for (const row of rows) {
    const key = row.movement_id;
    const qty = Number(row.qty || 0);
    const unitCost = Number(row.unit_cost || 0);
    const value = qty * unitCost;

    if (!map.has(key)) {
      map.set(key, {
        movement_id: row.movement_id,
        movement_ts: row.movement_ts,
        movement_type: row.movement_type,
        document_no: row.document_no,
        reason_code: row.reason_code,
        notes: row.notes,
        created_by: row.created_by,
        created_by_username: row.created_by_username,
        created_by_name: row.created_by_name,
        created_at: row.created_at,
        lines: [],
        total_qty: 0,
        total_value: 0,
      });
    }

    const group = map.get(key);

    if (!group) continue;

    group.lines.push(row);
    group.total_qty += qty;
    group.total_value += value;
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.movement_ts || b.created_at).getTime() -
      new Date(a.movement_ts || a.created_at).getTime()
  );
}

function movementUser(row: Pick<StockMovementRow, "created_by_name" | "created_by_username" | "created_by">) {
  return row.created_by_name || row.created_by_username || row.created_by || "System";
}

export default function StockMovements() {
  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["stock-movements"],
    queryFn: getStockMovements,
  });

  async function handleRefresh() {
    await refetch();
    setLastRefreshed(new Date());
  }

  const rows: StockMovementRow[] = normalizeArray(data, ["data", "stock_movements"]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return rows;

    return rows.filter((row) =>
      [
        row.movement_id,
        row.movement_type,
        row.document_no,
        row.reason_code,
        row.sku,
        row.product_name,
        row.lot_code,
        row.from_location_name,
        row.to_location_name,
        row.created_by_username,
        row.created_by_name,
        row.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  const groupedMovements = useMemo(() => groupMovements(filteredRows), [filteredRows]);

  const selectedMovement = useMemo(
    () => groupedMovements.find((movement) => movement.movement_id === selectedMovementId),
    [groupedMovements, selectedMovementId]
  );

  const totalMovementQty = filteredRows.reduce(
    (sum, row) => sum + Number(row.qty || 0),
    0
  );

  const totalMovementValue = filteredRows.reduce(
    (sum, row) => sum + Number(row.qty || 0) * Number(row.unit_cost || 0),
    0
  );

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Stock movements failed to load</AlertTitle>
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Movements</h1>
          <p className="mt-1 text-slate-500">
            Full inventory movement audit trail by product, lot, location, and user.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button onClick={handleRefresh} disabled={isFetching}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          {lastRefreshed && (
            <p className="text-xs text-slate-500">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Movement Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{groupedMovements.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Total Movement Qty</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatQty(totalMovementQty)} KG</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Movement Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalMovementValue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>Movement History</CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search document, product, lot, location, user, reason..."
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
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {groupedMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">
                      No stock movements found.
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedMovements.map((movement) => (
                    <TableRow
                      key={movement.movement_id}
                      className="cursor-pointer"
                      onDoubleClick={() => setSelectedMovementId(movement.movement_id)}
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(movement.movement_ts)}
                      </TableCell>

                      <TableCell>
                        <Badge variant={movementBadgeVariant(movement.movement_type)}>
                          {movement.movement_type}
                        </Badge>
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-medium">
                        {movement.document_no || "-"}
                      </TableCell>

                      <TableCell className="text-right font-semibold">
                        {movement.lines.length}
                      </TableCell>

                      <TableCell className="text-right font-semibold">
                        {formatQty(movement.total_qty)}
                      </TableCell>

                      <TableCell className="text-right font-semibold">
                        {formatMoney(movement.total_value)}
                      </TableCell>

                      <TableCell>{movement.reason_code || "-"}</TableCell>

                      <TableCell>{movementUser(movement)}</TableCell>

                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(movement.created_at)}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedMovementId(movement.movement_id)}
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

          <p className="mt-3 text-xs text-slate-500">
            Tip: double-click a movement row or use View to inspect the full stock transaction.
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedMovement)}
        onOpenChange={(open) => {
          if (!open) setSelectedMovementId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock Movement Details</DialogTitle>
          </DialogHeader>

          {selectedMovement && (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-slate-500">Movement ID</p>
                  <p className="break-all text-sm font-semibold">{selectedMovement.movement_id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Movement Date</p>
                  <p className="text-sm font-semibold">{formatDateTime(selectedMovement.movement_ts)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Movement Type</p>
                  <div className="mt-1">
                    <Badge variant={movementBadgeVariant(selectedMovement.movement_type)}>
                      {selectedMovement.movement_type}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Document No</p>
                  <p className="text-sm font-semibold">{selectedMovement.document_no || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Reason</p>
                  <p className="text-sm font-semibold">{selectedMovement.reason_code || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Created By</p>
                  <p className="text-sm font-semibold">{movementUser(selectedMovement)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Created At</p>
                  <p className="text-sm font-semibold">{formatDateTime(selectedMovement.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Total Qty</p>
                  <p className="text-sm font-semibold">{formatQty(selectedMovement.total_qty)} KG</p>
                </div>
              </div>

              {selectedMovement.notes && (
                <Alert>
                  <AlertTitle>Notes</AlertTitle>
                  <AlertDescription>{selectedMovement.notes}</AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Line Value</TableHead>
                      <TableHead>Line ID</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {selectedMovement.lines.map((line) => {
                      const lineValue = Number(line.qty || 0) * Number(line.unit_cost || 0);

                      return (
                        <TableRow key={line.movement_line_id}>
                          <TableCell>
                            <div className="font-medium">{line.product_name}</div>
                            <div className="text-xs text-slate-500">{line.sku}</div>
                          </TableCell>
                          <TableCell>{line.lot_code || "-"}</TableCell>
                          <TableCell>
                            <div>{line.from_location_name || "-"}</div>
                            <div className="text-xs text-slate-500">
                              {line.from_location_code || ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{line.to_location_name || "-"}</div>
                            <div className="text-xs text-slate-500">
                              {line.to_location_code || ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatQty(line.qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.unit_cost === null ? "-" : formatMoney(line.unit_cost)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(lineValue)}
                          </TableCell>
                          <TableCell className="max-w-[220px] break-all text-xs text-slate-500">
                            {line.movement_line_id}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
