import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileDown,
  Loader2,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  Send,
  Truck,
  Trash2,
} from "lucide-react";

import {
  assignDeliveryLineLot,
  deleteDelivery,
  getDeliveries,
  getDeliveryById,
  getDeliveryLotOptions,
  postDelivery,
} from "@/api/client";
import { downloadXlsx } from "@/lib/excelExport";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";
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

type DeliveryRow = {
  delivery_id: string;
  delivery_no: string;
  customer_name?: string;
  so_no?: string;
  delivery_date?: string;
  transaction_date?: string;
  location_name?: string;
  status?: string;
  is_posted?: boolean;
  posted_movement_id?: string | null;
  posted_journal_id?: string | null;
  created_by_name?: string | null;
  created_by?: string | null;
  created_at?: string;
  delivery_total?: string | number;
  line_count?: string | number;
  backdate_flag?: boolean;
  backdate_reason?: string;
  backdate_approved_by?: string;
  backdate_approved_at?: string;
};

type DeliveryLine = {
  delivery_line_id: string;
  delivery_line_id_text?: string;
  product_id: string;
  sku?: string;
  product_name?: string;
  uom_code?: string;
  lot_id?: string | null;
  lot_code?: string | null;
  qty?: string | number;
  sell_qty?: string | number;
  sell_uom_code?: string;
  unit_price?: string | number;
  pieces_per_carton?: string | number | null;
  line_total?: string | number;
};

