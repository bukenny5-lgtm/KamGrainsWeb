import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";

import {
  createStockCount,
  deleteStockCount,
  getLocations,
  getStockCountByNo,
  getStockCounts,
  loadStockCountLines,
  postStockCount,
  updateStockCountLine,
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

function formatQty(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function getStatusBadge(status: unknown) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "POSTED") {
    return <Badge className="bg-green-600 hover:bg-green-600">POSTED</Badge>;
  }

  if (text === "OPEN") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">OPEN</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
}

function getVarianceBadge(value: unknown) {
  const qty = Number(value || 0);

  if (qty > 0) {
    return (
      <Badge className="bg-green-600 hover:bg-green-600">
        +{formatQty(qty)}
      </Badge>
    );
  }

  if (qty < 0) {
    return <Badge variant="destructive">{formatQty(qty)}</Badge>;
  }

  return <Badge variant="outline">0</Badge>;
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

export default function StockCount() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [countNo, setCountNo] = useState("");
  const [countDate, setCountDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");

  const [selectedCountNo, setSelectedCountNo] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("COUNT_VARIANCE");

  const stockCountsQuery = useQuery({
    queryKey: ["stock-counts"],
    queryFn: getStockCounts,
  });

  const locationsQuery = useQuery({
    queryKey: ["locations-for-stock-count"],
    queryFn: getLocations,
  });

  const detailQuery = useQuery({
    queryKey: ["stock-count-detail", selectedCountNo],
    queryFn: () => getStockCountByNo(selectedCountNo as string),
    enabled: Boolean(selectedCountNo && isDetailsOpen),
  });

  const createMutation = useMutation({
    mutationFn: createStockCount,
    onSuccess: async (response: any) => {
      await stockCountsQuery.refetch();

      const createdCountNo = response?.data?.count_no;

      resetCreateForm();

      if (createdCountNo) {
        setSelectedCountNo(createdCountNo);
        setIsDetailsOpen(true);
      }

      setLastRefreshed(new Date());
    },
  });

  const loadLinesMutation = useMutation({
    mutationFn: loadStockCountLines,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stock-count-detail", selectedCountNo],
      });
      await queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      setLastRefreshed(new Date());
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: ({
      countNoToUpdate,
      lineId,
      countedQty,
    }: {
      countNoToUpdate: string;
      lineId: string;
      countedQty: string;
    }) =>
      updateStockCountLine(countNoToUpdate, lineId, {
        counted_qty: Number(countedQty || 0),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stock-count-detail", selectedCountNo],
      });
      await queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      setLastRefreshed(new Date());
    },
  });

  const postMutation = useMutation({
    mutationFn: (countNoToPost: string) =>
      postStockCount(countNoToPost, { reason_code: reasonCode }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stock-count-detail", selectedCountNo],
      });
      await queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      setLastRefreshed(new Date());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStockCount,
    onSuccess: async () => {
      await stockCountsQuery.refetch();
      setIsDetailsOpen(false);
      setSelectedCountNo(null);
      setLastRefreshed(new Date());
    },
  });

  const stockCounts: AnyRecord[] = normalizeArray(stockCountsQuery.data, [
    "data",
  ]);

  const locations: AnyRecord[] = normalizeArray(locationsQuery.data, [
    "locations",
    "data",
  ]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return stockCounts;

    return stockCounts.filter((row) =>
      [
        row.count_no,
        row.count_date,
        row.location_code,
        row.location_name,
        row.status,
        row.notes,
        row.created_by,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [stockCounts, search]);

  const totalSystemQty = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_system_qty || 0),
    0
  );

  const totalCountedQty = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_counted_qty || 0),
    0
  );

  const totalVarianceQty = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_variance_qty || 0),
    0
  );

  const detailData: AnyRecord | undefined =
    detailQuery.data?.data || detailQuery.data?.stock_count;

  const detailLines: AnyRecord[] = detailData?.lines || [];
  const detailTotals: AnyRecord = detailData?.totals || {};

  const isOpen = String(detailData?.status || "").toUpperCase() === "OPEN";
  const isPosted = String(detailData?.status || "").toUpperCase() === "POSTED";

  const createFormIsValid = Boolean(countDate && locationId);

  async function handleRefresh() {
    await Promise.all([stockCountsQuery.refetch(), locationsQuery.refetch()]);
    setLastRefreshed(new Date());
  }

  function resetCreateForm() {
    setCountNo("");
    setCountDate(new Date().toISOString().slice(0, 10));
    setLocationId("");
    setNotes("");
    setIsCreateOpen(false);
  }

  function openDetails(row: AnyRecord) {
    setSelectedCountNo(row.count_no);
    setReasonCode("COUNT_VARIANCE");
    setIsDetailsOpen(true);
  }

  function handleCreateStockCount() {
    createMutation.mutate({
      count_no: countNo || undefined,
      count_date: countDate,
      location_id: locationId,
      notes: notes || null,
      created_by: null,
    });
  }

  function handleLoadLines() {
    if (!detailData?.count_no) return;
    loadLinesMutation.mutate(detailData.count_no);
  }

  function handlePostStockCount() {
    if (!detailData?.count_no) return;
    postMutation.mutate(detailData.count_no);
  }

  function handleDeleteStockCount() {
    if (!detailData?.count_no) return;

    const confirmed = window.confirm(
      `Delete stock count ${detailData.count_no}? This is only allowed while OPEN.`
    );

    if (!confirmed) return;

    deleteMutation.mutate(detailData.count_no);
  }

  if (stockCountsQuery.isLoading || locationsQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (stockCountsQuery.isError || locationsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Stock counts failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(stockCountsQuery.error || locationsQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Count</h1>
          <p className="mt-1 text-slate-500">
            Create physical stock counts, enter counted quantities, and post
            variances.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={stockCountsQuery.isFetching || locationsQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_STOCK_COUNT}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Stock Count
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
              Count Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              System Qty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatQty(totalSystemQty)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Counted Qty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatQty(totalCountedQty)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Variance Qty
            </CardTitle>
          </CardHeader>
          <CardContent>{getVarianceBadge(totalVarianceQty)}</CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>Stock Count List</CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search count no, location, status..."
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
                  <TableHead>Count No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">System Qty</TableHead>
                  <TableHead className="text-right">Counted Qty</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Movement ID</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center">
                      No stock counts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.stock_count_id || row.count_no}>
                      <TableCell className="font-medium">
                        {row.count_no}
                      </TableCell>
                      <TableCell>{formatDate(row.count_date)}</TableCell>
                      <TableCell>
                        {row.location_code
                          ? `${row.location_code} - ${row.location_name}`
                          : row.location_name || "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.line_count)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.total_system_qty)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.total_counted_qty)}
                      </TableCell>
                      <TableCell className="text-right">
                        {getVarianceBadge(row.total_variance_qty)}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
                        {row.posted_movement_id || "-"}
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
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[850px] overflow-y-auto sm:!max-w-[850px]">
          <DialogHeader>
            <DialogTitle>New Stock Count</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Count No Optional</Label>
                <Input
                  value={countNo}
                  onChange={(event) => setCountNo(event.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>

              <div className="space-y-2">
                <Label>Count Date</Label>
                <Input
                  type="date"
                  value={countDate}
                  onChange={(event) => setCountDate(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stock count location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem
                        key={location.location_id}
                        value={location.location_id}
                      >
                        {location.location_code
                          ? `${location.location_code} - ${location.location_name}`
                          : location.location_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional notes about this stock count..."
                  className="min-h-24"
                />
              </div>
            </div>

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create stock count</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={resetCreateForm}>
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_STOCK_COUNT}>
                <Button
                  onClick={handleCreateStockCount}
                  disabled={!createFormIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Stock Count"
                  )}
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1250px] overflow-y-auto sm:!max-w-[1250px]">
          <DialogHeader>
            <DialogTitle>Stock Count Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load stock count</AlertTitle>
              <AlertDescription>
                {getErrorMessage(detailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailData ? (
            <Alert>
              <AlertTitle>No stock count data</AlertTitle>
              <AlertDescription>
                The selected stock count could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {detailData.count_no}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Location:{" "}
                    <span className="font-medium text-slate-900">
                      {detailData.location_code
                        ? `${detailData.location_code} - ${detailData.location_name}`
                        : detailData.location_name || "-"}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(detailData.status)}

                  {detailData.posted_movement_id ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Posted
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Posted</Badge>
                  )}

                  <Can roles={ACTION_ROLES.LOAD_STOCK_COUNT_LINES}>
                    <Button
                      variant="outline"
                      onClick={handleLoadLines}
                      disabled={!isOpen || loadLinesMutation.isPending}
                    >
                      {loadLinesMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Load Lines
                    </Button>
                  </Can>

                  <Can roles={ACTION_ROLES.POST_STOCK_COUNT}>
                    <Button
                      onClick={handlePostStockCount}
                      disabled={!isOpen || postMutation.isPending}
                    >
                      {postMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Post Count
                    </Button>
                  </Can>

                  <Can roles={ACTION_ROLES.DELETE}>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteStockCount}
                      disabled={!isOpen || deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete
                    </Button>
                  </Can>
                </div>
              </div>

              {(loadLinesMutation.isError ||
                updateLineMutation.isError ||
                postMutation.isError ||
                deleteMutation.isError) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Stock count action failed</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(
                      loadLinesMutation.error ||
                        updateLineMutation.error ||
                        postMutation.error ||
                        deleteMutation.error
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {postMutation.isSuccess && (
                <Alert>
                  <AlertTitle>Stock count posted</AlertTitle>
                  <AlertDescription>
                    Variance movement has been created and the list was
                    refreshed.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Count No" value={detailData.count_no || "-"} />
                <InfoBox
                  label="Count Date"
                  value={formatDate(detailData.count_date)}
                />
                <InfoBox label="Status" value={detailData.status || "-"} />
                <InfoBox
                  label="Movement ID"
                  value={detailData.posted_movement_id || "-"}
                />
                <InfoBox
                  label="System Qty"
                  value={formatQty(detailTotals.total_system_qty)}
                />
                <InfoBox
                  label="Counted Qty"
                  value={formatQty(detailTotals.total_counted_qty)}
                />
                <InfoBox
                  label="Variance Qty"
                  value={formatQty(detailTotals.total_variance_qty)}
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailData.created_at)}
                />
                <div className="md:col-span-4">
                  <InfoBox label="Notes" value={detailData.notes || "-"} />
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="font-semibold">Count Lines</h3>
                    <p className="text-sm text-slate-500">
                      Enter counted quantity for each product/lot. Variance is
                      calculated automatically.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason Code for Posting</Label>
                    <Input
                      value={reasonCode}
                      onChange={(event) => setReasonCode(event.target.value)}
                      disabled={!isOpen}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Lot</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead className="text-right">
                          System Qty
                        </TableHead>
                        <TableHead className="text-right">
                          Counted Qty
                        </TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {detailLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center">
                            No lines loaded. Click Load Lines first.
                          </TableCell>
                        </TableRow>
                      ) : (
                        detailLines.map((line) => (
                          <StockCountLineRow
                            key={line.stock_count_line_id}
                            countNo={detailData.count_no}
                            line={line}
                            disabled={!isOpen || isPosted}
                            onSave={(countNoToUpdate, lineId, countedQty) =>
                              updateLineMutation.mutate({
                                countNoToUpdate,
                                lineId,
                                countedQty,
                              })
                            }
                            isSaving={updateLineMutation.isPending}
                          />
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
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

function StockCountLineRow({
  countNo,
  line,
  disabled,
  onSave,
  isSaving,
}: {
  countNo: string;
  line: AnyRecord;
  disabled: boolean;
  onSave: (countNo: string, lineId: string, countedQty: string) => void;
  isSaving: boolean;
}) {
  const [countedQty, setCountedQty] = useState(String(line.counted_qty ?? 0));

  const variance = Number(countedQty || 0) - Number(line.system_qty || 0);

  return (
    <TableRow>
      <TableCell className="font-medium">{line.product_name || "-"}</TableCell>
      <TableCell>{line.sku || "-"}</TableCell>
      <TableCell>{line.lot_code || "-"}</TableCell>
      <TableCell>{line.uom_code || "KG"}</TableCell>
      <TableCell className="text-right">{formatQty(line.system_qty)}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min="0"
          className="ml-auto w-32 text-right"
          value={countedQty}
          onChange={(event) => setCountedQty(event.target.value)}
          disabled={disabled}
        />
      </TableCell>
      <TableCell className="text-right">{getVarianceBadge(variance)}</TableCell>
      <TableCell className="text-right">
        <Can roles={ACTION_ROLES.UPDATE_STOCK_COUNT_LINES}>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || isSaving}
            onClick={() => onSave(countNo, line.stock_count_line_id, countedQty)}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </Can>
      </TableCell>
    </TableRow>
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
