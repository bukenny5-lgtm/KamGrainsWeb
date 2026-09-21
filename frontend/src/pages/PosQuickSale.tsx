import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Search, ShoppingCart, Trash2 } from "lucide-react";

import { createPosSale, getLocations, getParties, getPosProducts } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useBusinessProfile } from "@/lib/businessProfile";
import { useAuth } from "@/lib/auth";
import type { PosProduct, PosSale } from "@/types/api";

type CartLine = PosProduct & { qty: number; lot_id: string | null; configured_unit_price: PosProduct["unit_price"] };

function money(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function printReceipt(sale: PosSale, profile: { business_name?: string; company_name?: string; address?: string | null; phone?: string | null }) {
  const rows = sale.lines.map((line) => `
    <div class="line"><span>${line.product_name || line.sku || "Item"}</span><span>${money(line.line_total)}</span></div>
    <div class="subline">${line.qty} × ${money(line.unit_price)}${line.lot_code ? ` · ${line.lot_code}` : ""}</div>`).join("");
  const receipt = `<!doctype html><html><head><meta charset="utf-8"><title>${sale.sale_no}</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:80mm;margin:0;padding:4mm;font:11px Arial,sans-serif;color:#111}.center{text-align:center}.line{display:flex;justify-content:space-between;gap:4px;font-weight:600}.subline{font-size:10px;margin:1px 0 4px}.rule{border-top:1px dashed #111;margin:5px 0}.total{font-size:14px;font-weight:700}.muted{font-size:10px;color:#444}
  </style></head><body><div class="center"><strong>${profile.business_name || profile.company_name || "Business"}</strong><br>${profile.company_name || ""}<br>${profile.address || ""}<br>${profile.phone || ""}</div><div class="rule"></div><div>Receipt: ${sale.sale_no}</div><div>${new Date(sale.sale_ts).toLocaleString()}</div><div>Cashier: ${sale.cashier_name || "-"}</div>${sale.customer_name ? `<div>Customer: ${sale.customer_name}</div>` : ""}<div class="rule"></div>${rows}<div class="rule"></div><div class="line"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div><div class="line total"><span>Total</span><span>${money(sale.total_amount)}</span></div><div class="line"><span>${sale.payment_method}</span><span>${money(sale.amount_tendered)}</span></div><div class="line"><span>Change</span><span>${money(sale.change_amount)}</span></div><div class="rule"></div><div class="center muted">Thank you for your business.</div><script>window.onload=()=>{window.focus();window.print()}</script></body></html>`;
  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) return;
  win.document.open();
  win.document.write(receipt);
  win.document.close();
}

