import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Printer,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";

import {
  cancelSalesOrder,
  createDelivery,
  createSalesOrder,
  getLocations,
  getParties,
  getProducts,
  getSalesOrderById,
  getSalesOrders,
  updateSalesOrder,
} from "@/api/client";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { BUSINESS_PROFILE_FALLBACK } from "@/lib/businessProfile";

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

type AnyRecord = Record<string, any>;

type SalesOrderRow = {
  so_id: string;
  so_no: string;
  customer_id: string;
  customer_name?: string;
  order_date?: string;
  status?: string;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  so_total?: string | number;
  line_count?: string | number;
};

type SalesOrderLine = {
  so_line_id: string;
  so_id: string;
  product_id: string;
  sku?: string;
  product_name?: string;
  uom_code?: string;
  qty?: string | number;
  sell_qty?: string | number;
  sell_uom_code?: string;
  unit_price?: string | number;
  pieces_per_carton?: string | number | null;
  line_total?: string | number;
};

type Party = {
  party_id: string;
  party_name: string;
  party_type?: string;
  is_active?: boolean;
};

type Product = {
  product_id: string;
  sku?: string;
  product_name: string;
  product_type?: string;
  uom_code?: string;
  is_saleable?: boolean;
  is_active?: boolean;
};

type Location = {
  location_id: string;
  location_code?: string;
  location_name: string;
  is_active?: boolean;
};

