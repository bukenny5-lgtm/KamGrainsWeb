import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Factory,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";

import {
  createCleaningBatch,
  deleteCleaningBatch,
  getCleaningBatchByNo,
  getCleaningBatchSummary,
  getLocations,
  getProducts,
  getStockOnHand,
  postCleaningBatch,
} from "@/api/client";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AnyRecord = Record<string, any>;

function pick(
  obj: AnyRecord | null | undefined,
  keys: string[],
  fallback: any = ""
) {
  if (!obj) return fallback;

  for (const key of keys) {
    const value = obj[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function asArray(data: any): AnyRecord[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.summary)) return data.summary;
  if (Array.isArray(data?.stock)) return data.stock;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.locations)) return data.locations;

  return [];
}

function getHeader(data: any): AnyRecord {
  if (!data) return {};
  if (data.header) return data;
  if (data.batch) return data.batch;
  if (data.cleaning_batch) return data.cleaning_batch;
  if (data.cleaningBatch) return data.cleaningBatch;
  if (data.data?.header) return data.data.header;
  if (data.data?.batch) return data.data.batch;
  if (data.data?.cleaning_batch) return data.data.cleaning_batch;
  if (data.data?.cleaningBatch) return data.data.cleaningBatch;
  if (data.data && !Array.isArray(data.data)) return data.data;

  return data;
}

function getLines(data: any): AnyRecord[] {
  if (!data) return [];

  if (Array.isArray(data.lines)) return data.lines;
  if (Array.isArray(data.batch_lines)) return data.batch_lines;
  if (Array.isArray(data.cleaning_batch_lines)) return data.cleaning_batch_lines;
  if (Array.isArray(data.cleaningBatchLines)) return data.cleaningBatchLines;

  if (Array.isArray(data.data?.lines)) return data.data.lines;
  if (Array.isArray(data.data?.batch_lines)) return data.data.batch_lines;
  if (Array.isArray(data.data?.cleaning_batch_lines)) {
    return data.data.cleaning_batch_lines;
  }
  if (Array.isArray(data.data?.cleaningBatchLines)) {
    return data.data.cleaningBatchLines;
  }

  return [];
}