export default function PosQuickSale() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile } = useBusinessProfile();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priceOverrideReason, setPriceOverrideReason] = useState("");
  const [lastSale, setLastSale] = useState<PosSale | null>(null);

  const locationsQuery = useQuery({ queryKey: ["pos-locations"], queryFn: getLocations });
  const locationId = locationsQuery.data?.locations?.find((location: { is_active: boolean }) => location.is_active)?.location_id || locationsQuery.data?.data?.find((location: { is_active: boolean }) => location.is_active)?.location_id;
  const productsQuery = useQuery({ queryKey: ["pos-products", search, locationId], queryFn: () => getPosProducts({ q: search, location_id: locationId }), enabled: Boolean(locationId) });
  const partiesQuery = useQuery({ queryKey: ["pos-customers"], queryFn: getParties });

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.qty * Number(line.unit_price), 0), [cart]);
  const change = paymentMethod === "CASH" ? Math.max(0, Number(amountTendered || 0) - total) : 0;
  const requiresOverrideReason = profile?.pos_pricing_mode === "HYBRID" && cart.some((line) => line.unit_price !== null && line.unit_price !== undefined && line.configured_unit_price !== null && line.configured_unit_price !== undefined && Number(line.unit_price) !== Number(line.configured_unit_price));
  const saleMutation = useMutation({
    mutationFn: createPosSale,
    onSuccess: (response) => {
      const sale = response.sale as PosSale;
      setLastSale(sale);
      setCart([]);
      setAmountTendered("");
      setDueDate("");
      setPriceOverrideReason("");
      queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  function addProduct(product: PosProduct) {
    if (product.pricing_mode === "FIXED" && (product.unit_price === null || product.unit_price === undefined)) return;
    const lotId = product.track_lots ? product.lots?.[0]?.lot_id || null : null;
    setCart((current) => {
      const existing = current.find((line) => line.product_id === product.product_id && line.lot_id === lotId);
      if (existing) return current.map((line) => line === existing ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { ...product, configured_unit_price: product.unit_price, qty: 1, lot_id: lotId }];
    });
  }

  function completeSale() {
    if (!cart.length || (paymentMethod === "CREDIT" && !customerId) || (paymentMethod === "CASH" && Number(amountTendered || 0) < total)) return;
    saleMutation.mutate({
      location_id: locationId,
      customer_id: customerId || null,
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === "CASH" ? Number(amountTendered) : null,
      due_date: paymentMethod === "CREDIT" ? dueDate || null : null,
      price_override_reason: priceOverrideReason.trim() || null,
      idempotency_key: crypto.randomUUID(),
      lines: cart.map((line) => ({ product_id: line.product_id, qty: line.qty, lot_id: line.lot_id, unit_price: line.unit_price })),
    });
  }

  const products = (productsQuery.data?.products || productsQuery.data?.data || []) as PosProduct[];
  const customers = (partiesQuery.data?.parties || partiesQuery.data?.data || []).filter((party: { party_type?: string; is_active?: boolean }) => ["CUSTOMER", "BOTH"].includes(party.party_type || "") && party.is_active !== false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Quick Sale</h1><p className="text-sm text-slate-500">Online POS checkout with inventory and accounting posting.</p></div><ShoppingCart className="h-8 w-8 text-slate-400" /></div>
      {saleMutation.isError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{(saleMutation.error as Error).message}</div>}
      {lastSale && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><span>Sale {lastSale.sale_no} completed successfully.</span><div className="flex gap-2"><Button variant="outline" onClick={() => printReceipt(lastSale, profile || {})}><Printer className="mr-2 h-4 w-4" />Print Receipt</Button><Button variant="outline" onClick={() => setLastSale(null)}>New Sale</Button></div></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input autoFocus className="w-full rounded-lg border px-10 py-2.5" placeholder="Scan barcode, search SKU or product name" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <button key={product.product_id} type="button" className="rounded-xl border p-3 text-left hover:border-slate-900 disabled:cursor-not-allowed disabled:opacity-50" disabled={(product.pricing_mode === "FIXED" && (product.unit_price === null || product.unit_price === undefined)) || (product.is_stock_item && Number(product.qty_on_hand || 0) <= 0)} onClick={() => addProduct(product)}><div className="font-semibold">{product.product_name}</div><div className="text-xs text-slate-500">{product.sku} · {product.uom_code}</div><div className="mt-2 font-semibold">{product.unit_price == null ? (product.pricing_mode === "FIXED" ? "Price not configured" : "Enter price") : money(product.unit_price)}</div><div className="text-xs text-slate-500">Stock: {product.is_stock_item ? product.qty_on_hand : "Service"}</div></button>)}</div>{products.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No saleable products found.</p>}</section>
        <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Cart</h2><div className="space-y-3">{cart.map((line) => <div key={`${line.product_id}-${line.lot_id}`} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{line.product_name}</div><div className="text-xs text-slate-500">{money(line.unit_price)} each{line.lot_id ? ` · ${line.lots?.find((lot) => lot.lot_id === line.lot_id)?.lot_code || "lot"}` : ""}</div></div><button type="button" onClick={() => setCart((current) => current.filter((item) => item !== line))} aria-label="Remove line"><Trash2 className="h-4 w-4 text-red-600" /></button></div><div className="mt-2 flex items-center justify-between gap-2"><input className="w-24 rounded border px-2 py-1" type="number" min="0.001" step="0.001" value={line.qty} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, qty: Math.max(0.001, Number(event.target.value) || 0.001) } : item))} />{line.pricing_mode !== "FIXED" && <input className="w-32 rounded border px-2 py-1" type="number" min="0" step="0.01" value={line.unit_price ?? ""} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, unit_price: event.target.value === "" ? null : Number(event.target.value) } : item))} placeholder="Unit price" />}<span className="font-semibold">{money(line.qty * Number(line.unit_price || 0))}</span></div></div>)}{cart.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Add saleable products to begin.</p>}</div><div className="mt-5 space-y-3 border-t pt-4"><select className="w-full rounded-lg border px-3 py-2" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((party: { party_id: string; party_name: string }) => <option key={party.party_id} value={party.party_id}>{party.party_name}</option>)}</select><select className="w-full rounded-lg border px-3 py-2" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CREDIT">Credit</option></select>{paymentMethod === "CASH" && <input className="w-full rounded-lg border px-3 py-2" type="number" min="0" step="0.01" placeholder="Amount tendered" value={amountTendered} onChange={(event) => setAmountTendered(event.target.value)} />}{paymentMethod === "CREDIT" && <input className="w-full rounded-lg border px-3 py-2" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />}{requiresOverrideReason && <input className="w-full rounded-lg border px-3 py-2" type="text" placeholder="Override reason" value={priceOverrideReason} onChange={(event) => setPriceOverrideReason(event.target.value)} />}</div><div className="mt-5 space-y-2 border-t pt-4 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{money(total)}</span></div><div className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>{paymentMethod === "CASH" && <div className="flex justify-between"><span>Change</span><span>{money(change)}</span></div>}{paymentMethod === "CREDIT" && <div className="flex justify-between"><span>Outstanding</span><span>{money(total)}</span></div>}<Button className="mt-3 w-full" disabled={!cart.length || saleMutation.isPending || (paymentMethod === "CASH" && Number(amountTendered || 0) < total) || (paymentMethod === "CREDIT" && !customerId)} onClick={completeSale}>{saleMutation.isPending ? "Completing..." : "Complete Sale"}</Button><p className="text-xs text-slate-500">Cashier: {user?.full_name || user?.username || "-"}</p></div></section>
      </div>
    </div>
  );
}
