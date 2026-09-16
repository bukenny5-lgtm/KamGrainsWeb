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
  createStockAdjustment,
  deleteStockAdjustment,
  getLots,
  getProducts,
  getStockAdjustmentByNo,
  getStockAdjustments,
  getStockOnHand,
  postStockAdjustment,
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

type StockAdjustmentRow = {
  damage_adjustment_id: string;
  document_no: string;
  reference_document_no?: string | null;
  movement_ts?: string;
  movement_type?: string;
  from_location_id?: string;
  from_location_code?: string;
  from_location_name?: string;
  to_location_id?: string | null;
  to_location_code?: string | null;
  to_location_name?: string | null;
  reason_code?: string;
  reason_name?: string;
  status?: string;
  notes?: string | null;
  posted_movement_id?: string | null;
  created_at?: string;
  line_count?: string;
  total_qty?: string;
  total_value?: string;
};

type StockOnHandRow = {
  product_id: string;
  sku?: string;
  product_name?: string;
  lot_id?: string;
  lot_code?: string;
  location_id?: string;
  location_code?: string;
  location_name?: string;
  qty_on_hand?: string | number;
  unit_cost?: string | number | null;
  average_unit_cost?: string | number | null;
  avg_unit_cost?: string | number | null;
  purchase_price?: string | number | null;
};

type AdjustmentLine = {
  stock_key: string;
  qty: string;
  unit_cost: string;
  target_product_id: string;
  target_lot_id: string;
};

const REASON_OPTIONS = [
  { code: "DAMAGE", label: "Damage" },
  { code: "LOSS", label: "Stock Loss" },
  { code: "COUNT_VARIANCE", label: "Count Variance" },
  { code: "FOUND_STOCK", label: "Found Stock" },
  { code: "RECEIPT_REVERSAL", label: "Goods Receipt Reversal" },
  { code: "PRODUCT_RECLASSIFICATION", label: "Product Reclassification" },
];

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

  if (text === "POSTED") {
    return <Badge className="bg-green-600 hover:bg-green-600">POSTED</Badge>;
  }

  if (text === "DRAFT") {
    return <Badge variant="secondary">DRAFT</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
}

function stockKey(row: StockOnHandRow) {
  return `${row.product_id}|${row.lot_id || ""}|${row.location_id || ""}`;
}

function getStockUnitCost(row: StockOnHandRow | undefined) {
  if (!row) return 0;

  return Number(
    row.unit_cost ||
      row.average_unit_cost ||
      row.avg_unit_cost ||
      row.purchase_price ||
      0
  );
}

function makeDefaultDocumentNo(movementType: string) {
  const suffix = String(Date.now()).slice(-6);

  if (movementType === "PRODUCT_RECLASSIFICATION") {
    return `ADJ-RCL-${suffix}`;
  }

  if (movementType === "RECEIPT_REVERSAL") {
    return `ADJ-RRV-${suffix}`;
  }

  return `ADJ-DMG-${suffix}`;
}

