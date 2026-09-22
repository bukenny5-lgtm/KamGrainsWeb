import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  Boxes,
  Cable,
  ClipboardList,
  Factory,
  FileText,
  Home,
  Landmark,
  LogOut,
  PackageCheck,
  Receipt,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  UserCircle,
  UserCog,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ROLE_GROUPS, roleList } from "@/lib/permissions";
import { useBusinessProfile } from "@/lib/businessProfile";
import { useBusinessFeatures } from "@/lib/businessFeatures";
import { useOperatingContext } from "@/lib/operatingContext";
import type { BusinessFeatureCode } from "@/types/api";

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: string[];
  feature?: BusinessFeatureCode;
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    path: "/",
    icon: Home,
  roles: roleList(ROLE_GROUPS.ALL_USERS),
    feature: undefined,
  },
  {
    label: "Inventory",
    path: "/inventory",
    icon: Boxes,
    roles: roleList(ROLE_GROUPS.INVENTORY_VIEW_ACCESS),
    feature: "inventory",
  },
  {
    label: "Stock Movements",
    path: "/stock-movements",
    icon: ArrowRightLeft,
    roles: roleList(ROLE_GROUPS.INVENTORY_VIEW_ACCESS),
    feature: "inventory",
  },
  { label: "Internal Stock Requests", path: "/stock-requests", icon: ClipboardList, roles: ["ADMIN","MANAGER","INVENTORY","PURCHASING","HEAD_OFFICE"], feature: "inventory" },
  { label: "Inter-Site Transfers", path: "/stock-transfers", icon: ArrowRightLeft, roles: ["ADMIN","MANAGER","INVENTORY","HEAD_OFFICE"], feature: "inventory" },
  {
    label: "Purchasing",
    path: "/purchasing",
    icon: ShoppingCart,
    roles: roleList(ROLE_GROUPS.PURCHASING_ACCESS),
    feature: "purchasing",
  },
  {
    label: "GRN",
    path: "/grn",
    icon: PackageCheck,
    roles: roleList(ROLE_GROUPS.PURCHASING_ACCESS),
    feature: "purchasing",
  },
  {
    label: "Cleaning Batches",
    path: "/cleaning",
    icon: Factory,
    roles: roleList(ROLE_GROUPS.INVENTORY_ACCESS),
    feature: "cleaning",
  },
  {
    label: "Sales",
    path: "/sales",
    icon: Receipt,
    roles: roleList(ROLE_GROUPS.SALES_ACCESS),
    feature: "sales",
  },
  {
    label: "Quick Sale",
    path: "/pos",
    icon: ShoppingCart,
    roles: roleList(ROLE_GROUPS.POS_ACCESS),
    feature: "pos",
  },
  {
    label: "Deliveries",
    path: "/deliveries",
    icon: Truck,
    roles: roleList(ROLE_GROUPS.SALES_ACCESS),
    feature: "sales",
  },
  {
    label: "AR Invoices",
    path: "/ar-invoices",
    icon: FileText,
    roles: roleList(ROLE_GROUPS.SALES_ACCESS),
    feature: "sales",
  },
  {
    label: "Customer Returns",
    path: "/customer-returns",
    icon: Receipt,
    roles: roleList(ROLE_GROUPS.SALES_ACCESS),
    feature: "sales",
  },
  {
    label: "Receipts",
    path: "/receipts",
    icon: ReceiptText,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "AP Invoices",
    path: "/ap-invoices",
    icon: FileText,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "AP Payments",
    path: "/ap-payments",
    icon: ReceiptText,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "Expense Vouchers",
    path: "/expense-vouchers",
    icon: ReceiptText,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "Payment Accounts",
    path: "/payment-accounts",
    icon: WalletCards,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "Reconciliation",
    path: "/reconciliations",
    icon: Landmark,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "API Payment Channels",
    path: "/api-payment-channels",
    icon: Cable,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "Opening Balances",
    path: "/opening-balances",
    icon: FileText,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "Accrued Expenses",
    path: "/accrued-expenses",
    icon: FileText,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
    feature: "finance",
  },
  {
    label: "Finance",
    path: "/finance",
    icon: WalletCards,
    roles: roleList(ROLE_GROUPS.FINANCE_ACCESS),
  },
  {
    label: "Journals",
    path: "/journals",
    icon: FileText,
    roles: roleList(ROLE_GROUPS.JOURNAL_ACCESS),
    feature: "finance",
  },
  {
    label: "Reports",
    path: "/reports",
    icon: BarChart3,
    roles: roleList(ROLE_GROUPS.REPORT_ACCESS),
    feature: "reports",
  },
  {
    label: "Stock Count",
    path: "/stock-count",
    icon: ClipboardList,
    roles: roleList(ROLE_GROUPS.INVENTORY_ACCESS),
    feature: "inventory",
  },
  {
    label: "Stock Adjustments",
    path: "/stock-adjustments",
    icon: ArrowRightLeft,
    roles: roleList(ROLE_GROUPS.INVENTORY_ACCESS),
    feature: "inventory",
  },
  {
    label: "Setup",
    path: "/setup",
    icon: Settings,
    roles: roleList(ROLE_GROUPS.SETUP_ACCESS),
  },
  {
    label: "Users & Roles",
    path: "/users",
    icon: UserCog,
    roles: roleList(ROLE_GROUPS.USER_ACCESS),
  },
  {
    label: "Audit Log",
    path: "/audit-log",
    icon: Activity,
    roles: roleList(ROLE_GROUPS.AUDIT_ACCESS),
  },
];

