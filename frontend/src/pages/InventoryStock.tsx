import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw, Search, X } from "lucide-react";

import { getProductCategories, getStockDetail, getStockOnHand } from "@/api/client";
import { getBranches, getLocationsForBranch } from "@/api/client";
import { useOperatingContext } from "@/lib/operatingContext";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────
type StockRow = {
  branch_id: string;
  branch_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  uom_code: string;
  lot_id: string;
  lot_code: string;
  expiry_date: string | null;
  location_id: string;
  location_code: string;
  location_name: string;
  location_type: string;
  location_is_saleable: boolean;
  category_id?: string | null;
  category_code?: string | null;
  category_name?: string | null;
  unit_cost?: string | null;
  qty_on_hand: string;
  lot_status?: string; // 'ACTIVE' | 'CLOSED' | 'EXPIRED' | undefined
};

type ApiResponse = {
  success: boolean;
  count: number;
  data: StockRow[];
};

// ─── Helpers ──────────────────────────────────────────────
function formatQty(value: unknown) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function getLotStatusBadge(status: string | undefined) {
  const text = (status || "").toUpperCase();

  switch (text) {
    case "ACTIVE":
      return <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>;
    case "CLOSED":
      return <Badge variant="destructive">Closed</Badge>;
    case "EXPIRED":
      return <Badge className="bg-yellow-600 hover:bg-yellow-600">Expired</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

function getStatusDescription(showClosed: boolean) {
  return showClosed ? "Showing all lots (including closed/expired)" : "Showing active lots with stock > 0";
}

// ─── Component ────────────────────────────────────────────
export default function InventoryStock() {
  const { currentBranch } = useOperatingContext();
  const [search, setSearch] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedRow, setSelectedRow] = useState<StockRow | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showClosedLots, setShowClosedLots] = useState(false);

  // ── Query ──
  const branchesQuery = useQuery({ queryKey: ["stock-visibility-branches"], queryFn: () => getBranches(true) });
  const categoriesQuery = useQuery({ queryKey: ["stock-visibility-categories"], queryFn: getProductCategories });
  const branchId = selectedBranchId || currentBranch?.branch_id || branchesQuery.data?.branches?.[0]?.branch_id || "";
  const locationsQuery = useQuery({ queryKey: ["stock-visibility-locations", branchId], queryFn: () => getLocationsForBranch(branchId, true), enabled: Boolean(branchId) });
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<
    ApiResponse
  >({
    queryKey: ["stock-on-hand", { include_closed: showClosedLots, branch_id: branchId, location_id: selectedLocationId, category_id: selectedCategoryId }],
    queryFn: () => getStockOnHand({ include_closed: showClosedLots, branch_id: branchId, location_id: selectedLocationId || null, category_id: selectedCategoryId || null }),
  });
  const detailQuery = useQuery({ queryKey: ["stock-detail", selectedRow?.product_id, selectedRow?.location_id, selectedRow?.lot_id, selectedRow?.branch_id], queryFn: () => getStockDetail(selectedRow!.product_id, selectedRow!.location_id, selectedRow!.lot_id,selectedRow!.branch_id), enabled: Boolean(selectedRow) });

  // ── Derived state ──
  const rows = useMemo(() => data?.data || [], [data]);
  const totalQty = useMemo(() => {
    return rows.reduce((sum, row) => sum + Number(row.qty_on_hand || 0), 0);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.sku,
        row.product_name,
        row.lot_code,
        row.location_code,
        row.location_name,
        row.lot_status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  // ── Handlers ──
  async function handleRefresh() {
    await refetch();
    setLastRefreshed(new Date());
  }

  function clearSearch() {
    setSearch("");
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Inventory failed to load</AlertTitle>
        <AlertDescription>
          {(error as Error)?.message || "Check backend connection."}
        </AlertDescription>
      </Alert>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock On Hand</h1>
          <p className="mt-1 text-slate-500">
            Current stock balance by product, lot, and location.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="show-closed-lots"
                checked={showClosedLots}
                onChange={(e) => setShowClosedLots(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="show-closed-lots" className="text-sm text-slate-700">
                Show Closed / Expired Lots
              </label>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCcw
                className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />
              {isFetching ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {lastRefreshed && (
            <p className="text-xs text-slate-500">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Rows</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredRows.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Total Qty</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatQty(totalQty)} KG</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="rounded-full">
              {getStatusDescription(showClosedLots)}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle>Inventory Balance</CardTitle>

          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm">Branch
              <select className="ml-2 h-10 rounded-md border bg-white px-3" value={branchId} onChange={(e) => { setSelectedBranchId(e.target.value); setSelectedLocationId(""); }}>
                {(branchesQuery.data?.branches || []).map((branch: {branch_id:string;branch_name:string}) => <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>)}
              </select>
            </label>
            <label className="text-sm">Location
              <select className="ml-2 h-10 rounded-md border bg-white px-3" value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)}>
                <option value="">All authorized locations</option>
                {(locationsQuery.data?.locations || []).map((location: {location_id:string;location_name:string}) => <option key={location.location_id} value={location.location_id}>{location.location_name}</option>)}
              </select>
            </label>
            <label className="text-sm">Category
              <select className="ml-2 h-10 rounded-md border bg-white px-3" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                <option value="">All Categories</option>
                {(categoriesQuery.data?.categories || []).filter((category: any) => category.is_active !== false).map((category: any) => <option key={category.category_id} value={category.category_id}>{category.category_code} - {category.category_name}</option>)}
              </select>
            </label>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search product, SKU, lot, location, status..."
                className="pl-9 pr-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      {search ? (
                        <div>
                          <p className="text-slate-500">No stock found matching your search.</p>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={clearSearch}
                            className="mt-1"
                          >
                            Clear search
                          </Button>
                        </div>
                      ) : (
                        <p className="text-slate-500">
                          {showClosedLots
                            ? "No lots found."
                            : "No active lots with positive stock."}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow
                      key={`${row.product_id}-${row.lot_id}-${row.location_id}`}
                      onClick={() => setSelectedKey(`${row.product_id}-${row.lot_id}-${row.location_id}`)}
                      onDoubleClick={() => setSelectedRow(row)}
                      className={`cursor-pointer ${selectedKey === `${row.product_id}-${row.lot_id}-${row.location_id}` ? "bg-slate-100" : ""}`}
                    >
                      <TableCell className="font-medium">{row.sku}</TableCell>
                      <TableCell>{row.product_name}</TableCell>
                      <TableCell>{row.lot_code}</TableCell>
                      <TableCell>{row.location_name}</TableCell>
                      <TableCell>
                        {row.expiry_date
                          ? new Date(row.expiry_date).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>{getLotStatusBadge(row.lot_status)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatQty(row.qty_on_hand)}
                      </TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setSelectedRow(row); }}>View</Button></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredRows.length > 0 && (
            <div className="mt-4 text-sm text-slate-500">
              Showing {filteredRows.length} of {rows.length} stock records
            </div>
          )}
        </CardContent>
      </Card>
      {selectedRow && <div role="dialog" aria-modal="true" aria-label="Stock detail" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedRow(null)}>
        <Card className="w-full max-w-xl" onClick={(event) => event.stopPropagation()}><CardHeader><CardTitle>Stock Detail</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <p><b>Product:</b> {selectedRow.product_name}</p><p><b>SKU:</b> {selectedRow.sku}</p><p><b>Branch:</b> {selectedRow.branch_name}</p><p><b>Location:</b> {selectedRow.location_name} ({selectedRow.location_type})</p><p><b>Saleable:</b> {selectedRow.location_is_saleable ? "Yes" : "No"}</p><p><b>On hand:</b> {formatQty(selectedRow.qty_on_hand)} {selectedRow.uom_code}</p><p><b>Lot:</b> {selectedRow.lot_code || "—"}</p><p><b>Expiry:</b> {selectedRow.expiry_date ? new Date(selectedRow.expiry_date).toLocaleDateString() : "—"}</p><p><b>Unit cost:</b> {selectedRow.unit_cost == null ? "Restricted" : Number(selectedRow.unit_cost).toLocaleString()}</p>
          <div className="sm:col-span-2"><b>Recent Movements</b>{detailQuery.isLoading?<p>Loading…</p>:detailQuery.data?.data?.recent_movements?.length?<ul className="mt-2 space-y-1">{detailQuery.data.data.recent_movements.map((movement:any)=><li key={movement.movement_id}>{movement.document_no} · {movement.movement_type} · {formatQty(movement.qty)} · {new Date(movement.created_at).toLocaleString()}</li>)}</ul>:<p className="mt-1 text-slate-500">No recent movements.</p>}</div><div className="sm:col-span-2 flex justify-end"><Button onClick={() => setSelectedRow(null)}>Close</Button></div>
        </CardContent></Card>
      </div>}
    </div>
  );
}
