import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Eye,
  Loader2,
  PackageCheck,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";

import {
  createGoodsReceipt,
  createPurchaseOrder,
  getLocations,
  getLots,
  getParties,
  getProducts,
  getPurchaseOrderById,
  getPurchaseOrderSummary,
  postGoodsReceipt,
} from "@/api/client";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";
import { BUSINESS_PROFILE_FALLBACK } from "@/lib/businessProfile";
import { useAuth } from "@/lib/auth";

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
import { Textarea } from "@/components/ui/textarea";
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

type PurchaseOrderRow = {
  po_id: string;
  po_no: string;
  order_date: string;
  expected_date: string | null;
  status: string;
  supplier_id: string;
  supplier_name: string;
  created_by?: string | null;
  created_by_name?: string | null;
  line_count: string | number;
  total_ordered_qty: string | number;
  total_po_value: string | number;
  grn_count: string | number;
  total_received_qty: string | number;
  receipt_percentage: string | number;
  created_at: string;
};

type Product = {
  product_id: string;
  sku: string;
  product_name: string;
  product_type?: string;
  uom_code?: string;
  is_active?: boolean;
};

type Party = {
  party_id: string;
  party_name: string;
  party_type?: string;
  is_active?: boolean;
};

type PoLine = {
  product_id: string;
  qty: string;
  unit_price: string;
};