const pageSubtitles: Record<string, string> = {
  "/": "Integrated business management system for KAM GRAINS SUPPLIES",
  "/inventory": "Monitor stock balances by product, lot, and location.",
  "/stock-requests": "Request internal replenishment and track approval and outstanding supply.",
  "/stock-transfers": "Dispatch and receive inventory through transit with recorded variances.",
  "/stock-movements": "Review inventory movement history and audit stock flow.",
  "/purchasing": "Create and track supplier purchase orders.",
  "/grn": "Receive supplier goods and post stock into inventory.",
  "/cleaning": "Manage cleaning, processing, output, waste, and batch costing.",
  "/sales": "Create customer sales orders before delivery.",
  "/pos": "Complete fast online sales with stock and accounting posting.",
  "/deliveries": "Assign lots, dispatch goods, and reduce stock.",
  "/ar-invoices": "Create and post customer invoices.",
  "/customer-returns": "Return posted POS or delivery-sale items with audit-safe inventory and accounting reversals.",
  "/receipts": "Record customer receipts and apply payments to invoices.",
  "/ap-invoices": "Create and post supplier invoices.",
  "/ap-payments": "Record supplier payments and control cash/bank balances.",
  "/expense-vouchers": "Record and post business expenses.",
  "/payment-accounts": "Control cash, mobile money, and bank payment accounts.",
  "/reconciliations": "Match statement lines against system payment account transactions.",
  "/opening-balances": "Record go-live opening balances.",
  "/accrued-expenses": "Record expense payables and settle accrued expenses.",
  "/finance": "Review ledger, trial balance, profit and loss, and balance sheet.",
  "/journals": "Create and review accounting journals.",
  "/reports": "View business, finance, and operational reports.",
  "/stock-count": "Perform stock counts and post inventory variances.",
  "/stock-adjustments": "Record damage, losses, gains, and stock corrections.",
  "/setup": "Manage products, parties, locations, and units of measure.",
  "/users": "Manage system users, roles, and access control.",
  "/audit-log": "Monitor user activity and posting audit history.",
};

function getPageTitle(pathname: string) {
  const matched =
    navItems.find((item) => item.path === pathname) ||
    navItems.find((item) => pathname.startsWith(item.path) && item.path !== "/");

  return matched?.label || "Business Dashboard";
}

function getPageSubtitle(pathname: string) {
  return (
    pageSubtitles[pathname] ||
    "Integrated business management system for KAM GRAINS SUPPLIES"
  );
}

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const { data: businessProfile } = useBusinessProfile();
  const { hasFeature } = useBusinessFeatures();
  const operating = useOperatingContext();
  const location = useLocation();

  const visibleNavItems = navItems.filter((item) => hasRole(item.roles) && (!item.feature || hasFeature(item.feature)));
  const pageTitle = getPageTitle(location.pathname);
  const pageSubtitle = getPageSubtitle(location.pathname);

  useEffect(() => {
    document.title = `${pageTitle} - ${businessProfile.business_name}`;
  }, [businessProfile.business_name, pageTitle]);

  function handleLogout() {
    const confirmed = window.confirm("Are you sure you want to logout?");

    if (confirmed) {
      logout();
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-20 shrink-0 items-center border-b px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {businessProfile.business_name}
            </h1>
            <p className="text-xs text-slate-500">
              Integrated Business System
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                  ].join(" ")
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="shrink-0 border-t bg-white px-4 py-3">
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-700">
            Backend: localhost:3000
          </div>
        </div>
      </aside>

      <main className="ml-72 min-h-screen">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-8 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {pageTitle}
            </h2>
            <p className="text-sm text-slate-500">{pageSubtitle.replaceAll("KAM GRAINS SUPPLIES", businessProfile.company_name)}</p>
          </div>

          <div className="flex items-center gap-3">
            {hasFeature("MULTI_LOCATION") && operating.currentBranch && <div className="hidden items-center gap-2 lg:flex">
              {operating.authorizedBranches.length>1?<label className="flex items-center gap-2 text-xs font-medium text-slate-600">Branch<select className="max-w-40 rounded-lg border bg-white px-2 py-2 text-sm text-slate-900" value={operating.currentBranch.branch_id} onChange={event=>operating.changeBranch(event.target.value)}>{operating.authorizedBranches.map(branch=><option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>)}</select></label>:<span className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">Branch: <strong>{operating.currentBranch.branch_name}</strong></span>}
              {operating.authorizedLocations.length>1?<label className="flex items-center gap-2 text-xs font-medium text-slate-600">Location<select className="max-w-48 rounded-lg border bg-white px-2 py-2 text-sm text-slate-900" value={operating.currentLocation?.location_id||""} onChange={event=>operating.changeLocation(event.target.value)}>{operating.authorizedLocations.map(location=><option key={location.location_id} value={location.location_id}>{location.location_name}</option>)}</select></label>:operating.currentLocation&&<span className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">Location: <strong>{operating.currentLocation.location_name}</strong></span>}
            </div>}
            <div className="hidden rounded-2xl border bg-slate-50 px-4 py-2 md:block">
              <div className="flex items-center gap-2">
                <UserCircle className="h-5 w-5 text-slate-500" />

                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {user?.full_name || user?.username || "User"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {user?.roles?.map((role) => role.role_code).join(", ") ||
                      "No role"}
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </header>

        <section className="p-8">
          {operating.currentBranch && !operating.currentLocation && (
            <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No authorized operating location is configured for this branch. An administrator can assign or configure a location in Setup.
            </div>
          )}
          <Outlet />
        </section>
      </main>
    </div>
  );
}