function formatDate(value: any) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateTime(value: any) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: any) {
  const num = Number(value ?? 0);

  if (Number.isNaN(num)) return "-";

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: any) {
  const num = Number(value ?? 0);

  if (Number.isNaN(num)) return "-";

  return `UGX ${num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function isPostedValue(row: AnyRecord) {
  const raw = pick(
    row,
    ["is_posted", "posted", "posted_status", "isPosted"],
    false
  );

  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;

  const text = String(raw).toLowerCase();

  return text === "true" || text === "yes" || text === "posted";
}

function getStatusBadge(status: any) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "POSTED" || text === "COMPLETED") {
    return <Badge className="bg-green-600 hover:bg-green-600">{text}</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  if (text === "IN_PROGRESS") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">IN PROGRESS</Badge>;
  }

  if (text === "PLANNED" || text === "DRAFT") {
    return <Badge variant="secondary">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
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

function getProductKind(row: AnyRecord) {
  return [
    row.product_type,
    row.product_category,
    row.category,
    row.item_type,
    row.sku,
    row.product_name,
    row.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function isRawProduct(row: AnyRecord) {
  const text = getProductKind(row);

  const looksRaw =
    text.includes("RAW") ||
    text.includes("UNCLEAN") ||
    text.includes("UN CLEAN");

  const looksClean =
    text.includes("CLEAN") ||
    text.includes("CLN") ||
    text.includes("FINISHED");

  return looksRaw && !looksClean;
}

function isCleanProduct(row: AnyRecord) {
  const text = getProductKind(row);

  const looksClean =
    text.includes("CLEAN") ||
    text.includes("CLN") ||
    text.includes("FINISHED");

  const looksRaw =
    text.includes("RAW") ||
    text.includes("UNCLEAN") ||
    text.includes("UN CLEAN");

  return looksClean && !looksRaw;
}

function getLotUnitCost(row: AnyRecord | null) {
  if (!row) return 0;

  return Number(
    pick(
      row,
      [
        "unit_cost",
        "lot_unit_cost",
        "average_unit_cost",
        "avg_unit_cost",
        "purchase_price",
        "cost",
      ],
      0
    )
  );
}

export default function CleaningBatches() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedBatchNo, setSelectedBatchNo] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [selectedStockKey, setSelectedStockKey] = useState("");
  const [finishedProductId, setFinishedProductId] = useState("");
  const [inputQty, setInputQty] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [fgLocationId, setFgLocationId] = useState("");
  const [startedAt, setStartedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [outputExpiryDate, setOutputExpiryDate] = useState("");
  const [labourCost, setLabourCost] = useState("0");
  const [transportCost, setTransportCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
  const [otherCostDescription, setOtherCostDescription] = useState("");

  const batchListQuery = useQuery({
    queryKey: ["cleaning-batch-summary"],
    queryFn: async () => {
      const data = await getCleaningBatchSummary();
      setLastRefreshed(new Date());
      return data;
    },
  });

  const stockQuery = useQuery({
    queryKey: ["cleaning-stock-on-hand"],
    queryFn: () => getStockOnHand(),
    enabled: createOpen,
  });

  const productsQuery = useQuery({
    queryKey: ["cleaning-products"],
    queryFn: getProducts,
    enabled: createOpen,
  });

  const locationsQuery = useQuery({
    queryKey: ["cleaning-locations"],
    queryFn: getLocations,
    enabled: createOpen,
  });

  const batchRows = useMemo(() => {
    return asArray(batchListQuery.data);
  }, [batchListQuery.data]);

  const stockRows = useMemo(() => {
    return asArray(stockQuery.data).filter((row) => {
      const qtyOnHand = Number(row.qty_on_hand || 0);
      return qtyOnHand > 0 && isRawProduct(row);
    });
  }, [stockQuery.data]);

  const products = useMemo(() => {
    return asArray(productsQuery.data);
  }, [productsQuery.data]);

  const locations = useMemo(() => {
    return asArray(locationsQuery.data);
  }, [locationsQuery.data]);

  const finishedProducts = useMemo(() => {
    return products.filter((product) => isCleanProduct(product));
  }, [products]);

  const selectedStock = useMemo(() => {
    return (
      stockRows.find((row) => {
        const key = `${row.product_id}|${row.lot_id}|${row.location_id}`;
        return key === selectedStockKey;
      }) || null
    );
  }, [stockRows, selectedStockKey]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return batchRows;

    return batchRows.filter((row) => {
      const searchable = [
        pick(row, ["batch_no", "batchNo", "cleaning_batch_no", "document_no"]),
        pick(row, ["status", "batch_status"]),
        pick(row, ["input_product_name", "product_name", "raw_product_name"]),
        pick(row, ["output_product_name", "finished_product_name"]),
        pick(row, ["location_name", "location", "warehouse_name"]),
        pick(row, ["lot_code", "lot_no", "batch_lot_code"]),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [batchRows, search]);

  const detailsQuery = useQuery({
    queryKey: ["cleaning-batch-details", selectedBatchNo],
    queryFn: () => getCleaningBatchByNo(selectedBatchNo as string),
    enabled: Boolean(selectedBatchNo && detailsOpen),
  });

  const createMutation = useMutation({
    mutationFn: createCleaningBatch,
    onSuccess: async () => {
      resetCreateForm();
      setCreateOpen(false);

      await queryClient.invalidateQueries({
        queryKey: ["cleaning-batch-summary"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["cleaning-stock-on-hand"],
      });
      setLastRefreshed(new Date());
    },
  });

  const postMutation = useMutation({
    mutationFn: (batchNo: string) => postCleaningBatch(batchNo),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["cleaning-batch-summary"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["cleaning-batch-details", selectedBatchNo],
      });
      setLastRefreshed(new Date());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (batchNo: string) => deleteCleaningBatch(batchNo),
    onSuccess: async () => {
      setDetailsOpen(false);
      setSelectedBatchNo(null);
      await queryClient.invalidateQueries({
        queryKey: ["cleaning-batch-summary"],
      });
      setLastRefreshed(new Date());
    },
  });

  const header = getHeader(detailsQuery.data);
  const lines = getLines(detailsQuery.data);

  const detailBatchNo = String(
    pick(
      header,
      ["batch_no", "batchNo", "cleaning_batch_no", "document_no"],
      selectedBatchNo || ""
    )
  );

  const detailPosted = isPostedValue(header);

  const selectedStockQty = Number(selectedStock?.qty_on_hand || 0);
  const selectedStockUnitCost = getLotUnitCost(selectedStock);

  const inputQtyNumber = Number(inputQty || 0);
  const outputQtyNumber = Number(outputQty || 0);
  const labourCostNumber = Number(labourCost || 0);
  const transportCostNumber = Number(transportCost || 0);
  const otherCostNumber = Number(otherCost || 0);

  const extraCostTotal =
    labourCostNumber + transportCostNumber + otherCostNumber;

  const rawInputCost = inputQtyNumber * selectedStockUnitCost;
  const totalBatchCost = rawInputCost + extraCostTotal;
  const previewOutputUnitCost =
    outputQtyNumber > 0 ? totalBatchCost / outputQtyNumber : 0;

  const createFormIsValid =
    Boolean(selectedStock) &&
    Boolean(finishedProductId) &&
    Boolean(fgLocationId) &&
    inputQtyNumber > 0 &&
    outputQtyNumber > 0 &&
    outputQtyNumber <= inputQtyNumber &&
    inputQtyNumber <= selectedStockQty &&
    labourCostNumber >= 0 &&
    transportCostNumber >= 0 &&
    otherCostNumber >= 0;

  function resetCreateForm() {
    setSelectedStockKey("");
    setFinishedProductId("");
    setInputQty("");
    setOutputQty("");
    setFgLocationId("");
    setStartedAt(new Date().toISOString().slice(0, 10));
    setOutputExpiryDate("");
    setLabourCost("0");
    setTransportCost("0");
    setOtherCost("0");
    setOtherCostDescription("");
  }

  function openDetails(row: AnyRecord) {
    const batchNo = String(
      pick(row, [
        "batch_no",
        "batchNo",
        "cleaning_batch_no",
        "document_no",
        "id",
      ])
    );

    setSelectedBatchNo(batchNo);
    setDetailsOpen(true);
  }

  async function refreshList() {
    await batchListQuery.refetch();
    setLastRefreshed(new Date());
  }

  function handleCreateBatch() {
    if (!selectedStock) return;

    createMutation.mutate({
      finished_product_id: finishedProductId,
      planned_qty: outputQtyNumber,
      started_at: startedAt,
      raw_location_id: selectedStock.location_id,
      fg_location_id: fgLocationId,

      inputs: [
        {
          component_product_id: selectedStock.product_id,
          lot_id: selectedStock.lot_id,
          qty_used: inputQtyNumber,
        },
      ],

      outputs: [
        {
          qty_produced: outputQtyNumber,
          expiry_date: outputExpiryDate || null,
        },
      ],

      extra_costs: [
        {
          cost_type: "LABOUR",
          description: "Casual labour for cleaning",
          amount: labourCostNumber,
        },
        {
          cost_type: "TRANSPORT",
          description: "Transport linked to cleaning",
          amount: transportCostNumber,
        },
        {
          cost_type: "OTHER",
          description: otherCostDescription || "Other cleaning cost",
          amount: otherCostNumber,
        },
      ],
    });
  }

  function handlePostBatch() {
    if (!detailBatchNo) return;

    postMutation.mutate(detailBatchNo);
  }

  function handleDeleteBatch() {
    if (!detailBatchNo) return;

    const confirmed = window.confirm(
      `Delete cleaning batch ${detailBatchNo}? This should only be done for unposted draft batches.`
    );

    if (!confirmed) return;

    deleteMutation.mutate(detailBatchNo);
  }

  const wasteQty = Math.max(inputQtyNumber - outputQtyNumber, 0);
  const yieldPct = inputQtyNumber > 0 ? (outputQtyNumber / inputQtyNumber) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Cleaning / Processing Batches
          </h1>
          <p className="mt-1 text-slate-500">
            Track raw stock issued for cleaning, cleaned output, waste, and
            posting results.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={refreshList}
            disabled={batchListQuery.isFetching}
          >
            {batchListQuery.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.CREATE_CLEANING_BATCH}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Cleaning Batch
            </Button>
          </Can>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Factory className="h-5 w-5" />
              Cleaning Batch List
            </CardTitle>
            <p className="text-sm text-slate-500">
              Last refreshed:{" "}
              {lastRefreshed ? formatDateTime(lastRefreshed) : "-"}
            </p>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search batch, product, lot, status, location..."
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent>
          {batchListQuery.isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading cleaning batches...
            </div>
          ) : batchListQuery.isError ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Failed to load cleaning batches.{" "}
              {getErrorMessage(batchListQuery.error)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1350px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Batch No</th>
                    <th className="px-4 py-3 font-medium">Batch Date</th>
                    <th className="px-4 py-3 font-medium">Input Product</th>
                    <th className="px-4 py-3 font-medium">Input Lot</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Posted</th>
                    <th className="px-4 py-3 text-right font-medium">Input Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Output Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Waste Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Yield %</th>
                    <th className="px-4 py-3 text-right font-medium">Total Cost</th>
                    <th className="px-4 py-3 font-medium">Created At</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        No cleaning batches found.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, index) => {
                      const batchNo = pick(
                        row,
                        [
                          "batch_no",
                          "batchNo",
                          "cleaning_batch_no",
                          "document_no",
                        ],
                        "-"
                      );

                      const currentInputQty = Number(
                        pick(row, ["input_qty", "total_input_qty", "raw_qty"], 0)
                      );

                      const currentOutputQty = Number(
                        pick(
                          row,
                          ["output_qty", "cleaned_qty", "total_output_qty"],
                          0
                        )
                      );

                      const currentWasteQty = Number(
                        pick(
                          row,
                          ["waste_qty", "loss_qty", "total_waste_qty"],
                          0
                        )
                      );

                      const currentYieldPct =
                        currentInputQty > 0
                          ? (currentOutputQty / currentInputQty) * 100
                          : 0;

                      const posted = isPostedValue(row);

                      return (
                        <tr
                          key={`${batchNo}-${index}`}
                          className="cursor-pointer border-t hover:bg-slate-50"
                          onDoubleClick={() => openDetails(row)}
                        >
                          <td className="px-4 py-3 font-medium">{batchNo}</td>
                          <td className="px-4 py-3">
                            {formatDate(
                              pick(row, [
                                "batch_date",
                                "cleaning_date",
                                "created_at",
                              ])
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {pick(
                              row,
                              [
                                "input_product_name",
                                "product_name",
                                "raw_product_name",
                              ],
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {pick(
                              row,
                              ["lot_code", "lot_no", "input_lot_code"],
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {pick(
                              row,
                              ["location_name", "location", "warehouse_name"],
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(
                              pick(row, ["status", "batch_status"], "UNKNOWN")
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {posted ? (
                              <Badge className="bg-green-600 hover:bg-green-600">
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="outline">No</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatNumber(currentInputQty)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatNumber(currentOutputQty)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatNumber(currentWasteQty)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatNumber(currentYieldPct)}%
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatMoney(
                              pick(row, ["total_cost", "batch_cost", "total_value"], 0)
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {formatDateTime(
                              pick(row, ["created_at", "createdAt"])
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDetails(row)}
                              onDoubleClick={(event) => event.stopPropagation()}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[980px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Cleaning Batch</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <Alert>
              <AlertTitle>Cleaning is optional</AlertTitle>
              <AlertDescription>
                Use this only for beans that require cleaning or processing.
                Beans that are already saleable can remain in inventory and go
                directly to sales/delivery.
              </AlertDescription>
            </Alert>

            {stockQuery.isLoading ||
            productsQuery.isLoading ||
            locationsQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading stock, products, and locations...
              </div>
            ) : (
              <>
                <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Raw Stock Lot to Clean</Label>
                    <Select
                      value={selectedStockKey}
                      onValueChange={(value) => {
                        setSelectedStockKey(value);

                        const row = stockRows.find(
                          (item) =>
                            `${item.product_id}|${item.lot_id}|${item.location_id}` ===
                            value
                        );

                        if (row) {
                          setInputQty(String(Number(row.qty_on_hand || 0)));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select raw lot from stock on hand" />
                      </SelectTrigger>
                      <SelectContent>
                        {stockRows.map((row) => {
                          const key = `${row.product_id}|${row.lot_id}|${row.location_id}`;

                          return (
                            <SelectItem key={key} value={key}>
                              {row.sku} - {row.product_name} | Lot:{" "}
                              {row.lot_code} | {row.location_code} | Qty:{" "}
                              {formatNumber(row.qty_on_hand)}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    {stockRows.length === 0 && (
                      <p className="text-xs text-amber-700">
                        No RAW stock lots are available for cleaning.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Input Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      max={selectedStockQty || undefined}
                      value={inputQty}
                      onChange={(event) => setInputQty(event.target.value)}
                    />
                    {selectedStock && (
                      <p className="text-xs text-slate-500">
                        Available: {formatNumber(selectedStockQty)} | Unit Cost:{" "}
                        {formatMoney(selectedStockUnitCost)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Output / Clean Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      value={outputQty}
                      onChange={(event) => setOutputQty(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Finished Product</Label>
                    <Select
                      value={finishedProductId}
                      onValueChange={setFinishedProductId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select clean/finished product" />
                      </SelectTrigger>
                      <SelectContent>
                        {finishedProducts.map((product) => (
                          <SelectItem
                            key={product.product_id}
                            value={product.product_id}
                          >
                            {product.sku} - {product.product_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {finishedProducts.length === 0 && (
                      <p className="text-xs text-amber-700">
                        No CLEAN products found. Confirm product names/SKUs include
                        CLEAN, CLN, or FINISHED.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Finished Goods Location</Label>
                    <Select value={fgLocationId} onValueChange={setFgLocationId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select output location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem
                            key={location.location_id}
                            value={location.location_id}
                          >
                            {location.location_code} - {location.location_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Batch Date</Label>
                    <Input
                      type="date"
                      value={startedAt}
                      onChange={(event) => setStartedAt(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Output Expiry Date</Label>
                    <Input
                      type="date"
                      value={outputExpiryDate}
                      onChange={(event) =>
                        setOutputExpiryDate(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Cleaning Labour Cost</Label>
                    <Input
                      type="number"
                      min="0"
                      value={labourCost}
                      onChange={(event) => setLabourCost(event.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                      Casual labour is treated as LABOUR.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Transport Cost</Label>
                    <Input
                      type="number"
                      min="0"
                      value={transportCost}
                      onChange={(event) => setTransportCost(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Other Cost</Label>
                    <Input
                      type="number"
                      min="0"
                      value={otherCost}
                      onChange={(event) => setOtherCost(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-3">
                    <Label>Other Cost Description</Label>
                    <Input
                      value={otherCostDescription}
                      onChange={(event) =>
                        setOtherCostDescription(event.target.value)
                      }
                      placeholder="Example: packaging, handling, sorting materials"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <InfoBox label="Waste / Loss Qty" value={formatNumber(wasteQty)} />
                  <InfoBox label="Yield %" value={`${formatNumber(yieldPct)}%`} />
                  <InfoBox
                    label="Raw Location"
                    value={
                      selectedStock
                        ? `${selectedStock.location_code} - ${selectedStock.location_name}`
                        : "-"
                    }
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <InfoBox
                    label="Raw Input Cost"
                    value={formatMoney(rawInputCost)}
                  />
                  <InfoBox
                    label="Extra Cost Total"
                    value={formatMoney(extraCostTotal)}
                  />
                  <InfoBox
                    label="Total Batch Cost"
                    value={formatMoney(totalBatchCost)}
                  />
                  <InfoBox
                    label="Output Unit Cost"
                    value={formatMoney(previewOutputUnitCost)}
                  />
                </div>

                {inputQtyNumber > selectedStockQty && (
                  <Alert variant="destructive">
                    <AlertTitle>Input quantity too high</AlertTitle>
                    <AlertDescription>
                      Input quantity cannot exceed available stock on hand.
                    </AlertDescription>
                  </Alert>
                )}

                {outputQtyNumber > inputQtyNumber && (
                  <Alert variant="destructive">
                    <AlertTitle>Output quantity too high</AlertTitle>
                    <AlertDescription>
                      Output quantity cannot exceed input quantity for this
                      cleaning batch.
                    </AlertDescription>
                  </Alert>
                )}

                {(labourCostNumber < 0 ||
                  transportCostNumber < 0 ||
                  otherCostNumber < 0) && (
                  <Alert variant="destructive">
                    <AlertTitle>Invalid cleaning cost</AlertTitle>
                    <AlertDescription>
                      Cleaning costs can be zero, but they cannot be negative.
                    </AlertDescription>
                  </Alert>
                )}

                {createMutation.isError && (
                  <Alert variant="destructive">
                    <AlertTitle>Failed to create cleaning batch</AlertTitle>
                    <AlertDescription>
                      {getErrorMessage(createMutation.error)}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-3 border-t pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetCreateForm();
                      setCreateOpen(false);
                    }}
                  >
                    Cancel
                  </Button>

                  <Can roles={ACTION_ROLES.CREATE_CLEANING_BATCH}>
                    <Button
                      onClick={handleCreateBatch}
                      disabled={!createFormIsValid || createMutation.isPending}
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Batch"
                      )}
                    </Button>
                  </Can>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[88vh] w-[96vw] max-w-none overflow-y-auto p-5 sm:max-w-[1180px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Cleaning Batch Details
            </DialogTitle>
          </DialogHeader>

          {detailsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading cleaning batch details...
            </div>
          ) : detailsQuery.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
              Failed to load cleaning batch details.{" "}
              {getErrorMessage(detailsQuery.error)}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 rounded-xl border bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {detailBatchNo || "Cleaning Batch"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Product:{" "}
                    <span className="font-medium text-slate-900">
                      {pick(
                        header,
                        [
                          "input_product_name",
                          "product_name",
                          "raw_product_name",
                        ],
                        "-"
                      )}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(
                    pick(header, ["status", "batch_status"], "UNKNOWN")
                  )}

                  {detailPosted ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Posted
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Posted</Badge>
                  )}

                  <Can roles={ACTION_ROLES.POST_CLEANING_BATCH}>
                    <Button
                      onClick={handlePostBatch}
                      disabled={
                        detailPosted || postMutation.isPending || !detailBatchNo
                      }
                    >
                      {postMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Post Batch
                    </Button>
                  </Can>

                  <Can roles={ACTION_ROLES.DELETE}>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteBatch}
                      disabled={
                        detailPosted ||
                        deleteMutation.isPending ||
                        !detailBatchNo
                      }
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

              {postMutation.isSuccess && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  Cleaning batch posted successfully. Stock movement and journal
                  references have been refreshed.
                </div>
              )}

              {postMutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  Failed to post cleaning batch.{" "}
                  {getErrorMessage(postMutation.error)}
                </div>
              )}

              {deleteMutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  Failed to delete cleaning batch.{" "}
                  {getErrorMessage(deleteMutation.error)}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
                <InfoBox
                  label="Batch Date"
                  value={formatDate(
                    pick(header, [
                      "batch_date",
                      "started_at",
                      "cleaning_date",
                      "created_at",
                    ])
                  )}
                />

                <InfoBox
                  label="Input Product"
                  value={pick(
                    header,
                    [
                      "input_product_name",
                      "component_product_name",
                      "raw_product_name",
                    ],
                    "-"
                  )}
                />

                <InfoBox
                  label="Output Product"
                  value={pick(
                    header,
                    [
                      "output_product_name",
                      "finished_product_name",
                      "clean_product_name",
                    ],
                    "-"
                  )}
                />

                <InfoBox
                  label="Input Lot"
                  value={pick(
                    header,
                    ["input_lot_code", "raw_lots", "lot_code", "lot_no"],
                    "-"
                  )}
                />

                <InfoBox
                  label="Output Lot"
                  value={pick(
                    header,
                    ["output_lot_code", "clean_lots", "finished_lot_code"],
                    "-"
                  )}
                />

                <InfoBox
                  label="Raw Location"
                  value={pick(
                    header,
                    ["raw_location_name", "raw_location_code"],
                    "-"
                  )}
                />

                <InfoBox
                  label="Finished Location"
                  value={pick(
                    header,
                    ["fg_location_name", "fg_location_code"],
                    "-"
                  )}
                />

                <InfoBox
                  label="Created By"
                  value={pick(
                    header,
                    ["created_by", "createdBy", "user_name"],
                    "-"
                  )}
                />

                <InfoBox
                  label="Input Movement ID"
                  value={pick(
                    header,
                    ["posted_input_movement_id", "input_movement_id"],
                    "-"
                  )}
                />

                <InfoBox
                  label="Output Movement ID"
                  value={pick(
                    header,
                    ["posted_output_movement_id", "output_movement_id"],
                    "-"
                  )}
                />

                <InfoBox
                  label="Created At"
                  value={formatDateTime(
                    pick(header, ["created_at", "createdAt"])
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <InfoBox
                  label="Input Qty"
                  value={formatNumber(
                    pick(
                      header,
                      [
                        "input_qty",
                        "total_input_qty",
                        "total_raw_qty_used",
                        "raw_qty",
                      ],
                      0
                    )
                  )}
                />

                <InfoBox
                  label="Output Qty"
                  value={formatNumber(
                    pick(
                      header,
                      [
                        "output_qty",
                        "cleaned_qty",
                        "total_output_qty",
                        "total_clean_qty_produced",
                      ],
                      0
                    )
                  )}
                />

                <InfoBox
                  label="Waste / Loss Qty"
                  value={formatNumber(
                    pick(
                      header,
                      ["waste_qty", "loss_qty", "implied_waste_or_loss_qty"],
                      0
                    )
                  )}
                />

                <InfoBox
                  label="Yield %"
                  value={`${formatNumber(
                    pick(
                      header,
                      ["yield_pct", "yield_percentage", "yield_percent"],
                      0
                    )
                  )}%`}
                />

                <InfoBox
                  label="Output Unit Cost"
                  value={formatMoney(
                    pick(header, ["output_unit_cost", "unit_cost"], 0)
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <InfoBox
                  label="Raw Input Cost"
                  value={formatMoney(
                    pick(header, ["raw_input_cost", "input_cost"], 0)
                  )}
                />

                <InfoBox
                  label="Extra Cost Total"
                  value={formatMoney(pick(header, ["extra_cost_total"], 0))}
                />

                <InfoBox
                  label="Total Batch Cost"
                  value={formatMoney(
                    pick(header, ["total_cost", "batch_cost", "total_value"], 0)
                  )}
                />

                <InfoBox
                  label="Posted Output Cost"
                  value={formatMoney(
                    pick(header, ["posted_output_cost", "output_cost"], 0)
                  )}
                />
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Notes
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {pick(header, ["notes", "remarks", "description"], "-")}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium">Line Type</th>
                      <th className="px-4 py-3 font-medium">Product / Cost</th>
                      <th className="px-4 py-3 font-medium">Lot Code</th>
                      <th className="px-4 py-3 font-medium">Location</th>
                      <th className="px-4 py-3 text-right font-medium">Qty</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Unit Cost
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Line Total
                      </th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-10 text-center text-slate-500"
                        >
                          No batch lines found. Header summary is shown above.
                        </td>
                      </tr>
                    ) : (
                      lines.map((line, index) => {
                        const qty = Number(
                          pick(line, ["qty", "quantity", "line_qty"], 0)
                        );

                        const unitCost = Number(
                          pick(line, ["unit_cost", "cost", "purchase_price"], 0)
                        );

                        const lineTotal = pick(
                          line,
                          ["line_total", "total_cost", "total_value"],
                          qty * unitCost
                        );

                        const lineType = String(
                          pick(line, ["line_type", "type", "movement_type"], "")
                        ).toUpperCase();

                        return (
                          <tr key={index} className="border-t hover:bg-slate-50">
                            <td className="px-4 py-3">
                              {pick(
                                line,
                                ["line_type", "type", "movement_type"],
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              {pick(
                                line,
                                ["product_name", "product", "item_name", "cost_type"],
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {pick(
                                line,
                                ["lot_code", "lot_no", "batch_no"],
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {pick(
                                line,
                                ["location_name", "location"],
                                lineType === "INPUT"
                                  ? pick(
                                      header,
                                      [
                                        "raw_location_name",
                                        "raw_location_code",
                                      ],
                                      "-"
                                    )
                                  : lineType === "OUTPUT"
                                  ? pick(
                                      header,
                                      ["fg_location_name", "fg_location_code"],
                                      "-"
                                    )
                                  : "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatNumber(qty)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatMoney(unitCost)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {formatMoney(lineTotal)}
                            </td>
                            <td className="px-4 py-3">
                              {pick(
                                line,
                                ["notes", "remarks", "description"],
                                "-"
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button variant="outline" onClick={() => setDetailsOpen(false)}>
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
    <div className="min-h-[70px] rounded-lg border bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-snug">
        {value || "-"}
      </p>
    </div>
  );
}
