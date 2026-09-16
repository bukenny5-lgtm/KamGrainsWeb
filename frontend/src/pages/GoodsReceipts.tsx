import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Eye, Loader2, Plus, Printer, RefreshCcw, Search } from "lucide-react";

import {
  createGoodsReceipt,
  getGoodsReceiptById,
  getGoodsReceiptSummary,
  getLocations,
  getLots,
  getPurchaseOrderById,
  getPurchaseOrderSummary,
  postGoodsReceipt,
} from "@/api/client";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";

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

const AUTO_LOT_VALUE = "__AUTO_GENERATE_LOT__";
type AnyRecord = Record<string, any>;

type GrnSummaryRow = {
  grn_id: string;
  grn_no: string;
  supplier_id?: string;
  supplier_name?: string;
  po_id?: string;
  po_no?: string;
  receipt_date?: string;
  location_id?: string;
  location_name?: string;
  location_code?: string;
  status?: string;
  is_posted?: boolean;
  posted_movement_id?: string | null;
  posted_journal_id?: string | null;
  created_at?: string;
  line_count?: string;
  total_delivered_qty?: string;
  total_accepted_qty?: string;
  total_received_qty?: string;
  total_rejected_qty?: string;
  total_value?: string;
  grn_total?: string;
};

type PurchaseOrderRow = {
  po_id: string;
  po_no: string;
  supplier_id: string;
  supplier_name: string;
  status: string;
};

type PurchaseOrderDetail = {
  po_id: string;
  po_no: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: string;
};

type PurchaseOrderLineDetail = {
  po_line_id: string;
  po_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  uom_code: string;
  qty: string;
  unit_price: string;
  line_total: string;
};

type Location = {
  location_id: string;
  location_code: string;
  location_name: string;
};

type Lot = {
  lot_id: string;
  lot_code: string;
  product_id: string;
  sku: string | null;
  product_name: string | null;
  expiry_date: string | null;
};

type GrnLineInput = {
  po_line_id: string;
  product_id: string;
  product_name: string;
  lot_id: string;
  qty_delivered: string;
  qty_received: string;
  qty_rejected: string;
  unit_cost: string;
  expiry_date: string;
  quality_status: string;
  notes: string;
};

type GrnHeaderDetail = {
  grn_id: string;
  grn_no: string;
  supplier_id: string;
  supplier_name?: string;
  po_id?: string;
  po_no?: string;
  receipt_date?: string;
  status?: string;
  is_posted?: boolean;
  location_id?: string;
  location_name?: string;
  location_code?: string;
  posted_movement_id?: string | null;
  posted_journal_id?: string | null;
  total_delivered_qty?: string | number;
  total_accepted_qty?: string | number;
  total_rejected_qty?: string | number;
  total_shortage_qty?: string | number;
  total_excess_qty?: string | number;
  total_value?: string | number;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
};