export default function StockAdjustments() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDocumentNo, setSelectedDocumentNo] = useState<string | null>(null);

  const [movementType, setMovementType] = useState("DAMAGE");
  const [documentNo, setDocumentNo] = useState(makeDefaultDocumentNo("DAMAGE"));
  const [movementTs, setMovementTs] = useState(new Date().toISOString().slice(0, 16));
  const [reasonCode, setReasonCode] = useState("DAMAGE");
  const [referenceDocumentNo, setReferenceDocumentNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<AdjustmentLine[]>([
    {
      stock_key: "",
      qty: "",
      unit_cost: "0",
      target_product_id: "",
      target_lot_id: "AUTO_CREATE",
    },
  ]);

  const adjustmentsQuery = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: getStockAdjustments,
  });

  const stockQuery = useQuery({
    queryKey: ["stock-adjustments-stock-on-hand"],
    queryFn: () => getStockOnHand(),
    enabled: isCreateOpen,
  });

  const productsQuery = useQuery({
    queryKey: ["stock-adjustments-products"],
    queryFn: getProducts,
    enabled: isCreateOpen,
  });

  const lotsQuery = useQuery({
    queryKey: ["stock-adjustments-lots"],
    queryFn: getLots,
    enabled: isCreateOpen,
  });

  const detailsQuery = useQuery({
    queryKey: ["stock-adjustment-details", selectedDocumentNo],
    queryFn: () => getStockAdjustmentByNo(selectedDocumentNo as string),
    enabled: Boolean(selectedDocumentNo && isDetailsOpen),
  });

  const adjustments: StockAdjustmentRow[] = normalizeArray(adjustmentsQuery.data, [
    "data",
    "adjustments",
    "rows",
  ]);

  const stockRows: StockOnHandRow[] = normalizeArray(stockQuery.data, [
    "data",
    "stock",
    "rows",
  ]).filter((row: StockOnHandRow) => Number(row.qty_on_hand || 0) > 0);

  const products: AnyRecord[] = normalizeArray(productsQuery.data, ["products", "data"])
    .filter((product: AnyRecord) => product.is_active !== false);

  const lots: AnyRecord[] = normalizeArray(lotsQuery.data, ["lots", "data"]);

  const detailHeader: AnyRecord = detailsQuery.data?.data || detailsQuery.data?.adjustment || {};
  const detailLines: AnyRecord[] = detailsQuery.data?.data?.lines || detailsQuery.data?.lines || [];
  const detailTotals: AnyRecord = detailHeader?.totals || {};

  const selectedReasonCode =
    movementType === "PRODUCT_RECLASSIFICATION" ? "PRODUCT_RECLASSIFICATION" : reasonCode;

  const firstSelectedStock = stockRows.find((row) => stockKey(row) === lines[0]?.stock_key);
  const fromLocationId = firstSelectedStock?.location_id || "";

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return adjustments;

    return adjustments.filter((row) =>
      [
        row.document_no,
        row.reference_document_no,
        row.movement_type,
        row.reason_code,
        row.reason_name,
        row.status,
        row.from_location_name,
        row.from_location_code,
        row.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [adjustments, search]);

  const totalQty = filteredRows.reduce((sum, row) => sum + Number(row.total_qty || 0), 0);
  const totalValue = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_value || 0),
    0
  );

  const createFormIsValid =
    Boolean(documentNo.trim()) &&
    Boolean(movementTs) &&
    Boolean(selectedReasonCode) &&
    Boolean(fromLocationId) &&
    lines.length > 0 &&
    lines.every((line) => {
      const selected = stockRows.find((row) => stockKey(row) === line.stock_key);
      const qty = Number(line.qty || 0);
      const unitCost = Number(line.unit_cost || 0);
      const availableQty = Number(selected?.qty_on_hand || 0);

      if (!selected || qty <= 0 || qty > availableQty || unitCost < 0) return false;
      if (selected.location_id !== fromLocationId) return false;

      if (movementType === "PRODUCT_RECLASSIFICATION") {
        return Boolean(line.target_product_id) && line.target_product_id !== selected.product_id;
      }

      return true;
    });

  const createMutation = useMutation({
    mutationFn: createStockAdjustment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      await queryClient.invalidateQueries({ queryKey: ["stock-adjustments-stock-on-hand"] });
      resetCreateForm();
      setIsCreateOpen(false);
      setLastRefreshed(new Date());
    },
  });

  const postMutation = useMutation({
    mutationFn: postStockAdjustment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });

      if (selectedDocumentNo) {
        await queryClient.invalidateQueries({
          queryKey: ["stock-adjustment-details", selectedDocumentNo],
        });
      }

      setLastRefreshed(new Date());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStockAdjustment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      setIsDetailsOpen(false);
      setSelectedDocumentNo(null);
      setLastRefreshed(new Date());
    },
  });

  async function handleRefresh() {
    await adjustmentsQuery.refetch();
    setLastRefreshed(new Date());
  }

  function resetCreateForm(nextMovementType = "DAMAGE") {
    setMovementType(nextMovementType);
    setDocumentNo(makeDefaultDocumentNo(nextMovementType));
    setMovementTs(new Date().toISOString().slice(0, 16));
    setReasonCode(
      nextMovementType === "PRODUCT_RECLASSIFICATION"
        ? "PRODUCT_RECLASSIFICATION"
        : nextMovementType === "RECEIPT_REVERSAL"
          ? "RECEIPT_REVERSAL"
          : "DAMAGE"
    );
    setReferenceDocumentNo("");
    setNotes("");
    setLines([
      {
        stock_key: "",
        qty: "",
        unit_cost: "0",
        target_product_id: "",
        target_lot_id: "AUTO_CREATE",
      },
    ]);
  }

  function handleMovementTypeChange(value: string) {
    resetCreateForm(value);
  }

  function openDetails(documentNoValue: string) {
    setSelectedDocumentNo(documentNoValue);
    setIsDetailsOpen(true);
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        stock_key: "",
        qty: "",
        unit_cost: "0",
        target_product_id: "",
        target_lot_id: "AUTO_CREATE",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function updateLine(index: number, field: keyof AdjustmentLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;

        const nextLine = { ...line, [field]: value };

        if (field === "stock_key") {
          const selected = stockRows.find((row) => stockKey(row) === value);
          nextLine.unit_cost = String(getStockUnitCost(selected));

          if (selected && nextLine.target_product_id === selected.product_id) {
            nextLine.target_product_id = "";
            nextLine.target_lot_id = "AUTO_CREATE";
          }
        }

        if (field === "target_product_id") {
          nextLine.target_lot_id = "AUTO_CREATE";
        }

        return nextLine;
      })
    );
  }

  function handleCreate() {
    if (!createFormIsValid || !fromLocationId) return;

    const payload = {
      document_no: documentNo.trim(),
      reference_document_no: referenceDocumentNo.trim() || null,
      movement_ts: movementTs ? new Date(movementTs).toISOString() : null,
      movement_type: movementType,
      from_location_id: fromLocationId,
      to_location_id: movementType === "PRODUCT_RECLASSIFICATION" ? fromLocationId : null,
      reason_code: selectedReasonCode,
      notes: notes || null,
      lines: lines.map((line) => {
        const selected = stockRows.find((row) => stockKey(row) === line.stock_key);

        return {
          product_id: selected?.product_id,
          lot_id: selected?.lot_id,
          qty: Number(line.qty || 0),
          unit_cost: Number(line.unit_cost || 0),
          target_product_id:
            movementType === "PRODUCT_RECLASSIFICATION" ? line.target_product_id : null,
          target_lot_id:
            movementType === "PRODUCT_RECLASSIFICATION" && line.target_lot_id !== "AUTO_CREATE"
              ? line.target_lot_id
              : null,
        };
      }),
    };

    createMutation.mutate(payload);
  }

  function handlePost(documentNoValue: string) {
    const confirmed = window.confirm(
      `Post stock adjustment ${documentNoValue}? This will update stock movement records and cannot be edited after posting.`
    );

    if (!confirmed) return;

    postMutation.mutate(documentNoValue);
  }

  function handleDelete(documentNoValue: string) {
    const confirmed = window.confirm(`Delete draft stock adjustment ${documentNoValue}?`);

    if (!confirmed) return;

    deleteMutation.mutate(documentNoValue);
  }

  if (adjustmentsQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (adjustmentsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Stock adjustments failed to load</AlertTitle>
        <AlertDescription>{getErrorMessage(adjustmentsQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Adjustments</h1>
          <p className="mt-1 text-slate-500">
            Record stock losses, damage, count corrections, and controlled product reclassification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleRefresh} disabled={adjustmentsQuery.isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {adjustmentsQuery.isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          <Can roles={ACTION_ROLES.CREATE_STOCK_ADJUSTMENT}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Adjustment
            </Button>
          </Can>
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-slate-500">Last refreshed: {lastRefreshed.toLocaleTimeString()}</p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Total Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatQty(totalQty)} KG</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalValue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>Stock Adjustment List</CardTitle>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search document, reference, reason, status, location..."
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-3 py-2">Document No</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Lines</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center">
                      No stock adjustments found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.damage_adjustment_id || row.document_no}
                      className="cursor-pointer border-t hover:bg-slate-50"
                      onDoubleClick={() => openDetails(row.document_no)}
                    >
                      <td className="px-3 py-2 font-medium">{row.document_no}</td>
                      <td className="px-3 py-2">{formatDateTime(row.movement_ts)}</td>
                      <td className="px-3 py-2">{row.movement_type || "-"}</td>
                      <td className="px-3 py-2">{row.reason_name || row.reason_code || "-"}</td>
                      <td className="px-3 py-2">{row.reference_document_no || "-"}</td>
                      <td className="px-3 py-2">
                        {row.from_location_code || row.from_location_name || "-"}
                      </td>
                      <td className="px-3 py-2">{getStatusBadge(row.status)}</td>
                      <td className="px-3 py-2 text-right">{formatQty(row.line_count)}</td>
                      <td className="px-3 py-2 text-right">{formatQty(row.total_qty)}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatMoney(row.total_value)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => openDetails(row.document_no)}>
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
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1200px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Stock Adjustment</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <Alert>
              <AlertTitle>Controlled posting</AlertTitle>
              <AlertDescription>
                {movementType === "RECEIPT_REVERSAL"
                  ? "Receipt reversal removes stock that was received in error before any downstream transaction occurs. The original GRN can be referenced for traceability."
                  : movementType === "PRODUCT_RECLASSIFICATION"
                    ? "Product reclassification transfers quantity from the wrong product card to the correct product card while carrying the original unit cost. The target lot may be auto-created during posting."
                    : "Stock adjustments post inventory corrections using the selected source stock and keep the existing inventory architecture intact."}
              </AlertDescription>
            </Alert>

            {stockQuery.isLoading || productsQuery.isLoading || lotsQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading stock, products, and lots...
              </div>
            ) : (
              <>
                <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Adjustment Type</Label>
                    <Select value={movementType} onValueChange={handleMovementTypeChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAMAGE">DAMAGE - Damaged or expired stock</SelectItem>
                        <SelectItem value="ADJUSTMENT">ADJUSTMENT - Stock correction</SelectItem>
                        <SelectItem value="RECEIPT_REVERSAL">RECEIPT_REVERSAL - GRN reversal</SelectItem>
                        <SelectItem value="PRODUCT_RECLASSIFICATION">
                          PRODUCT_RECLASSIFICATION - Wrong product correction
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Document No</Label>
                    <Input
                      value={documentNo}
                      onChange={(event) => setDocumentNo(event.target.value)}
                      placeholder="Example: ADJ-RCL-0001"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Adjustment Date</Label>
                    <Input
                      type="datetime-local"
                      value={movementTs}
                      onChange={(event) => setMovementTs(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Select
                      value={selectedReasonCode}
                      onValueChange={setReasonCode}
                      disabled={movementType === "PRODUCT_RECLASSIFICATION"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {REASON_OPTIONS.map((reason) => (
                          <SelectItem key={reason.code} value={reason.code}>
                            {reason.code} - {reason.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Reference Document</Label>
                    <Input
                      value={referenceDocumentNo}
                      onChange={(event) => setReferenceDocumentNo(event.target.value)}
                      placeholder="PO/GRN number or correction reference"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Source Location</Label>
                    <Input
                      value={
                        firstSelectedStock
                          ? `${firstSelectedStock.location_code || ""} ${firstSelectedStock.location_name || ""}`.trim()
                          : "Select source stock below"
                      }
                      disabled
                    />
                  </div>

                  <div className="space-y-2 md:col-span-3">
                    <Label>Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Example: Wrong product selected during GRN. Physically received Yellow Beans Clean but posted as Nambale Beans Clean."
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Adjustment Lines</h3>
                      <p className="text-sm text-slate-500">
                        Select source stock. Target fields only appear for product reclassification; receipt reversal uses source stock only.
                      </p>
                    </div>

                    <Button variant="outline" onClick={addLine}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Line
                    </Button>
                  </div>

                  {lines.map((line, index) => {
                    const selected = stockRows.find((row) => stockKey(row) === line.stock_key);
                    const availableQty = Number(selected?.qty_on_hand || 0);
                    const qty = Number(line.qty || 0);
                    const lineValue = qty * Number(line.unit_cost || 0);
                    const targetLots = lots.filter(
                      (lot) => lot.product_id === line.target_product_id
                    );

                    return (
                      <div key={index} className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm xl:grid-cols-12">
                        <div className="min-w-0 space-y-2 xl:col-span-5">
                          <Label>Source Stock</Label>
                          <Select
                            value={line.stock_key}
                            onValueChange={(value) => updateLine(index, "stock_key", value)}
                          >
                            <SelectTrigger className="w-full min-w-0">
                              <SelectValue placeholder="Select source stock" />
                            </SelectTrigger>
                            <SelectContent>
                              {stockRows.map((row) => {
                                const key = stockKey(row);
                                return (
                                  <SelectItem key={key} value={key}>
                                    {row.sku} - {row.product_name} | Lot: {row.lot_code || "NO LOT"} | Avail: {formatQty(row.qty_on_hand)}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2 xl:col-span-2">
                          <Label>Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            value={line.qty}
                            onChange={(event) => updateLine(index, "qty", event.target.value)}
                          />
                          {selected && qty > availableQty && (
                            <p className="text-xs text-red-600">Available: {formatQty(availableQty)}</p>
                          )}
                        </div>

                        <div className="space-y-2 xl:col-span-2">
                          <Label>Unit Cost</Label>
                          <Input type="number" min="0" value={line.unit_cost} disabled />
                          <p className="text-xs text-slate-500">Carried from source stock.</p>
                        </div>

                        <div className="space-y-2 xl:col-span-2">
                          <Label>Line Value</Label>
                          <Input value={formatMoney(lineValue)} disabled />
                        </div>

                        <div className="flex items-end justify-end xl:col-span-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={lines.length <= 1}
                            onClick={() => removeLine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {movementType === "PRODUCT_RECLASSIFICATION" && (
                          <>
                            <div className="min-w-0 space-y-2 xl:col-span-6">
                              <Label>Target Product Correct Product</Label>
                              <Select
                                value={line.target_product_id}
                                onValueChange={(value) => updateLine(index, "target_product_id", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select target/correct product" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products
                                    .filter((product) => product.product_id !== selected?.product_id)
                                    .map((product) => (
                                      <SelectItem key={product.product_id} value={product.product_id}>
                                        {product.sku} - {product.product_name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="min-w-0 space-y-2 xl:col-span-6">
                              <Label>Target Lot</Label>
                              <Select
                                value={line.target_lot_id || "AUTO_CREATE"}
                                onValueChange={(value) => updateLine(index, "target_lot_id", value)}
                                disabled={!line.target_product_id}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Auto-create or select target lot" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="AUTO_CREATE">
                                    Auto-create target lot during posting
                                  </SelectItem>
                                  {targetLots.map((lot) => (
                                    <SelectItem key={lot.lot_id} value={lot.lot_id}>
                                      {lot.lot_code} | {lot.product_name || lot.sku || "Target product"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {movementType === "PRODUCT_RECLASSIFICATION" ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Example correction</AlertTitle>
                <AlertDescription>
                  Source: Nambale Beans Clean, source lot, Clean Beans Store. Target: Yellow Beans Clean. Qty: 200 KG. Target lot can be auto-created when posted.
                </AlertDescription>
              </Alert>
            ) : movementType === "RECEIPT_REVERSAL" ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Example reversal</AlertTitle>
                <AlertDescription>
                  Source: GRN lot received in error. Qty: 100 KG. Reference the original GRN if available and post before any sales, production, or transfer occurs.
                </AlertDescription>
              </Alert>
            ) : null}

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create stock adjustment</AlertTitle>
                <AlertDescription>{getErrorMessage(createMutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_STOCK_ADJUSTMENT}>
                <Button onClick={handleCreate} disabled={!createFormIsValid || createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Draft"
                  )}
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1150px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock Adjustment Details</DialogTitle>
          </DialogHeader>

          {detailsQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load stock adjustment</AlertTitle>
              <AlertDescription>{getErrorMessage(detailsQuery.error)}</AlertDescription>
            </Alert>
          ) : !detailHeader?.document_no ? (
            <Alert>
              <AlertTitle>No stock adjustment data</AlertTitle>
              <AlertDescription>The selected document was not found.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{detailHeader.document_no}</h2>
                  <p className="text-sm text-slate-500">{detailHeader.notes || "-"}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(detailHeader.status)}
                  <Badge variant="outline">{detailHeader.movement_type}</Badge>

                  <Can roles={ACTION_ROLES.POST_STOCK_ADJUSTMENT}>
                    <Button
                      onClick={() => handlePost(detailHeader.document_no)}
                      disabled={
                        String(detailHeader.status || "").toUpperCase() !== "DRAFT" ||
                        Boolean(detailHeader.posted_movement_id) ||
                        postMutation.isPending
                      }
                    >
                      {postMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Post
                    </Button>
                  </Can>

                  <Can roles={ACTION_ROLES.DELETE}>
                    <Button
                      variant="outline"
                      onClick={() => handleDelete(detailHeader.document_no)}
                      disabled={
                        String(detailHeader.status || "").toUpperCase() !== "DRAFT" ||
                        deleteMutation.isPending
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Draft
                    </Button>
                  </Can>
                </div>
              </div>

              {postMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to post stock adjustment</AlertTitle>
                  <AlertDescription>{getErrorMessage(postMutation.error)}</AlertDescription>
                </Alert>
              )}

              {postMutation.isSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Posted successfully</AlertTitle>
                  <AlertDescription>Stock movement records have been created and the document is locked.</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Document No" value={detailHeader.document_no} />
                <InfoBox label="Reference" value={detailHeader.reference_document_no || "-"} />
                <InfoBox label="Date" value={formatDateTime(detailHeader.movement_ts)} />
                <InfoBox label="Status" value={detailHeader.status} />
                <InfoBox label="Type" value={detailHeader.movement_type} />
                <InfoBox label="Reason" value={detailHeader.reason_name || detailHeader.reason_code} />
                <InfoBox label="Location" value={detailHeader.from_location_name || detailHeader.from_location_code || "-"} />
                <InfoBox label="Posted Movement" value={detailHeader.posted_movement_id || "-"} />
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="px-3 py-2">Source Product</th>
                      <th className="px-3 py-2">Source Lot</th>
                      <th className="px-3 py-2">Target Product</th>
                      <th className="px-3 py-2">Target Lot</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Cost</th>
                      <th className="px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detailLines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center">
                          No adjustment lines found.
                        </td>
                      </tr>
                    ) : (
                      detailLines.map((line) => (
                        <tr key={line.damage_adjustment_line_id} className="border-t">
                          <td className="px-3 py-2 font-medium">
                            {line.sku} - {line.product_name}
                          </td>
                          <td className="px-3 py-2">{line.lot_code || "-"}</td>
                          <td className="px-3 py-2">
                            {line.target_product_name
                              ? `${line.target_sku} - ${line.target_product_name}`
                              : "-"}
                          </td>
                          <td className="px-3 py-2">{line.target_lot_code || "Auto/Not applicable"}</td>
                          <td className="px-3 py-2 text-right">{formatQty(line.qty)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(line.unit_cost)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatMoney(line.line_value)}
                          </td>
                        </tr>
                      ))
                    )}

                    <tr className="border-t bg-slate-50 font-bold">
                      <td className="px-3 py-2">Total</td>
                      <td />
                      <td />
                      <td />
                      <td className="px-3 py-2 text-right">{formatQty(detailTotals.total_qty)}</td>
                      <td />
                      <td className="px-3 py-2 text-right">{formatMoney(detailTotals.total_value)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
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
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold">{value || "-"}</p>
    </div>
  );
}