type NewSalesLine = {
  product_id: string;
  sell_qty: string;
  unit_price: string;
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

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatQty(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function getStatusBadge(status: string | undefined) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "OPEN") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">OPEN</Badge>;
  }

  if (text === "COMPLETED" || text === "POSTED" || text === "CLOSED") {
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

const BUSINESS_NAME = BUSINESS_PROFILE_FALLBACK.company_name;
const BUSINESS_SUBTITLE = "Supplies Management System";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openPrintableWindow(title: string, bodyHtml: string) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups to print or save PDF.");
    return;
  }

  printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    .header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
    .header h1 { margin: 0; font-size: 24px; letter-spacing: 0.08em; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #4b5563; }
    .doc-title { text-align: center; font-size: 18px; font-weight: 700; margin: 16px 0; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 16px; }
    .field { font-size: 12px; }
    .label { color: #6b7280; font-weight: 700; text-transform: uppercase; font-size: 10px; }
    .value { margin-top: 2px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    .right { text-align: right; }
    .total-row td { font-weight: 700; background: #f9fafb; }
    .signatures { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: 48px; font-size: 12px; }
    .sig-line { border-top: 1px solid #111827; padding-top: 6px; text-align: center; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #6b7280; }
    @media print {
      button { display: none; }
      body { margin: 16mm; }
    }
  </style>
</head>
<body>
  ${bodyHtml}
  <script>
    window.onload = function() {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`);

  printWindow.document.close();
}

export default function SalesOrders() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [deliveryLocationId, setDeliveryLocationId] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [salesLines, setSalesLines] = useState<NewSalesLine[]>([
    {
      product_id: "",
      sell_qty: "",
      unit_price: "",
    },
  ]);

  const [editingSoId, setEditingSoId] = useState<string | null>(null);
  const [selectedSoId, setSelectedSoId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const salesOrdersQuery = useQuery({
    queryKey: ["sales-orders"],
    queryFn: getSalesOrders,
  });

  const partiesQuery = useQuery({
    queryKey: ["parties-for-sales-orders"],
    queryFn: getParties,
  });

  const productsQuery = useQuery({
    queryKey: ["products-for-sales-orders"],
    queryFn: getProducts,
  });

  const locationsQuery = useQuery({
    queryKey: ["locations-for-sales-delivery"],
    queryFn: getLocations,
  });

  const detailQuery = useQuery({
    queryKey: ["sales-order-detail", selectedSoId],
    queryFn: () => getSalesOrderById(selectedSoId as string),
    enabled: Boolean(selectedSoId && isDetailsOpen),
  });

  async function invalidateSalesOrderQueries() {
    await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    if (selectedSoId) {
      await queryClient.invalidateQueries({
        queryKey: ["sales-order-detail", selectedSoId],
      });
    }
  }

  const createMutation = useMutation({
    mutationFn: createSalesOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      resetCreateForm();
      setIsCreateOpen(false);
      setLastRefreshed(new Date());
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ soId, payload }: { soId: string; payload: AnyRecord }) =>
      updateSalesOrder(soId, payload),
    onSuccess: async () => {
      await invalidateSalesOrderQueries();
      resetCreateForm();
      setIsCreateOpen(false);
      setLastRefreshed(new Date());
    },
  });

  const createDeliveryMutation = useMutation({
    mutationFn: createDelivery,
    onSuccess: async () => {
      await invalidateSalesOrderQueries();
      setDeliveryLocationId("");
      setDeliveryDate(new Date().toISOString().slice(0, 10));
      setLastRefreshed(new Date());
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSalesOrder,
    onSuccess: async () => {
      await invalidateSalesOrderQueries();
      setLastRefreshed(new Date());
    },
  });

  const salesOrders: SalesOrderRow[] = normalizeArray(salesOrdersQuery.data, [
    "sales_orders",
    "data",
  ]);

  const parties: Party[] = normalizeArray(partiesQuery.data, [
    "parties",
    "data",
  ]);

  const products: Product[] = normalizeArray(productsQuery.data, [
    "products",
    "data",
  ]);

  const locations: Location[] = normalizeArray(locationsQuery.data, [
    "locations",
    "data",
  ]);

  const customerOptions = parties.filter((party) => {
    const type = String(party.party_type || "").toUpperCase();

    if (party.is_active === false) return false;

    return !type || type.includes("CUSTOMER") || type.includes("BOTH");
  });

  const saleableProducts = products.filter((product) => {
    const productType = String(product.product_type || "").toUpperCase();

    if (product.is_active === false) return false;
    if (product.is_saleable === true) return true;
    if (productType === "FINISHED") return true;
    if (productType === "RAW") return true;

    return true;
  });

  const activeLocations = locations.filter(
    (location) => location.is_active !== false
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return salesOrders;

    return salesOrders.filter((row) =>
      [
        row.so_no,
        row.customer_name,
        row.status,
        row.order_date,
        row.created_by_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [salesOrders, search]);

  const totalValue = filteredRows.reduce(
    (sum, row) => sum + Number(row.so_total || 0),
    0
  );

  const detailHeader: AnyRecord | undefined =
    detailQuery.data?.sales_order ||
    detailQuery.data?.data?.sales_order ||
    detailQuery.data?.data;

  const detailLines: SalesOrderLine[] =
    detailQuery.data?.lines || detailQuery.data?.data?.lines || [];

  const detailTotal = detailLines.reduce(
    (sum, line) =>
      sum +
      Number(
        line.line_total ||
          Number(line.sell_qty || line.qty || 0) * Number(line.unit_price || 0)
    ),
    0
  );

  const detailDeliveryCount = Number(detailHeader?.delivery_count || 0);
  const canEditSelectedSalesOrder =
    Boolean(detailHeader?.so_id) &&
    String(detailHeader?.status || "").toUpperCase() === "OPEN" &&
    detailDeliveryCount === 0;

  const createFormIsValid =
    Boolean(customerId) &&
    Boolean(orderDate) &&
    salesLines.length > 0 &&
    salesLines.every(
      (line) =>
        line.product_id &&
        Number(line.sell_qty) > 0 &&
        Number(line.unit_price) >= 0
    );

  function resetCreateForm() {
    setEditingSoId(null);
    setCustomerId("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setSalesLines([
      {
        product_id: "",
        sell_qty: "",
        unit_price: "",
      },
    ]);
  }

  function openCreateSalesOrderDialog() {
    resetCreateForm();
    setIsCreateOpen(true);
  }

  function openEditSalesOrderDialog() {
    if (!detailHeader?.so_id || !canEditSelectedSalesOrder) return;

    setEditingSoId(detailHeader.so_id);
    setCustomerId(String(detailHeader.customer_id || ""));
    setOrderDate(String(detailHeader.order_date || new Date().toISOString().slice(0, 10)).slice(0, 10));
    setSalesLines(
      detailLines.length > 0
        ? detailLines.map((line) => ({
            product_id: String(line.product_id || ""),
            sell_qty: String(line.sell_qty ?? line.qty ?? ""),
            unit_price: String(line.unit_price ?? ""),
          }))
        : [
            {
              product_id: "",
              sell_qty: "",
              unit_price: "",
            },
          ]
    );
    setIsCreateOpen(true);
  }

  async function handleRefresh() {
    await Promise.all([
      salesOrdersQuery.refetch(),
      partiesQuery.refetch(),
      productsQuery.refetch(),
      locationsQuery.refetch(),
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
        fileName: `Sales_Orders_${formatDateKey()}.xlsx`,
        sheetName: "Sales Orders",
        rows: filteredRows,
        columns: [
          {
            header: "SO No",
            value: (row: SalesOrderRow) => row.so_no,
            width: 18,
            type: "text",
          },
          {
            header: "Customer",
            value: (row: SalesOrderRow) => row.customer_name || "",
            width: 28,
            type: "text",
          },
          {
            header: "Order Date",
            value: (row: SalesOrderRow) => row.order_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Status",
            value: (row: SalesOrderRow) => row.status || "",
            width: 14,
            type: "text",
          },
          {
            header: "Lines",
            value: (row: SalesOrderRow) => Number(row.line_count || 0),
            width: 10,
            type: "number",
          },
          {
            header: "Total",
            value: (row: SalesOrderRow) => Number(row.so_total || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Created By",
            value: (row: SalesOrderRow) => row.created_by_name || row.created_by || "",
            width: 24,
            type: "text",
          },
          {
            header: "Created At",
            value: (row: SalesOrderRow) => row.created_at || "",
            width: 20,
            type: "datetime",
          },
        ],
      });
    } finally {
      setIsExporting(false);
    }
  }

  function openDetails(soId: string) {
    setSelectedSoId(soId);
    setDeliveryDate(new Date().toISOString().slice(0, 10));
    setDeliveryLocationId("");
    setIsDetailsOpen(true);
  }

  function addLine() {
    setSalesLines((current) => [
      ...current,
      {
        product_id: "",
        sell_qty: "",
        unit_price: "",
      },
    ]);
  }

  function removeLine(index: number) {
    setSalesLines((current) =>
      current.filter((_, lineIndex) => lineIndex !== index)
    );
  }

  function updateLine(index: number, field: keyof NewSalesLine, value: string) {
    setSalesLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
    );
  }

  function handleSaveSalesOrder() {
    const payload = {
      customer_id: customerId,
      order_date: orderDate,
      created_by: user?.user_id || null,
      lines: salesLines.map((line) => ({
        product_id: line.product_id,
        sell_qty: Number(line.sell_qty),
        unit_price: Number(line.unit_price),
      })),
    };

    if (editingSoId) {
      updateMutation.mutate({ soId: editingSoId, payload });
      return;
    }

    createMutation.mutate(payload);
  }

  function handleCreateDeliveryFromSalesOrder() {
    if (!detailHeader?.so_id || !detailHeader.customer_id) return;
    if (!deliveryDate || !deliveryLocationId) return;

    createDeliveryMutation.mutate({
      so_id: detailHeader.so_id,
      customer_id: detailHeader.customer_id,
      delivery_date: deliveryDate,
      location_id: deliveryLocationId,
      created_by: user?.user_id || null,
    });
  }

  function handleCancelSalesOrder() {
    if (!detailHeader?.so_id) return;

    const confirmed = window.confirm(
      `Cancel sales order ${detailHeader.so_no || ""}? If a delivery was already created, delete the unposted delivery first.`
    );

    if (!confirmed) return;

    cancelMutation.mutate(detailHeader.so_id);
  }

  function handlePrintSalesOrder() {
    if (!detailHeader) return;

    const linesHtml = detailLines
      .map((line, index) => {
        const qty = Number(line.sell_qty || line.qty || 0);
        const unitPrice = Number(line.unit_price || 0);
        const lineTotal = Number(line.line_total || qty * unitPrice);

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(line.product_name || "-")}</td>
            <td>${escapeHtml(line.sku || "-")}</td>
            <td class="right">${escapeHtml(formatQty(qty))}</td>
            <td>${escapeHtml(line.sell_uom_code || line.uom_code || "KG")}</td>
            <td class="right">${escapeHtml(formatMoney(unitPrice))}</td>
            <td class="right">${escapeHtml(formatMoney(lineTotal))}</td>
          </tr>
        `;
      })
      .join("");

    const bodyHtml = `
      <div class="header">
        <h1>${escapeHtml(BUSINESS_NAME)}</h1>
        <p>${escapeHtml(BUSINESS_SUBTITLE)}</p>
      </div>

      <div class="doc-title">Sales Order / Customer Order Confirmation</div>

      <div class="grid">
        <div class="field"><div class="label">Sales Order No</div><div class="value">${escapeHtml(detailHeader.so_no || "-")}</div></div>
        <div class="field"><div class="label">Order Date</div><div class="value">${escapeHtml(formatDate(detailHeader.order_date))}</div></div>
        <div class="field"><div class="label">Customer</div><div class="value">${escapeHtml(detailHeader.customer_name || "-")}</div></div>
        <div class="field"><div class="label">Status</div><div class="value">${escapeHtml(detailHeader.status || "-")}</div></div>
        <div class="field"><div class="label">Created By</div><div class="value">${escapeHtml(detailHeader.created_by_name || detailHeader.created_by || "-")}</div></div>
        <div class="field"><div class="label">Created At</div><div class="value">${escapeHtml(formatDateTime(detailHeader.created_at))}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>SKU</th>
            <th class="right">Qty</th>
            <th>UOM</th>
            <th class="right">Unit Price</th>
            <th class="right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml || `<tr><td colspan="7" style="text-align:center;">No lines found.</td></tr>`}
          <tr class="total-row">
            <td colspan="6" class="right">Total</td>
            <td class="right">${escapeHtml(formatMoney(detailTotal))}</td>
          </tr>
        </tbody>
      </table>

      <div class="signatures">
        <div class="sig-line">Prepared By</div>
        <div class="sig-line">Checked By</div>
        <div class="sig-line">Customer Signature</div>
      </div>

      <div class="footer">
        Generated from KAM GRAINS SUPPLIES business management system.
      </div>
    `;

    openPrintableWindow(`Sales Order ${detailHeader.so_no || ""}`, bodyHtml);
  }

  function handleDownloadSalesOrderPdf() {
    handlePrintSalesOrder();
  }

  if (
    salesOrdersQuery.isLoading ||
    partiesQuery.isLoading ||
    productsQuery.isLoading ||
    locationsQuery.isLoading
  ) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    salesOrdersQuery.isError ||
    partiesQuery.isError ||
    productsQuery.isError ||
    locationsQuery.isError
  ) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Sales orders failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(
            salesOrdersQuery.error ||
              partiesQuery.error ||
              productsQuery.error ||
              locationsQuery.error
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Orders</h1>
          <p className="mt-1 text-slate-500">
            Create customer sales orders before preparing deliveries.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={
              salesOrdersQuery.isFetching ||
              partiesQuery.isFetching ||
              productsQuery.isFetching ||
              locationsQuery.isFetching
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
            </Button>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || filteredRows.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>

          <Can roles={ACTION_ROLES.CREATE_SALES_ORDER}>
            <Button onClick={openCreateSalesOrderDialog}>
              <Plus className="mr-2 h-4 w-4" />
              New Sales Order
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
            <CardTitle className="text-sm text-slate-500">
              Sales Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Order Value
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
            <Badge variant="outline" className="rounded-full">
              Integrated Business System
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Sales Order List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search sales order, customer, status..."
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
                  <TableHead>SO No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      No sales orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.so_id} onDoubleClick={() => openDetails(row.so_id)} className="cursor-pointer">
                      <TableCell className="font-medium">{row.so_no}</TableCell>
                      <TableCell>{row.customer_name || "-"}</TableCell>
                      <TableCell>{formatDate(row.order_date)}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.line_count)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.so_total)}
                      </TableCell>
                      <TableCell>
                        {row.created_by_name || row.created_by || "-"}
                      </TableCell>
                      <TableCell>{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(row.so_id)}
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
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[1100px] overflow-y-auto sm:!max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>{editingSoId ? "Edit Sales Order" : "New Sales Order"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerOptions.map((party) => (
                      <SelectItem key={party.party_id} value={party.party_id}>
                        {party.party_name}
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
            </div>

            <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
              {salesLines.map((line, index) => {
                const selectedProduct = saleableProducts.find(
                  (product) => product.product_id === line.product_id
                );

                const lineTotal =
                  Number(line.sell_qty || 0) * Number(line.unit_price || 0);

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
                        {saleableProducts.map((product) => (
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
                      placeholder="Qty KG"
                      value={line.sell_qty}
                      onChange={(event) =>
                        updateLine(index, "sell_qty", event.target.value)
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
                      disabled={salesLines.length === 1}
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
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to create sales order</AlertTitle>
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
                  setIsCreateOpen(false);
                }}
              >
                Cancel
              </Button>

              <Can roles={ACTION_ROLES.CREATE_SALES_ORDER}>
                <Button
                  onClick={handleSaveSalesOrder}
                  disabled={
                    !createFormIsValid ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {editingSoId ? "Saving..." : "Creating..."}
                    </>
                  ) : (
                    editingSoId ? "Save Sales Order" : "Create Sales Order"
                  )}
                </Button>
              </Can>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] !max-w-[1050px] overflow-y-auto sm:!max-w-[1050px]">
          <DialogHeader>
            <DialogTitle>Sales Order Details</DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load sales order</AlertTitle>
              <AlertDescription>
                {getErrorMessage(detailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailHeader ? (
            <Alert>
              <AlertTitle>No sales order data</AlertTitle>
              <AlertDescription>
                The selected sales order could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                {canEditSelectedSalesOrder && (
                  <Can roles={ACTION_ROLES.CREATE_SALES_ORDER}>
                    <Button variant="outline" onClick={openEditSalesOrderDialog}>
                      Edit
                    </Button>
                  </Can>
                )}
                <Button variant="outline" onClick={handlePrintSalesOrder}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Sales Order
                </Button>
                <Button variant="outline" onClick={handleDownloadSalesOrderPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>

              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="SO Number" value={detailHeader.so_no || "-"} />
                <InfoBox
                  label="Customer"
                  value={detailHeader.customer_name || "-"}
                />
                <InfoBox
                  label="Order Date"
                  value={formatDate(detailHeader.order_date)}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <div className="mt-1">
                    {getStatusBadge(detailHeader.status)}
                  </div>
                </div>
                <InfoBox
                  label="Created By"
                  value={
                    detailHeader.created_by_name ||
                    detailHeader.created_by ||
                    "-"
                  }
                />
                <InfoBox
                  label="Created At"
                  value={formatDateTime(detailHeader.created_at)}
                />
                <InfoBox label="Total" value={formatMoney(detailTotal)} />
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          No sales order lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <TableRow key={line.so_line_id}>
                          <TableCell className="font-medium">
                            {line.product_name || "-"}
                          </TableCell>
                          <TableCell>{line.sku || "-"}</TableCell>
                          <TableCell className="text-right">
                            {formatQty(line.sell_qty || line.qty)}
                          </TableCell>
                          <TableCell>
                            {line.sell_uom_code || line.uom_code || "KG"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(line.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(
                              line.line_total ||
                                Number(line.sell_qty || line.qty || 0) *
                                  Number(line.unit_price || 0)
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {cancelMutation.isSuccess && (
                <Alert>
                  <AlertTitle>Sales order cancelled</AlertTitle>
                  <AlertDescription>
                    This sales order is now cancelled and should not be delivered.
                  </AlertDescription>
                </Alert>
              )}

              {cancelMutation.isError && (
                <Alert variant="destructive">
                  <AlertTitle>Failed to cancel sales order</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(cancelMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {String(detailHeader?.status || "").toUpperCase() !== "OPEN" && (
                <Alert>
                  <AlertTitle>Delivery creation disabled</AlertTitle>
                  <AlertDescription>
                    Only OPEN sales orders can be converted to deliveries. Current status: {detailHeader?.status || "-"}.
                  </AlertDescription>
                </Alert>
              )}

              <Can roles={ACTION_ROLES.CREATE_DELIVERY}>
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <h3 className="mb-3 font-semibold">
                    Create Delivery from this Sales Order
                  </h3>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Delivery Date</Label>
                      <Input
                        type="date"
                        value={deliveryDate}
                        onChange={(event) =>
                          setDeliveryDate(event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Delivery Location</Label>
                      <Select
                        value={deliveryLocationId}
                        onValueChange={setDeliveryLocationId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select dispatch location" />
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
                  </div>

                  {createDeliveryMutation.isSuccess && (
                    <Alert className="mt-4">
                      <AlertTitle>Delivery created</AlertTitle>
                      <AlertDescription>
                        Open the Deliveries page to assign lots and post the
                        delivery.
                      </AlertDescription>
                    </Alert>
                  )}

                  {createDeliveryMutation.isError && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertTitle>Failed to create delivery</AlertTitle>
                      <AlertDescription>
                        {getErrorMessage(createDeliveryMutation.error)}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={handleCreateDeliveryFromSalesOrder}
                      disabled={
                        !deliveryDate ||
                        !deliveryLocationId ||
                        String(detailHeader?.status || "").toUpperCase() !== "OPEN" ||
                        createDeliveryMutation.isPending
                      }
                    >
                      {createDeliveryMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Delivery...
                        </>
                      ) : (
                        <>
                          <Truck className="mr-2 h-4 w-4" />
                          Create Delivery
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Can>

              <div className="flex justify-end gap-3 border-t pt-4">
                <Can roles={ACTION_ROLES.CREATE_SALES_ORDER}>
                  <Button
                    variant="destructive"
                    onClick={handleCancelSalesOrder}
                    disabled={
                      cancelMutation.isPending ||
                      String(detailHeader?.status || "").toUpperCase() !== "OPEN"
                    }
                  >
                    {cancelMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Cancel Sales Order
                  </Button>
                </Can>

                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
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