type GrnLineDetail = {
  grn_line_id: string;
  product_id: string;
  sku?: string;
  product_name?: string;
  lot_id?: string | null;
  lot_code?: string | null;
  qty_delivered?: string;
  qty_received?: string;
  accepted_qty?: string;
  qty_rejected?: string;
  shortage_qty?: string;
  excess_qty?: string;
  unit_cost?: string;
  line_total?: string;
  quality_status?: string;
  notes?: string | null;
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
  return `UGX ${Number(value || 0).toLocaleString()}`;
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

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPostedBadge(isPosted: unknown) {
  return isPosted ? (
    <Badge className="bg-green-600 hover:bg-green-600">Posted</Badge>
  ) : (
    <Badge variant="outline">Not Posted</Badge>
  );
}

function getStatusBadge(status: unknown) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "POSTED" || text === "RECEIVED") {
    return <Badge className="bg-green-600 hover:bg-green-600">{text}</Badge>;
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

function escapeHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildGrnPrintHtml(
  header: GrnHeaderDetail,
  lines: GrnLineDetail[],
  totalValue: number
) {
  const rows = lines
    .map((line) => {
      const acceptedQty = line.qty_received || line.accepted_qty || 0;
      const lineTotal =
        Number(line.line_total || 0) ||
        Number(acceptedQty || 0) * Number(line.unit_cost || 0);

      return `
        <tr>
          <td>${escapeHtml(line.product_name || "-")}</td>
          <td>${escapeHtml(line.sku || "-")}</td>
          <td>${escapeHtml(line.lot_code || "-")}</td>
          <td class="num">${escapeHtml(formatQty(line.qty_delivered))}</td>
          <td class="num">${escapeHtml(formatQty(acceptedQty))}</td>
          <td class="num">${escapeHtml(formatQty(line.qty_rejected))}</td>
          <td class="num">${escapeHtml(formatMoney(line.unit_cost))}</td>
          <td class="num">${escapeHtml(formatMoney(lineTotal))}</td>
          <td>${escapeHtml(line.quality_status || "-")}</td>
          <td>${escapeHtml(line.notes || "-")}</td>
        </tr>
      `;
    })
    .join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GRN ${escapeHtml(header.grn_no)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111827; margin: 28px; font-size: 12px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
    .brand h1 { margin: 0; font-size: 24px; }
    .brand p { margin: 4px 0 0; color: #475569; }
    .doc-title { text-align: right; }
    .doc-title h2 { margin: 0; font-size: 20px; }
    .doc-title p { margin: 4px 0 0; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
    .box { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px; }
    .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
    .value { font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; font-size: 11px; text-transform: uppercase; }
    .num { text-align: right; white-space: nowrap; }
    .summary { margin-top: 14px; display: flex; justify-content: flex-end; }
    .summary table { width: 320px; }
    .footer { margin-top: 28px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
    .sign { border-top: 1px solid #111827; padding-top: 6px; text-align: center; color: #475569; }
    @media print {
      body { margin: 18mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1>KAM GRAINS</h1>
      <p>Supplies Management System</p>
    </div>
    <div class="doc-title">
      <h2>Goods Received Note</h2>
      <p><strong>${escapeHtml(header.grn_no)}</strong></p>
    </div>
  </div>

  <div class="grid">
    <div class="box"><div class="label">Supplier</div><div class="value">${escapeHtml(header.supplier_name || "-")}</div></div>
    <div class="box"><div class="label">PO Number</div><div class="value">${escapeHtml(header.po_no || "-")}</div></div>
    <div class="box"><div class="label">Receipt Date</div><div class="value">${escapeHtml(formatDate(header.receipt_date))}</div></div>
    <div class="box"><div class="label">Location</div><div class="value">${escapeHtml(header.location_name || header.location_code || "-")}</div></div>
    <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(header.status || "-")}</div></div>
    <div class="box"><div class="label">Posted</div><div class="value">${header.is_posted ? "Yes" : "No"}</div></div>
    <div class="box"><div class="label">Movement ID</div><div class="value">${escapeHtml(header.posted_movement_id || "-")}</div></div>
    <div class="box"><div class="label">Journal ID</div><div class="value">${escapeHtml(header.posted_journal_id || "-")}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>SKU</th>
        <th>Lot</th>
        <th class="num">Delivered</th>
        <th class="num">Accepted</th>
        <th class="num">Rejected</th>
        <th class="num">Unit Cost</th>
        <th class="num">Line Total</th>
        <th>Quality</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="10" style="text-align:center;">No GRN lines found.</td></tr>`}
    </tbody>
  </table>

  <div class="summary">
    <table>
      <tr><th>Total Value</th><td class="num"><strong>${escapeHtml(formatMoney(totalValue))}</strong></td></tr>
    </table>
  </div>

  <div class="footer">
    <div class="sign">Prepared By</div>
    <div class="sign">Checked By</div>
    <div class="sign">Received By</div>
  </div>
</body>
</html>
`;
}

function openPrintWindow(html: string) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups to print or save PDF.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 300);
}

export default function GoodsReceipts() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [locationId, setLocationId] = useState("");
  const [grnLines, setGrnLines] = useState<GrnLineInput[]>([]);
  const [createdGrnNo, setCreatedGrnNo] = useState<string | null>(null);

  const [selectedGrnId, setSelectedGrnId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const grnSummaryQuery = useQuery({
    queryKey: ["goods-receipts-summary"],
    queryFn: getGoodsReceiptSummary,
  });

  const poSummaryQuery = useQuery({
    queryKey: ["purchase-order-summary-for-grn"],
    queryFn: getPurchaseOrderSummary,
  });

  const poDetailQuery = useQuery({
    queryKey: ["purchase-order-detail-for-grn", selectedPoId],
    queryFn: () => getPurchaseOrderById(selectedPoId),
    enabled: Boolean(selectedPoId && isCreateOpen),
  });

  const locationsQuery = useQuery({
    queryKey: ["locations-for-grn"],
    queryFn: getLocations,
  });

  const lotsQuery = useQuery({
    queryKey: ["lots-for-grn"],
    queryFn: getLots,
  });

  const grnDetailQuery = useQuery({
    queryKey: ["goods-receipt-detail", selectedGrnId],
    queryFn: () => getGoodsReceiptById(selectedGrnId as string),
    enabled: Boolean(selectedGrnId && isDetailsOpen),
  });

  async function invalidateGoodsReceiptQueries() {
    await queryClient.invalidateQueries({ queryKey: ["goods-receipts-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["purchase-order-summary-for-grn"] });
    await queryClient.invalidateQueries({ queryKey: ["purchase-order-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["lots-for-grn"] });
    if (selectedGrnId) {
      await queryClient.invalidateQueries({
        queryKey: ["goods-receipt-detail", selectedGrnId],
      });
    }
  }

  const createGrnMutation = useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: async (result: any) => {
      const grnNo =
        result?.goods_receipt?.grn_no ||
        result?.data?.grn_no ||
        result?.grn_no ||
        null;

      setCreatedGrnNo(grnNo);
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts-summary"] });
      setLastRefreshed(new Date());
    },
  });

  const postGrnMutation = useMutation({
    mutationFn: postGoodsReceipt,
    onSuccess: async () => {
      await invalidateGoodsReceiptQueries();

      setIsCreateOpen(false);
      setIsDetailsOpen(false);
      resetCreateForm();
      setLastRefreshed(new Date());
    },
  });

  const grnRows: GrnSummaryRow[] = normalizeArray(grnSummaryQuery.data, [
    "goods_receipts",
    "grns",
    "data",
  ]);

  const purchaseOrders: PurchaseOrderRow[] = normalizeArray(poSummaryQuery.data, [
    "purchase_orders",
    "data",
  ]);

  const receivablePurchaseOrders = purchaseOrders.filter((po) => {
    const status = String(po.status || "").toUpperCase();
    const orderedQty = Number((po as AnyRecord).total_ordered_qty || 0);
    const receivedQty = Number((po as AnyRecord).total_received_qty || 0);
    const receiptPct = Number((po as AnyRecord).receipt_percentage || 0);

    return (
      status === "OPEN" &&
      orderedQty > 0 &&
      receivedQty < orderedQty &&
      receiptPct < 100
    );
  });

  const locations: Location[] = normalizeArray(locationsQuery.data, [
    "locations",
    "data",
  ]);

  const lots: Lot[] = normalizeArray(lotsQuery.data, ["lots", "data"]);

  useEffect(() => {
    const po: PurchaseOrderDetail | undefined =
      poDetailQuery.data?.purchase_order;

    const poLines: PurchaseOrderLineDetail[] = poDetailQuery.data?.lines || [];

    if (!po || poLines.length === 0) return;

    setGrnLines(
      poLines.map((line) => ({
        po_line_id: line.po_line_id,
        product_id: line.product_id,
        product_name: line.product_name,
        lot_id: AUTO_LOT_VALUE,
        qty_delivered: String(Number(line.qty || 0)),
        qty_received: String(Number(line.qty || 0)),
        qty_rejected: "0",
        unit_cost: String(Number(line.unit_price || 0)),
        expiry_date: "",
        quality_status: "ACCEPTED",
        notes: "",
      }))
    );
  }, [poDetailQuery.data]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return grnRows;

    return grnRows.filter((row) =>
      [
        row.grn_no,
        row.supplier_name,
        row.po_no,
        row.status,
        row.location_name,
        row.location_code,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [grnRows, search]);

  const totalValue = filteredRows.reduce(
    (sum, row) => sum + Number(row.total_value || row.grn_total || 0),
    0
  );

  const detailHeader: GrnHeaderDetail | undefined =
    grnDetailQuery.data?.goods_receipt ||
    grnDetailQuery.data?.grn ||
    grnDetailQuery.data?.data?.goods_receipt ||
    grnDetailQuery.data?.data;

  const detailLines: GrnLineDetail[] =
    grnDetailQuery.data?.lines || grnDetailQuery.data?.data?.lines || [];

  const detailTotalValue = detailLines.reduce(
    (sum, line) =>
      sum +
      Number(
        line.line_total ||
          Number(line.qty_received || line.accepted_qty || 0) *
            Number(line.unit_cost || 0)
      ),
    0
  );

  const createFormIsValid =
    Boolean(selectedPoId) &&
    selectedPoId !== "NO_RECEIVABLE_POS" &&
    Boolean(receiptDate) &&
    Boolean(locationId) &&
    grnLines.length > 0 &&
    grnLines.every(
      (line) =>
        line.po_line_id &&
        line.product_id &&
        Number(line.qty_delivered) > 0 &&
        Number(line.qty_received) > 0 &&
        Number(line.unit_cost) >= 0
    );

  async function handleRefresh() {
    await Promise.all([
      grnSummaryQuery.refetch(),
      poSummaryQuery.refetch(),
      locationsQuery.refetch(),
      lotsQuery.refetch(),
    ]);

    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `GRN_${formatDateKey()}.xlsx`,
        sheetName: "GRN",
        rows: filteredRows,
        columns: [
          {
            header: "GRN No",
            value: (row: GrnSummaryRow) => row.grn_no,
            width: 18,
            type: "text",
          },
          {
            header: "Supplier",
            value: (row: GrnSummaryRow) => row.supplier_name || "",
            width: 26,
            type: "text",
          },
          {
            header: "PO No",
            value: (row: GrnSummaryRow) => row.po_no || "",
            width: 18,
            type: "text",
          },
          {
            header: "Receipt Date",
            value: (row: GrnSummaryRow) => row.receipt_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Location",
            value: (row: GrnSummaryRow) => row.location_code || row.location_name || "",
            width: 22,
            type: "text",
          },
          {
            header: "Status",
            value: (row: GrnSummaryRow) => row.status || "",
            width: 14,
            type: "text",
          },
          {
            header: "Posted Status",
            value: (row: GrnSummaryRow) => (row.is_posted ? "Posted" : "Not Posted"),
            width: 14,
            type: "text",
          },
          {
            header: "Accepted Qty",
            value: (row: GrnSummaryRow) =>
              Number(row.total_accepted_qty || row.total_received_qty || 0),
            width: 14,
            type: "number",
          },
          {
            header: "Lines",
            value: (row: GrnSummaryRow) => Number(row.line_count || 0),
            width: 10,
            type: "number",
          },
          {
            header: "Total",
            value: (row: GrnSummaryRow) => Number(row.total_value || row.grn_total || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Created At",
            value: (row: GrnSummaryRow) => row.created_at || "",
            width: 20,
            type: "datetime",
          },
        ],
      });
    } finally {
      setIsExporting(false);
    }
  }

  function resetCreateForm() {
    setSelectedPoId("");
    setReceiptDate(new Date().toISOString().slice(0, 10));
    setLocationId("");
    setGrnLines([]);
    setCreatedGrnNo(null);
  }

  function openDetails(grnId: string) {
    setSelectedGrnId(grnId);
    setIsDetailsOpen(true);
  }

  function handlePrintGrn() {
    if (!detailHeader) return;

    openPrintWindow(buildGrnPrintHtml(detailHeader, detailLines, detailTotalValue));
  }

  function handleDownloadPdf() {
    if (!detailHeader) return;

    openPrintWindow(buildGrnPrintHtml(detailHeader, detailLines, detailTotalValue));
  }

  function updateGrnLine(
    index: number,
    field: keyof GrnLineInput,
    value: string
  ) {
    setGrnLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
    );
  }

  function handleCreateGrn() {
    const po: PurchaseOrderDetail | undefined =
      poDetailQuery.data?.purchase_order;

    if (!po) return;

    createGrnMutation.mutate({
      po_id: po.po_id,
      supplier_id: po.supplier_id,
      receipt_date: receiptDate,
      location_id: locationId,
      lines: grnLines.map((line) => ({
        po_line_id: line.po_line_id,
        product_id: line.product_id,
        lot_id: line.lot_id === AUTO_LOT_VALUE ? null : line.lot_id,
        qty_delivered: Number(line.qty_delivered || 0),
        qty_received: Number(line.qty_received || 0),
        qty_rejected: Number(line.qty_rejected || 0),
        unit_cost: Number(line.unit_cost || 0),
        expiry_date: line.expiry_date || null,
        quality_status: line.quality_status || "ACCEPTED",
        notes: line.notes || null,
      })),
    });
  }

  if (grnSummaryQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (grnSummaryQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>GRNs failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(grnSummaryQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Goods Receipts / GRN
          </h1>
          <p className="mt-1 text-slate-500">
            Receive supplier goods, view GRNs, and post stock into inventory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={grnSummaryQuery.isFetching}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {grnSummaryQuery.isFetching ? "Refreshing..." : "Refresh"}
          </Button>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || filteredRows.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>

          <Can roles={ACTION_ROLES.CREATE_GRN}>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New GRN
            </Button>
          </Can>
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-slate-500">
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">GRN Count</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalValue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="kg-status-badge">
  Live Data
</Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>GRN List</CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search GRN number, supplier, PO, status, location..."
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="kg-table-scroll kg-compact-table kg-sticky-action">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN No</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>PO No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">
                      No GRNs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.grn_id || row.grn_no}
                      className="cursor-pointer hover:bg-slate-50"
                      onDoubleClick={() => openDetails(row.grn_no || row.grn_id)}
                    >
                      <TableCell className="font-medium">
                        {row.grn_no}
                      </TableCell>
                      <TableCell>{row.supplier_name || "-"}</TableCell>
                      <TableCell>{row.po_no || "-"}</TableCell>
                      <TableCell>{formatDate(row.receipt_date)}</TableCell>
                      <TableCell className="kg-cell-wide">
  {row.location_code || row.location_name || "-"}
</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell>{getPostedBadge(row.is_posted)}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(
                          row.total_accepted_qty || row.total_received_qty
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.total_value || row.grn_total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(row.grn_no || row.grn_id)}
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

          if (!open) {
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[1150px] overflow-y-auto sm:!max-w-[1150px]">
          <DialogHeader>
            <DialogTitle>Create Goods Receipt / GRN</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Purchase Order</Label>
                <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purchase order" />
                  </SelectTrigger>
                  <SelectContent>
                    {receivablePurchaseOrders.length === 0 ? (
                      <SelectItem value="NO_RECEIVABLE_POS" disabled>
                        No open purchase orders with pending quantity
                      </SelectItem>
                    ) : (
                      receivablePurchaseOrders.map((po) => {
                        const orderedQty = Number((po as AnyRecord).total_ordered_qty || 0);
                        const receivedQty = Number((po as AnyRecord).total_received_qty || 0);
                        const pendingQty = Math.max(orderedQty - receivedQty, 0);

                        return (
                          <SelectItem key={po.po_id} value={po.po_id}>
                            {po.po_no} - {po.supplier_name} - Pending {formatQty(pendingQty)} KG
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Receipt Date</Label>
                <Input
                  type="date"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label>Receiving Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select receiving location" />
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
            </div>

            {poDetailQuery.isLoading && (
              <div className="flex h-32 items-center justify-center rounded-2xl border">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            )}

            {!poDetailQuery.isLoading && grnLines.length > 0 && (
              <div className="space-y-4 rounded-2xl border bg-slate-50 p-4">
                <div>
                  <h3 className="font-semibold">GRN Lines</h3>
                  <p className="text-sm text-slate-500">
                    For new purchases, leave lot as auto-generate. Select an
                    existing lot only if stock belongs to an existing batch.
                  </p>
                </div>

                {grnLines.map((line, index) => {
                  const productLots = lots.filter(
                    (lot) => lot.product_id === line.product_id
                  );

                  return (
                    <div
                      key={`${line.po_line_id}-${index}`}
                      className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"
                    >
                      <div>
                        <p className="font-semibold">{line.product_name}</p>
                        <p className="text-sm text-slate-500">
                          PO Line: {line.po_line_id}
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Lot</Label>
                          <Select
                            value={line.lot_id}
                            onValueChange={(value) =>
                              updateGrnLine(index, "lot_id", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Auto-generate new lot" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={AUTO_LOT_VALUE}>
                                Auto-generate new lot
                              </SelectItem>

                              {productLots.map((lot) => (
                                <SelectItem key={lot.lot_id} value={lot.lot_id}>
                                  {lot.lot_code}
                                  {lot.expiry_date
                                    ? ` - Exp: ${formatDate(lot.expiry_date)}`
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Quality Status</Label>
                          <Select
                            value={line.quality_status}
                            onValueChange={(value) =>
                              updateGrnLine(index, "quality_status", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ACCEPTED">ACCEPTED</SelectItem>
                              <SelectItem value="REJECTED">REJECTED</SelectItem>
                              <SelectItem value="PARTIAL">PARTIAL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Expiry Date</Label>
                          <Input
                            type="date"
                            value={line.expiry_date}
                            onChange={(event) =>
                              updateGrnLine(
                                index,
                                "expiry_date",
                                event.target.value
                              )
                            }
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Delivered Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            className="text-right"
                            value={line.qty_delivered}
                            onChange={(event) =>
                              updateGrnLine(
                                index,
                                "qty_delivered",
                                event.target.value
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Accepted Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            className="text-right"
                            value={line.qty_received}
                            onChange={(event) =>
                              updateGrnLine(
                                index,
                                "qty_received",
                                event.target.value
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Rejected Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            className="text-right"
                            value={line.qty_rejected}
                            onChange={(event) =>
                              updateGrnLine(
                                index,
                                "qty_rejected",
                                event.target.value
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Unit Cost</Label>
                          <Input
                            type="number"
                            min="0"
                            className="text-right"
                            value={line.unit_cost}
                            onChange={(event) =>
                              updateGrnLine(
                                index,
                                "unit_cost",
                                event.target.value
                              )
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          value={line.notes}
                          placeholder="Optional notes for this received line."
                          className="min-h-24 w-full resize-y"
                          onChange={(event) =>
                            updateGrnLine(index, "notes", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Alert>
              <AlertTitle>Lot handling</AlertTitle>
              <AlertDescription>
                For new purchases, leave the lot as Auto-generate new lot. The
                system will create the lot during GRN creation. Select an
                existing lot only when adding stock to a known existing batch.
              </AlertDescription>
            </Alert>

            {createGrnMutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Failed to create GRN</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createGrnMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            {postGrnMutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Failed to post GRN</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(postGrnMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
              <div>
                {createdGrnNo ? (
                  <Badge variant="outline" className="rounded-full">
                    Created GRN: {createdGrnNo}
                  </Badge>
                ) : (
                  <p className="text-sm text-slate-500">
                    Create the GRN first, then post it to update stock.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetCreateForm();
                    setIsCreateOpen(false);
                  }}
                >
                  Cancel
                </Button>

                <Can roles={ACTION_ROLES.CREATE_GRN}>
                  <Button
                    variant="outline"
                    onClick={handleCreateGrn}
                    disabled={
                      !createFormIsValid ||
                      createGrnMutation.isPending ||
                      Boolean(createdGrnNo)
                    }
                  >
                    {createGrnMutation.isPending ? "Creating..." : "Create GRN"}
                  </Button>
                </Can>

                <Can roles={ACTION_ROLES.POST_GRN}>
                  <Button
                    onClick={() => {
                      if (createdGrnNo) {
                        postGrnMutation.mutate(createdGrnNo);
                      }
                    }}
                    disabled={!createdGrnNo || postGrnMutation.isPending}
                  >
                    {postGrnMutation.isPending ? "Posting..." : "Post GRN"}
                  </Button>
                </Can>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[1100px] overflow-y-auto sm:!max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>GRN Details</DialogTitle>
          </DialogHeader>

          {grnDetailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : grnDetailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load GRN</AlertTitle>
              <AlertDescription>
                {getErrorMessage(grnDetailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailHeader ? (
            <Alert>
              <AlertTitle>No GRN data</AlertTitle>
              <AlertDescription>
                The selected GRN could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="GRN Number" value={detailHeader.grn_no} />
                <InfoBox
                  label="Supplier"
                  value={detailHeader.supplier_name || "-"}
                />
                <InfoBox label="PO Number" value={detailHeader.po_no || "-"} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <div className="mt-1">{getStatusBadge(detailHeader.status)}</div>
                </div>
                <InfoBox
                  label="Receipt Date"
                  value={formatDate(detailHeader.receipt_date)}
                />
                <InfoBox
                  label="Location"
                  value={
                    detailHeader.location_name ||
                    detailHeader.location_code ||
                    "-"
                  }
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Posted
                  </p>
                  <div className="mt-1">
                    {getPostedBadge(detailHeader.is_posted)}
                  </div>
                </div>
                <InfoBox
                  label="Total Value"
                  value={formatMoney(detailTotalValue)}
                />
                <InfoBox
                  label="Delivered Qty"
                  value={formatQty(detailHeader.total_delivered_qty)}
                />
                <InfoBox
                  label="Accepted Qty"
                  value={formatQty(detailHeader.total_accepted_qty)}
                />
                <InfoBox
                  label="Rejected Qty"
                  value={formatQty(detailHeader.total_rejected_qty)}
                />
                <InfoBox
                  label="Created By"
                  value={
                    detailHeader.created_by_name ||
                    detailHeader.created_by ||
                    "System"
                  }
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailHeader.created_at)}
                />
                <InfoBox
                  label="Movement ID"
                  value={detailHeader.posted_movement_id || "-"}
                />
                <InfoBox
                  label="Journal ID"
                  value={detailHeader.posted_journal_id || "-"}
                />
              </div>

              <div className="kg-table-scroll kg-compact-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Lot Code</TableHead>
                     <TableHead className="text-right">Delivered</TableHead>
                     <TableHead className="text-right">Accepted</TableHead>
                     <TableHead className="text-right">Rejected</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                      <TableHead className="text-right">Excess</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="h-24 text-center">
                          No GRN lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <TableRow key={line.grn_line_id}>
                          <TableCell className="kg-cell-wide font-medium">
                          {line.product_name || "-"}
                          </TableCell>
                          <TableCell>{line.sku || "-"}</TableCell>
                          <TableCell>{line.lot_code || "-"}</TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.qty_delivered)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.qty_received || line.accepted_qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.qty_rejected)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.shortage_qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.excess_qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(line.unit_cost)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(
                              line.line_total ||
                                Number(
                                  line.qty_received || line.accepted_qty || 0
                                ) * Number(line.unit_cost || 0)
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {line.quality_status || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="min-w-48">
                            {line.notes || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                  className="w-full md:w-auto"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <div className="flex flex-wrap justify-end gap-3">
                  <Button variant="outline" onClick={handlePrintGrn}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print GRN
                  </Button>

                  <Button variant="outline" onClick={handleDownloadPdf}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setIsDetailsOpen(false)}
                  >
                    Close
                  </Button>

                  <Can roles={ACTION_ROLES.POST_GRN}>
                    <Button
                      onClick={() => postGrnMutation.mutate(detailHeader.grn_no)}
                      disabled={
                        Boolean(detailHeader.is_posted) ||
                        postGrnMutation.isPending
                      }
                    >
                      {postGrnMutation.isPending ? "Posting..." : "Post GRN"}
                    </Button>
                  </Can>
                </div>
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