type PurchaseOrderDetail = {
  po_id: string;
  po_no: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

type PurchaseOrderLineDetail = {
  po_line_id: string;
  po_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  uom_code: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

type Location = {
  location_id: string;
  location_code: string;
  location_name: string;
  is_active?: boolean;
};

type Lot = {
  lot_id: string;
  lot_code: string;
  product_id: string;
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

function formatQty(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
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

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStatusBadge(status: unknown) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "OPEN") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">OPEN</Badge>;
  }

  if (text === "POSTED" || text === "COMPLETED" || text === "CLOSED") {
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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPurchaseOrderPrintHtml({
  purchaseOrder,
  lines,
  totalValue,
}: {
  purchaseOrder: PurchaseOrderDetail;
  lines: PurchaseOrderLineDetail[];
  totalValue: number;
}) {
  const lineRows = lines
    .map(
      (line, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(line.sku || "-")}</td>
          <td>${escapeHtml(line.product_name || "-")}</td>
          <td>${escapeHtml(line.uom_code || "KG")}</td>
          <td class="num">${formatQty(line.qty)}</td>
          <td class="num">${formatMoney(line.unit_price)}</td>
          <td class="num">${formatMoney(line.line_total)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Order - ${escapeHtml(purchaseOrder.po_no)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    .header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
    .business { font-size: 22px; font-weight: 800; letter-spacing: .04em; }
    .subtitle { font-size: 12px; color: #4b5563; margin-top: 4px; }
    .doc-title { margin-top: 12px; font-size: 17px; font-weight: 700; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 18px 0; font-size: 12px; }
    .meta div { border: 1px solid #e5e7eb; padding: 8px; border-radius: 6px; }
    .label { display: block; color: #6b7280; font-size: 10px; text-transform: uppercase; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
    th, td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    .num { text-align: right; white-space: nowrap; }
    .total-row td { font-weight: 800; background: #f9fafb; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 50px; font-size: 11px; }
    .sig-line { border-top: 1px solid #111827; padding-top: 6px; text-align: center; }
    .footer { margin-top: 26px; font-size: 10px; color: #6b7280; text-align: center; }
    @media print { body { margin: 18mm; } button { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="business">${BUSINESS_PROFILE_FALLBACK.company_name}</div>
    <div class="subtitle">Supplies Management System</div>
    <div class="doc-title">PURCHASE ORDER</div>
  </div>

  <div class="meta">
    <div><span class="label">PO Number</span>${escapeHtml(purchaseOrder.po_no)}</div>
    <div><span class="label">Status</span>${escapeHtml(purchaseOrder.status || "-")}</div>
    <div><span class="label">Supplier</span>${escapeHtml(purchaseOrder.supplier_name || "-")}</div>
    <div><span class="label">Order Date</span>${escapeHtml(formatDate(purchaseOrder.order_date))}</div>
    <div><span class="label">Expected Date</span>${escapeHtml(formatDate(purchaseOrder.expected_date))}</div>
    <div><span class="label">Created By</span>${escapeHtml(purchaseOrder.created_by_name || purchaseOrder.created_by || "System")}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>SKU</th>
        <th>Product</th>
        <th>UOM</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows || `<tr><td colspan="7" style="text-align:center;">No purchase order lines found.</td></tr>`}
      <tr class="total-row">
        <td colspan="6" class="num">Total Purchase Order Value</td>
        <td class="num">${formatMoney(totalValue)}</td>
      </tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-line">Prepared By</div>
    <div class="sig-line">Checked By</div>
    <div class="sig-line">Supplier / Approved By</div>
  </div>

  <div class="footer">Printed from ${BUSINESS_PROFILE_FALLBACK.company_name} business management system.</div>
</body>
</html>`;
}

function openPrintableDocument(html: string) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups for this site and try again.");
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

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [expectedDate, setExpectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [lines, setLines] = useState<PoLine[]>([
    {
      product_id: "",
      qty: "1",
      unit_price: "0",
    },
  ]);

  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [isGrnDialogOpen, setIsGrnDialogOpen] = useState(false);
  const [grnReceiptDate, setGrnReceiptDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [grnLocationId, setGrnLocationId] = useState("");
  const [grnLines, setGrnLines] = useState<GrnLineInput[]>([]);
  const [createdGrnNo, setCreatedGrnNo] = useState<string | null>(null);

  const poQuery = useQuery({
    queryKey: ["purchase-order-summary"],
    queryFn: getPurchaseOrderSummary,
  });

  const poDetailQuery = useQuery({
    queryKey: ["purchase-order-detail", selectedPoId],
    queryFn: () => getPurchaseOrderById(selectedPoId as string),
    enabled: Boolean(selectedPoId && isDetailsOpen),
  });

  const productsQuery = useQuery({
    queryKey: ["products-for-purchase-orders"],
    queryFn: getProducts,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties-for-purchase-orders"],
    queryFn: getParties,
  });

  const locationsQuery = useQuery({
    queryKey: ["locations-for-po-grn"],
    queryFn: getLocations,
  });

  const lotsQuery = useQuery({
    queryKey: ["lots-for-po-grn"],
    queryFn: getLots,
  });

  async function invalidatePurchaseOrderQueries() {
    await queryClient.invalidateQueries({ queryKey: ["purchase-order-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["purchase-order-summary-for-grn"] });
    await queryClient.invalidateQueries({ queryKey: ["goods-receipts-summary"] });
    if (selectedPoId) {
      await queryClient.invalidateQueries({
        queryKey: ["purchase-order-detail", selectedPoId],
      });
    }
  }

  const createMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: async () => {
      setIsDialogOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["purchase-order-summary"] });
      setLastRefreshed(new Date());
    },
  });

  const createGrnMutation = useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: async (result: any) => {
      const grnNo =
        result?.goods_receipt?.grn_no ||
        result?.data?.grn_no ||
        result?.grn_no ||
        null;

      setCreatedGrnNo(grnNo);
      await invalidatePurchaseOrderQueries();
      setLastRefreshed(new Date());
    },
  });

  const postGrnMutation = useMutation({
    mutationFn: postGoodsReceipt,
    onSuccess: async () => {
      setIsGrnDialogOpen(false);
      setIsDetailsOpen(false);
      resetGrnForm();
      await invalidatePurchaseOrderQueries();
      setLastRefreshed(new Date());
    },
  });

  const purchaseOrders: PurchaseOrderRow[] = normalizeArray(poQuery.data, [
    "purchase_orders",
    "data",
  ]);

  const products: Product[] = normalizeArray(productsQuery.data, [
    "products",
    "data",
  ]);

  const parties: Party[] = normalizeArray(partiesQuery.data, [
    "parties",
    "data",
  ]);

  const locations: Location[] = normalizeArray(locationsQuery.data, [
    "locations",
    "data",
  ]);

  const lots: Lot[] = normalizeArray(lotsQuery.data, ["lots", "data"]);

  const suppliers = parties.filter((party) => {
    const type = String(party.party_type || "").toUpperCase();

    if (party.is_active === false) return false;

    return !type || type.includes("SUPPLIER") || type.includes("BOTH");
  });

  const purchasableProducts = products.filter((product) => {
    if (product.is_active === false) return false;
    return true;
  });

  const activeLocations = locations.filter(
    (location) => location.is_active !== false
  );

  const filteredPurchaseOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return purchaseOrders;

    return purchaseOrders.filter((row) =>
      [
        row.po_no,
        row.status,
        row.supplier_name,
        row.total_po_value,
        row.receipt_percentage,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [purchaseOrders, search]);

  const totalPoValue = filteredPurchaseOrders.reduce(
    (sum, row) => sum + Number(row.total_po_value || 0),
    0
  );

  const detailPo: PurchaseOrderDetail | undefined =
    poDetailQuery.data?.purchase_order ||
    poDetailQuery.data?.data?.purchase_order ||
    poDetailQuery.data?.data;

  const selectedPoSummary = purchaseOrders.find(
    (row) => row.po_id === selectedPoId
  );

  const selectedPoPendingQty = Math.max(
    Number(selectedPoSummary?.total_ordered_qty || 0) -
      Number(selectedPoSummary?.total_received_qty || 0),
    0
  );

  const canCreateGrnForSelectedPo = Boolean(
    selectedPoSummary &&
      String(selectedPoSummary.status || "").toUpperCase() === "OPEN" &&
      Number(selectedPoSummary.receipt_percentage || 0) < 100 &&
      selectedPoPendingQty > 0
  );

  const detailLines: PurchaseOrderLineDetail[] =
    poDetailQuery.data?.lines || poDetailQuery.data?.data?.lines || [];

  const detailTotalValue = detailLines.reduce(
    (sum, line) => sum + Number(line.line_total || 0),
    0
  );

  const formIsValid =
    Boolean(supplierId) &&
    Boolean(orderDate) &&
    lines.some(
      (line) =>
        line.product_id &&
        Number(line.qty || 0) > 0 &&
        Number(line.unit_price || 0) >= 0
    );

  const grnFormIsValid =
    Boolean(grnReceiptDate) &&
    Boolean(grnLocationId) &&
    grnLines.length > 0 &&
    grnLines.every(
      (line) =>
        line.po_line_id &&
        line.product_id &&
        line.lot_id &&
        Number(line.qty_delivered) > 0 &&
        Number(line.qty_received) > 0 &&
        Number(line.unit_cost) >= 0
    );

  async function handleRefresh() {
    await Promise.all([
      poQuery.refetch(),
      productsQuery.refetch(),
      partiesQuery.refetch(),
      locationsQuery.refetch(),
      lotsQuery.refetch(),
    ]);

    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredPurchaseOrders.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `Purchase_Orders_${formatDateKey()}.xlsx`,
        sheetName: "Purchase Orders",
        rows: filteredPurchaseOrders,
        columns: [
          {
            header: "PO No",
            value: (row: PurchaseOrderRow) => row.po_no,
            width: 18,
            type: "text",
          },
          {
            header: "Supplier",
            value: (row: PurchaseOrderRow) => row.supplier_name || "",
            width: 28,
            type: "text",
          },
          {
            header: "Order Date",
            value: (row: PurchaseOrderRow) => row.order_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Expected Date",
            value: (row: PurchaseOrderRow) => row.expected_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Status",
            value: (row: PurchaseOrderRow) => row.status || "",
            width: 14,
            type: "text",
          },
          {
            header: "Ordered Qty",
            value: (row: PurchaseOrderRow) => Number(row.total_ordered_qty || 0),
            width: 14,
            type: "number",
          },
          {
            header: "Received Qty",
            value: (row: PurchaseOrderRow) => Number(row.total_received_qty || 0),
            width: 14,
            type: "number",
          },
          {
            header: "Receipt %",
            value: (row: PurchaseOrderRow) => Number(row.receipt_percentage || 0),
            width: 12,
            type: "number",
          },
          {
            header: "GRNs",
            value: (row: PurchaseOrderRow) => Number(row.grn_count || 0),
            width: 10,
            type: "number",
          },
          {
            header: "Total",
            value: (row: PurchaseOrderRow) => Number(row.total_po_value || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Created By",
            value: (row: PurchaseOrderRow) => row.created_by_name || row.created_by || "",
            width: 24,
            type: "text",
          },
          {
            header: "Created At",
            value: (row: PurchaseOrderRow) => row.created_at || "",
            width: 20,
            type: "datetime",
          },
        ],
      });
    } finally {
      setIsExporting(false);
    }
  }

  function resetForm() {
    setSupplierId("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDate(new Date().toISOString().slice(0, 10));
    setLines([
      {
        product_id: "",
        qty: "1",
        unit_price: "0",
      },
    ]);
  }

  function resetGrnForm() {
    setGrnReceiptDate(new Date().toISOString().slice(0, 10));
    setGrnLocationId("");
    setGrnLines([]);
    setCreatedGrnNo(null);
  }

  function updateLine(index: number, field: keyof PoLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        product_id: "",
        qty: "1",
        unit_price: "0",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function openPurchaseOrderDetails(poId: string) {
    setSelectedPoId(poId);
    setIsDetailsOpen(true);
  }

  function openGrnFromPurchaseOrder() {
    if (detailLines.length === 0 || !canCreateGrnForSelectedPo) {
      window.alert(
        "This purchase order has no pending quantity to receive. Only OPEN purchase orders with pending quantity can create a GRN."
      );
      return;
    }

    const mappedLines = detailLines.map((line) => ({
      po_line_id: line.po_line_id,
      product_id: line.product_id,
      product_name: line.product_name,
      lot_id: "",
      qty_delivered: String(Number(line.qty || 0)),
      qty_received: String(Number(line.qty || 0)),
      qty_rejected: "0",
      unit_cost: String(Number(line.unit_price || 0)),
      expiry_date: "",
      quality_status: "ACCEPTED",
      notes: "",
    }));

    setCreatedGrnNo(null);
    setGrnLines(mappedLines);
    setGrnReceiptDate(new Date().toISOString().slice(0, 10));
    setGrnLocationId("");
    setIsGrnDialogOpen(true);
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

  function handleSubmit() {
    const validLines = lines
      .filter((line) => line.product_id && Number(line.qty) > 0)
      .map((line) => ({
        product_id: line.product_id,
        qty: Number(line.qty),
        unit_price: Number(line.unit_price || 0),
      }));

    createMutation.mutate({
      supplier_id: supplierId,
      order_date: orderDate,
      expected_date: expectedDate || null,
      created_by: user?.user_id || null,
      lines: validLines,
    });
  }

  function handleCreateGrn() {
    if (!detailPo) return;

    createGrnMutation.mutate({
      po_id: detailPo.po_id,
      supplier_id: detailPo.supplier_id,
      receipt_date: grnReceiptDate,
      location_id: grnLocationId,
      created_by: user?.user_id || null,
      lines: grnLines.map((line) => ({
        po_line_id: line.po_line_id,
        product_id: line.product_id,
        lot_id: line.lot_id,
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


  function handlePrintPurchaseOrder() {
    if (!detailPo) return;

    openPrintableDocument(
      buildPurchaseOrderPrintHtml({
        purchaseOrder: detailPo,
        lines: detailLines,
        totalValue: detailTotalValue,
      })
    );
  }

  function handleDownloadPurchaseOrderPdf() {
    handlePrintPurchaseOrder();
  }

  if (
    poQuery.isLoading ||
    productsQuery.isLoading ||
    partiesQuery.isLoading ||
    locationsQuery.isLoading ||
    lotsQuery.isLoading
  ) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    poQuery.isError ||
    productsQuery.isError ||
    partiesQuery.isError ||
    locationsQuery.isError ||
    lotsQuery.isError
  ) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Purchase orders failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(
            poQuery.error ||
              productsQuery.error ||
              partiesQuery.error ||
              locationsQuery.error ||
              lotsQuery.error
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="mt-1 text-slate-500">
            Create and track supplier purchase orders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={
              poQuery.isFetching ||
              productsQuery.isFetching ||
              partiesQuery.isFetching ||
              locationsQuery.isFetching ||
              lotsQuery.isFetching
            }
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || filteredPurchaseOrders.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>

          <Can roles={ACTION_ROLES.CREATE_PURCHASE_ORDER}>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Purchase Order
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
            <CardTitle className="text-sm text-slate-500">PO Count</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredPurchaseOrders.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total PO Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalPoValue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="rounded-full">
              Integrated Business System
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>Purchase Order List</CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search PO number, supplier, status..."
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
                  <TableHead>PO No</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ordered Qty</TableHead>
                  <TableHead className="text-right">Received Qty</TableHead>
                  <TableHead className="text-right">Receipt %</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredPurchaseOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      No purchase orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPurchaseOrders.map((row) => (
                    <TableRow
                      key={row.po_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openPurchaseOrderDetails(row.po_id)}
                    >
                      <TableCell className="font-medium">{row.po_no}</TableCell>
                      <TableCell>{row.supplier_name}</TableCell>
                      <TableCell>{formatDate(row.order_date)}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.total_ordered_qty)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.total_received_qty)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.receipt_percentage)}%
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.total_po_value)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPurchaseOrderDetails(row.po_id)}
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
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[1100px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem
                        key={supplier.party_id}
                        value={supplier.party_id}
                      >
                        {supplier.party_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Order Date</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(event) => setOrderDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Expected Date</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(event) => setExpectedDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
              {lines.map((line, index) => {
                const selectedProduct = purchasableProducts.find(
                  (product) => product.product_id === line.product_id
                );

                const lineTotal =
                  Number(line.qty || 0) * Number(line.unit_price || 0);

                return (
                  <div
                    key={`${index}-${line.product_id}`}
                    className="grid gap-3 rounded-xl bg-white p-3 shadow-sm md:grid-cols-[minmax(260px,1.4fr)_140px_160px_150px_90px]"
                  >
                    <Select
                      value={line.product_id}
                      onValueChange={(value) =>
                        updateLine(index, "product_id", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {purchasableProducts.map((product) => (
                          <SelectItem
                            key={product.product_id}
                            value={product.product_id}
                          >
                            {product.sku ? `${product.sku} - ` : ""}
                            {product.product_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      min="0"
                      className="text-right"
                      placeholder="Qty"
                      value={line.qty}
                      onChange={(event) =>
                        updateLine(index, "qty", event.target.value)
                      }
                    />

                    <Input
                      type="number"
                      min="0"
                      className="text-right"
                      placeholder="Unit Price"
                      value={line.unit_price}
                      onChange={(event) =>
                        updateLine(index, "unit_price", event.target.value)
                      }
                    />

                    <div className="flex items-center justify-end text-sm font-semibold">
                      {formatMoney(lineTotal)}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    {selectedProduct && (
                      <div className="text-xs text-slate-500 md:col-span-5">
                        Product: {selectedProduct.product_name} | UOM:{" "}
                        {selectedProduct.uom_code || "KG"}
                      </div>
                    )}
                  </div>
                );
              })}

              <Button variant="outline" onClick={addLine}>
                <Plus className="mr-2 h-4 w-4" />
                Add Line
              </Button>
            </div>

            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Failed to save purchase order</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(createMutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setIsDialogOpen(false);
                }}
              >
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_PURCHASE_ORDER}>
                <Button
                  onClick={handleSubmit}
                  disabled={!formIsValid || createMutation.isPending}
                >
                  {createMutation.isPending ? "Saving..." : "Save Purchase Order"}
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[1100px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase Order Details</DialogTitle>
          </DialogHeader>

          {poDetailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : poDetailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load purchase order</AlertTitle>
              <AlertDescription>
                {getErrorMessage(poDetailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailPo ? (
            <Alert>
              <AlertTitle>No purchase order data</AlertTitle>
              <AlertDescription>
                The selected purchase order could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{detailPo.po_no}</h2>
                  <p className="text-sm text-slate-500">
                    Supplier: {detailPo.supplier_name || "-"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button variant="outline" onClick={handlePrintPurchaseOrder}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print PO
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPurchaseOrderPdf}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="PO Number" value={detailPo.po_no} />
                <InfoBox label="Supplier" value={detailPo.supplier_name} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <div className="mt-1">{getStatusBadge(detailPo.status)}</div>
                </div>
                <InfoBox label="Total Value" value={formatMoney(detailTotalValue)} />
                <InfoBox label="Order Date" value={formatDate(detailPo.order_date)} />
                <InfoBox
                  label="Expected Date"
                  value={formatDate(detailPo.expected_date)}
                />
                <InfoBox
                  label="Created By"
                  value={detailPo.created_by_name || detailPo.created_by || "System"}
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailPo.created_at)}
                />
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          No purchase order lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <TableRow key={line.po_line_id}>
                          <TableCell className="font-medium">{line.sku}</TableCell>
                          <TableCell>{line.product_name}</TableCell>
                          <TableCell>{line.uom_code}</TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.qty)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(line.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(line.line_total)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  Close
                </Button>

                <Can roles={ACTION_ROLES.CREATE_GRN}>
                  <Button
                    onClick={openGrnFromPurchaseOrder}
                    disabled={!canCreateGrnForSelectedPo}
                    title={
                      canCreateGrnForSelectedPo
                        ? `Pending quantity: ${formatQty(selectedPoPendingQty)} KG`
                        : "No pending quantity to receive"
                    }
                  >
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Create GRN
                  </Button>
                </Can>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isGrnDialogOpen}
        onOpenChange={(open) => {
          setIsGrnDialogOpen(open);
          if (!open) resetGrnForm();
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[1200px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create GRN from Purchase Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Receipt Date</Label>
                <Input
                  type="date"
                  value={grnReceiptDate}
                  onChange={(event) => setGrnReceiptDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Receipt Location</Label>
                <Select value={grnLocationId} onValueChange={setGrnLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLocations.map((location) => (
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

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex h-10 items-center rounded-md border bg-white px-3 text-sm">
                  RECEIVED
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
              {grnLines.map((line, index) => {
                const productLots = lots.filter(
                  (lot) => lot.product_id === line.product_id
                );

                return (
                  <div
                    key={line.po_line_id}
                    className="space-y-3 rounded-xl bg-white p-3 shadow-sm"
                  >
                    <div className="grid gap-3 md:grid-cols-[minmax(220px,1.4fr)_220px_120px_120px_120px_140px_150px]">
                      <div>
                        <p className="font-medium">{line.product_name}</p>
                        <p className="text-xs text-slate-500">
                          PO Line: {line.po_line_id.slice(0, 8)}...
                        </p>
                      </div>

                      <Select
                        value={line.lot_id}
                        onValueChange={(value) =>
                          updateGrnLine(index, "lot_id", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {productLots.length === 0 ? (
                            <SelectItem value="NO_LOTS_FOUND" disabled>
                              No lots found for product
                            </SelectItem>
                          ) : (
                            productLots.map((lot) => (
                              <SelectItem key={lot.lot_id} value={lot.lot_id}>
                                {lot.lot_code}
                                {lot.expiry_date
                                  ? ` - Exp: ${formatDate(lot.expiry_date)}`
                                  : ""}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>

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

                      <Input
                        type="number"
                        min="0"
                        className="text-right"
                        value={line.unit_cost}
                        onChange={(event) =>
                          updateGrnLine(index, "unit_cost", event.target.value)
                        }
                      />

                      <Input
                        type="date"
                        value={line.expiry_date}
                        onChange={(event) =>
                          updateGrnLine(index, "expiry_date", event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={line.notes}
                        placeholder="Optional notes"
                        className="min-h-24 resize-y"
                        onChange={(event) =>
                          updateGrnLine(index, "notes", event.target.value)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Alert>
              <AlertTitle>Lot selection required</AlertTitle>
              <AlertDescription>
                Select the correct lot for each received product. The system
                saves the hidden lot_id, but users only see the lot code.
              </AlertDescription>
            </Alert>

            {createdGrnNo && (
              <Alert>
                <AlertTitle>GRN created</AlertTitle>
                <AlertDescription>
                  Created GRN: {createdGrnNo}. You can now post it to update
                  inventory.
                </AlertDescription>
              </Alert>
            )}

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

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  resetGrnForm();
                  setIsGrnDialogOpen(false);
                }}
              >
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_GRN}>
                <Button
                  variant="outline"
                  onClick={handleCreateGrn}
                  disabled={
                    !grnFormIsValid ||
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