type LotOption = {
  delivery_line_id_text: string;
  lot_code: string;
  lot_id_key: string;
  expiry_date?: string | null;
  qty_on_hand?: string | number;
  required_qty?: string | number;
  enough_stock?: boolean;
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

function openPrintWindow(title: string, bodyHtml: string) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups to print or save PDF.");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            margin: 0;
            padding: 0;
            font-size: 12px;
          }
          .doc {
            width: 100%;
          }
          .top {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            border-bottom: 2px solid #111827;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .business-name {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.5px;
          }
          .subtitle {
            margin-top: 4px;
            color: #475569;
            font-size: 12px;
          }
          .doc-title {
            text-align: right;
            font-size: 20px;
            font-weight: 800;
          }
          .doc-no {
            text-align: right;
            margin-top: 4px;
            color: #475569;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px 14px;
            margin-bottom: 16px;
          }
          .box {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 8px;
            min-height: 52px;
          }
          .label {
            color: #64748b;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 4px;
          }
          .value {
            font-weight: 700;
            word-break: break-word;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 7px;
            vertical-align: top;
          }
          th {
            background: #f1f5f9;
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
          }
          .right { text-align: right; }
          .total-row td {
            font-weight: 800;
            background: #f8fafc;
          }
          .signatures {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-top: 48px;
          }
          .signature-line {
            border-top: 1px solid #111827;
            padding-top: 6px;
            text-align: center;
            color: #334155;
          }
          .footer {
            margin-top: 28px;
            border-top: 1px solid #e5e7eb;
            padding-top: 8px;
            color: #64748b;
            font-size: 10px;
            text-align: center;
          }
          @media print {
            .no-print { display: none; }
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
    </html>
  `);

  printWindow.document.close();
}

function getStatusBadge(status: string | undefined) {
  const text = String(status || "UNKNOWN").toUpperCase();

  if (text === "POSTED" || text === "COMPLETED") {
    return <Badge className="bg-green-600 hover:bg-green-600">{text}</Badge>;
  }

  if (text === "DELIVERED") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">DELIVERED</Badge>;
  }

  if (text === "CANCELLED" || text === "CANCELED") {
    return <Badge variant="destructive">{text}</Badge>;
  }

  return <Badge variant="outline">{text}</Badge>;
}

function getBackdatedBadge(row: DeliveryRow) {
  return row.backdate_flag ? (
    <Badge variant="outline" className="border-yellow-500 text-yellow-700">
      Backdated
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-300 text-slate-500">
      Normal
    </Badge>
  );
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

export default function Deliveries() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(
    null
  );
  const [selectedDeliveryNo, setSelectedDeliveryNo] = useState<string | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const deliveriesQuery = useQuery({
    queryKey: ["deliveries"],
    queryFn: getDeliveries,
  });

  const detailQuery = useQuery({
    queryKey: ["delivery-detail", selectedDeliveryId],
    queryFn: () => getDeliveryById(selectedDeliveryId as string),
    enabled: Boolean(selectedDeliveryId && isDetailsOpen),
  });

  const postMutation = useMutation({
    mutationFn: postDelivery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      await queryClient.invalidateQueries({
        queryKey: ["delivery-detail", selectedDeliveryId],
      });
      setLastRefreshed(new Date());
    },
  });

  const assignLotMutation = useMutation({
    mutationFn: ({
      deliveryLineId,
      lotId,
    }: {
      deliveryLineId: string;
      lotId: string;
    }) => assignDeliveryLineLot(deliveryLineId, { lot_id: lotId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["delivery-detail", selectedDeliveryId],
      });
      setLastRefreshed(new Date());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDelivery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      setIsDetailsOpen(false);
      setSelectedDeliveryId(null);
      setSelectedDeliveryNo(null);
      setLastRefreshed(new Date());
    },
  });

  const deliveries: DeliveryRow[] = normalizeArray(deliveriesQuery.data, [
    "deliveries",
    "data",
  ]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return deliveries;

    return deliveries.filter((row) =>
      [
        row.delivery_no,
        row.customer_name,
        row.so_no,
        row.status,
        row.location_name,
        row.transaction_date,
        row.backdate_reason,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [deliveries, search]);

  const totalValue = filteredRows.reduce(
    (sum, row) => sum + Number(row.delivery_total || 0),
    0
  );

  const detailHeader =
    detailQuery.data?.delivery ||
    detailQuery.data?.data?.delivery ||
    detailQuery.data?.data;

  const detailLines: DeliveryLine[] =
    detailQuery.data?.lines || detailQuery.data?.data?.lines || [];

  async function handleRefresh() {
    await deliveriesQuery.refetch();
    setLastRefreshed(new Date());
  }

  async function handleExportExcel() {
    if (filteredRows.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadXlsx({
        fileName: `Deliveries_${formatDateKey()}.xlsx`,
        sheetName: "Deliveries",
        rows: filteredRows,
        columns: [
          {
            header: "Delivery No",
            value: (row: DeliveryRow) => row.delivery_no,
            width: 18,
            type: "text",
          },
          {
            header: "Customer",
            value: (row: DeliveryRow) => row.customer_name || "",
            width: 26,
            type: "text",
          },
          {
            header: "SO No",
            value: (row: DeliveryRow) => row.so_no || "",
            width: 18,
            type: "text",
          },
          {
            header: "Delivery Date",
            value: (row: DeliveryRow) => row.delivery_date || "",
            width: 14,
            type: "date",
          },
          {
            header: "Transaction Date",
            value: (row: DeliveryRow) => row.transaction_date || "",
            width: 16,
            type: "date",
          },
          {
            header: "Location",
            value: (row: DeliveryRow) => row.location_name || "",
            width: 22,
            type: "text",
          },
          {
            header: "Status",
            value: (row: DeliveryRow) => row.status || "",
            width: 14,
            type: "text",
          },
          {
            header: "Posted Status",
            value: (row: DeliveryRow) => (row.is_posted ? "Posted" : "Not Posted"),
            width: 14,
            type: "text",
          },
          {
            header: "Backdated",
            value: (row: DeliveryRow) => (row.backdate_flag ? "Yes" : "No"),
            width: 12,
            type: "text",
          },
          {
            header: "Backdate Reason",
            value: (row: DeliveryRow) => row.backdate_reason || "",
            width: 24,
            type: "text",
          },
          {
            header: "Lines",
            value: (row: DeliveryRow) => Number(row.line_count || 0),
            width: 10,
            type: "number",
          },
          {
            header: "Total",
            value: (row: DeliveryRow) => Number(row.delivery_total || 0),
            width: 16,
            type: "number",
          },
          {
            header: "Created By",
            value: (row: DeliveryRow) => row.created_by_name || row.created_by || "",
            width: 24,
            type: "text",
          },
          {
            header: "Created At",
            value: (row: DeliveryRow) => row.created_at || "",
            width: 20,
            type: "datetime",
          },
        ],
      });
    } finally {
      setIsExporting(false);
    }
  }

  function openDetails(row: DeliveryRow) {
    setSelectedDeliveryId(row.delivery_id);
    setSelectedDeliveryNo(row.delivery_no);
    setIsDetailsOpen(true);
  }

  function handlePostDelivery() {
    if (!selectedDeliveryNo) return;

    const confirmed = window.confirm(
      `Post delivery ${selectedDeliveryNo}? This will reduce stock and create posting references.`
    );

    if (!confirmed) return;

    postMutation.mutate(selectedDeliveryNo);
  }

  function handleDeleteDelivery() {
    if (!selectedDeliveryNo) return;

    const confirmed = window.confirm(
      `Delete unposted delivery ${selectedDeliveryNo}? Use this only for mistaken deliveries that have not been posted.`
    );

    if (!confirmed) return;

    deleteMutation.mutate(selectedDeliveryNo);
  }

  function handlePrintDelivery() {
    if (!detailHeader) return;

    const deliveryTotal = detailLines.reduce(
      (sum, line) =>
        sum +
        Number(
          line.line_total ||
            Number(line.sell_qty || line.qty || 0) * Number(line.unit_price || 0)
        ),
      0
    );

    const lineRows = detailLines
      .map((line, index) => {
        const qty = Number(line.sell_qty || line.qty || 0);
        const unitPrice = Number(line.unit_price || 0);
        const lineTotal = Number(line.line_total || qty * unitPrice);

        return `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtml(line.product_name || "-")}</strong><br/>
              <span style="color:#64748b;">${escapeHtml(line.sku || "")}</span>
            </td>
            <td>${escapeHtml(line.lot_code || "-")}</td>
            <td class="right">${escapeHtml(formatQty(qty))}</td>
            <td>${escapeHtml(line.sell_uom_code || line.uom_code || "KG")}</td>
            <td class="right">${escapeHtml(formatMoney(unitPrice))}</td>
            <td class="right">${escapeHtml(formatMoney(lineTotal))}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <div class="doc">
        <div class="top">
          <div>
            <div class="business-name">${BUSINESS_NAME}</div>
            <div class="subtitle">${BUSINESS_SUBTITLE}</div>
            <div class="subtitle">Local web-based ERP for purchasing, inventory, sales, finance, and reporting.</div>
          </div>
          <div>
            <div class="doc-title">DELIVERY NOTE</div>
            <div class="doc-no">${escapeHtml(detailHeader.delivery_no || "-")}</div>
          </div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="label">Customer</div>
            <div class="value">${escapeHtml(detailHeader.customer_name || "-")}</div>
          </div>
          <div class="box">
            <div class="label">Sales Order</div>
            <div class="value">${escapeHtml(detailHeader.so_no || "-")}</div>
          </div>
          <div class="box">
            <div class="label">Delivery Date</div>
            <div class="value">${escapeHtml(formatDate(detailHeader.delivery_date))}</div>
          </div>
          <div class="box">
            <div class="label">Location</div>
            <div class="value">${escapeHtml(detailHeader.location_name || "-")}</div>
          </div>
          <div class="box">
            <div class="label">Status</div>
            <div class="value">${escapeHtml(detailHeader.status || "-")}</div>
          </div>
          <div class="box">
            <div class="label">Posted</div>
            <div class="value">${detailHeader.is_posted ? "Yes" : "No"}</div>
          </div>
          <div class="box">
            <div class="label">Movement ID</div>
            <div class="value">${escapeHtml(detailHeader.posted_movement_id || "-")}</div>
          </div>
          <div class="box">
            <div class="label">Journal ID</div>
            <div class="value">${escapeHtml(detailHeader.posted_journal_id || "-")}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>Product</th>
              <th>Lot</th>
              <th class="right">Qty</th>
              <th>UOM</th>
              <th class="right">Unit Price</th>
              <th class="right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              lineRows ||
              `<tr><td colspan="7" style="text-align:center;">No delivery lines found.</td></tr>`
            }
            <tr class="total-row">
              <td colspan="6" class="right">Total Delivery Value</td>
              <td class="right">${escapeHtml(formatMoney(deliveryTotal))}</td>
            </tr>
          </tbody>
        </table>

        <div class="signatures">
          <div class="signature-line">Prepared By</div>
          <div class="signature-line">Delivered By</div>
          <div class="signature-line">Received By / Customer</div>
        </div>

        <div class="footer">
          Printed from ${BUSINESS_NAME} on ${escapeHtml(new Date().toLocaleString())}
        </div>
      </div>
    `;

    openPrintWindow(
      `${BUSINESS_NAME} Delivery Note - ${detailHeader.delivery_no || ""}`,
      html
    );
  }

  if (deliveriesQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (deliveriesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Deliveries failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(deliveriesQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deliveries</h1>
          <p className="mt-1 text-slate-500">
            View deliveries, assign lots, and post deliveries to reduce stock.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={deliveriesQuery.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {deliveriesQuery.isFetching ? "Refreshing..." : "Refresh"}
        </Button>

        <Button
          variant="outline"
          onClick={handleExportExcel}
          disabled={isExporting || filteredRows.length === 0}
        >
          <FileDown className="mr-2 h-4 w-4" />
          {isExporting ? "Exporting..." : "Export Excel"}
        </Button>
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
              Deliveries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Delivery Value
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
            <Truck className="h-5 w-5" />
            Delivery List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search delivery, customer, SO, status, location..."
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
                  <TableHead>Delivery No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>SO No</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Transaction Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Backdated</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="h-24 text-center">
                      No deliveries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={row.delivery_id}
                      className="cursor-pointer"
                      onDoubleClick={() => openDetails(row)}
                    >
                      <TableCell className="font-medium">
                        {row.delivery_no}
                      </TableCell>
                      <TableCell>{row.customer_name || "-"}</TableCell>
                      <TableCell>{row.so_no || "-"}</TableCell>
                      <TableCell>{formatDate(row.delivery_date)}</TableCell>
                      <TableCell>{formatDate(row.transaction_date)}</TableCell>
                      <TableCell>{row.location_name || "-"}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell>
                        {row.is_posted ? (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            Posted
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not Posted</Badge>
                        )}
                      </TableCell>
                      <TableCell>{getBackdatedBadge(row)}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(row.line_count)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.delivery_total)}
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

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1200px] overflow-y-auto sm:!max-w-[1200px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Delivery Details
            </DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load delivery</AlertTitle>
              <AlertDescription>
                {getErrorMessage(detailQuery.error)}
              </AlertDescription>
            </Alert>
          ) : !detailHeader ? (
            <Alert>
              <AlertTitle>No delivery data</AlertTitle>
              <AlertDescription>
                The selected delivery could not be found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {detailHeader.delivery_no}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Customer:{" "}
                    <span className="font-medium text-slate-900">
                      {detailHeader.customer_name || "-"}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDetailsOpen(false)}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>

                  <Button variant="outline" size="sm" onClick={handlePrintDelivery}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Delivery Note
                  </Button>

                  <Button variant="outline" size="sm" onClick={handlePrintDelivery}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>

                  {getStatusBadge(detailHeader.status)}

                  {detailHeader.is_posted ? (
                    <Badge className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Posted
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Posted</Badge>
                  )}

                  <Can roles={ACTION_ROLES.POST_DELIVERY}>
                    <Button
                      onClick={handlePostDelivery}
                      disabled={
                        Boolean(detailHeader.is_posted) || postMutation.isPending
                      }
                    >
                      {postMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Post Delivery
                    </Button>
                  </Can>
                </div>
              </div>

              {postMutation.isSuccess && (
                <Alert>
                  <PackageCheck className="h-4 w-4" />
                  <AlertTitle>Delivery posted</AlertTitle>
                  <AlertDescription>
                    Stock movement and journal references have been refreshed.
                  </AlertDescription>
                </Alert>
              )}

              {postMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to post delivery</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(postMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {assignLotMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to assign lot</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(assignLotMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {deleteMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to delete delivery</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(deleteMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 md:grid-cols-4">
                <InfoBox label="SO No" value={detailHeader.so_no || "-"} />
                <InfoBox
                  label="Delivery Date"
                  value={formatDate(detailHeader.delivery_date)}
                />
                <InfoBox
                  label="Transaction Date"
                  value={formatDate(detailHeader.transaction_date)}
                />
                <InfoBox
                  label="Location"
                  value={detailHeader.location_name || "-"}
                />
                <InfoBox
                  label="Backdated"
                  value={detailHeader.backdate_flag ? "Yes" : "No"}
                />
                <InfoBox
                  label="Backdate Reason"
                  value={detailHeader.backdate_reason || "-"}
                />
                <InfoBox
                  label="Approved By"
                  value={
                    detailHeader.backdate_approved_by
                      ? "User ID: " + detailHeader.backdate_approved_by
                      : "-"
                  }
                />
                <InfoBox
                  label="Approved At"
                  value={formatDateTime(detailHeader.backdate_approved_at)}
                />
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
                <InfoBox
                  label="Movement ID"
                  value={detailHeader.posted_movement_id || "-"}
                />
                <InfoBox
                  label="Journal ID"
                  value={detailHeader.posted_journal_id || "-"}
                />
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                      <TableHead>Assign Lot</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {detailLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          No delivery lines found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailLines.map((line) => (
                        <DeliveryLineRow
                          key={line.delivery_line_id}
                          line={line}
                          isPosted={Boolean(detailHeader.is_posted)}
                          onAssignLot={(lotId) =>
                            assignLotMutation.mutate({
                              deliveryLineId: line.delivery_line_id,
                              lotId,
                            })
                          }
                          isAssigningLot={assignLotMutation.isPending}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                {!Boolean(detailHeader.is_posted) && (
                  <Can roles={ACTION_ROLES.DELETE}>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteDelivery}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete Draft Delivery
                    </Button>
                  </Can>
                )}

                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <Button variant="outline" onClick={handlePrintDelivery}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Delivery Note
                </Button>

                <Button variant="outline" onClick={handlePrintDelivery}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeliveryLineRow({
  line,
  isPosted,
  onAssignLot,
  isAssigningLot,
}: {
  line: DeliveryLine;
  isPosted: boolean;
  onAssignLot: (lotId: string) => void;
  isAssigningLot: boolean;
}) {
  const lineIdText = line.delivery_line_id_text || line.delivery_line_id;

  const lotOptionsQuery = useQuery({
    queryKey: ["delivery-line-lot-options", lineIdText],
    queryFn: () => getDeliveryLotOptions(lineIdText),
    enabled: Boolean(lineIdText && !isPosted),
  });

  const lotOptions: LotOption[] = normalizeArray(lotOptionsQuery.data, [
    "lot_options",
    "data",
  ]);

  const stockStatus =
    lotOptionsQuery.data?.stock_status ||
    lotOptionsQuery.data?.data?.stock_status ||
    null;

  const requiredQty = Number(
    stockStatus?.required_qty || line.sell_qty || line.qty || 0
  );

  const availableQty = Number(
    stockStatus?.available_qty ||
      lotOptions.reduce((sum, lot) => sum + Number(lot.qty_on_hand || 0), 0)
  );

  const hasEnoughLot = lotOptions.some((lot) =>
    Boolean(lot.enough_stock || Number(lot.qty_on_hand || 0) >= requiredQty)
  );

  const notEnoughStock =
    !lotOptionsQuery.isLoading &&
    !line.lot_id &&
    requiredQty > 0 &&
    !hasEnoughLot;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{line.product_name || "-"}</div>
        <div className="text-xs text-slate-500">{line.sku || ""}</div>
      </TableCell>

      <TableCell>
        {line.lot_code ? (
          <Badge variant="outline">{line.lot_code}</Badge>
        ) : (
          <Badge variant="destructive">No Lot</Badge>
        )}
      </TableCell>

      <TableCell className="text-right">
        {formatQty(line.sell_qty || line.qty)}
      </TableCell>

      <TableCell>{line.sell_uom_code || line.uom_code || "KG"}</TableCell>

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

      <TableCell className="min-w-64">
        {isPosted ? (
          <span className="text-sm text-slate-500">Posted</span>
        ) : (
          <Can
            roles={ACTION_ROLES.POST_DELIVERY}
            fallback={
              <span className="text-sm text-slate-500">
                No permission to assign lot
              </span>
            }
          >
            <Select
              disabled={lotOptionsQuery.isLoading || isAssigningLot || notEnoughStock}
              value={line.lot_id || ""}
              onValueChange={(value) => {
                if (value && value !== "NO_LOTS") {
                  onAssignLot(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    lotOptionsQuery.isLoading
                      ? "Loading lots..."
                      : notEnoughStock
                        ? "Not enough stock"
                        : "Select lot"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {lotOptions.length === 0 ? (
                  <SelectItem value="NO_LOTS" disabled>
                    No lots available
                  </SelectItem>
                ) : (
                  lotOptions.map((lot) => (
                    <SelectItem
                      key={lot.lot_id_key}
                      value={lot.lot_id_key}
                      disabled={
                        !(lot.enough_stock || Number(lot.qty_on_hand || 0) >= requiredQty)
                      }
                    >
                      {lot.lot_code} | Stock: {formatQty(lot.qty_on_hand)}
                      {lot.expiry_date
                        ? ` | Exp: ${formatDate(lot.expiry_date)}`
                        : ""}
                      {!(lot.enough_stock || Number(lot.qty_on_hand || 0) >= requiredQty)
                        ? " | Not enough"
                        : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {notEnoughStock && (
              <p className="mt-2 text-xs font-medium text-red-600">
                Not enough stock. Required: {formatQty(requiredQty)} KG,
                Available: {formatQty(availableQty)} KG. Reduce the delivery
                quantity or add more stock first.
              </p>
            )}
          </Can>
        )}
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
