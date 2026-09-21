export const ACTION_ROLES = {
  // General
  DELETE: ["ADMIN", "MANAGER"],
  VIEW_ONLY: [
    "ADMIN",
    "MANAGER",
    "PURCHASING",
    "INVENTORY",
    "SALES",
    "FINANCE",
    "AUDITOR",
    "VIEWER",
  ],

  VIEW_CUSTOMER_RETURNS: ["ADMIN", "MANAGER", "SALES", "FINANCE", "INVENTORY", "AUDITOR", "VIEWER"],
  CREATE_CUSTOMER_RETURN: ["ADMIN", "MANAGER", "SALES"],
  POST_CUSTOMER_RETURN: ["ADMIN", "MANAGER", "SALES", "INVENTORY"],
  VOID_CUSTOMER_RETURN: ["ADMIN", "MANAGER"],
  VIEW_RETURN_POLICY: ["ADMIN", "MANAGER", "SALES", "FINANCE", "AUDITOR", "VIEWER"],
  EDIT_RETURN_POLICY: ["ADMIN", "MANAGER"],
  APPROVE_RETURN_EXCEPTION: ["ADMIN", "MANAGER"],
  VIEW_QUARANTINE: ["ADMIN", "MANAGER", "INVENTORY", "FINANCE", "AUDITOR", "VIEWER"],
  PROCESS_REFUND: ["ADMIN", "MANAGER", "FINANCE"],

  // Users and roles
  CREATE_USER: ["ADMIN"],
  RESET_PASSWORD: ["ADMIN"],
  ASSIGN_ROLE: ["ADMIN"],
  ACTIVATE_USER: ["ADMIN"],
  DEACTIVATE_USER: ["ADMIN"],

  // Setup / master data
  CREATE_SETUP: ["ADMIN", "MANAGER"],
  EDIT_SETUP: ["ADMIN", "MANAGER"],

  // Purchasing / GRN
  CREATE_PURCHASE_ORDER: ["ADMIN", "MANAGER", "PURCHASING"],
  CREATE_GRN: ["ADMIN", "MANAGER", "PURCHASING", "INVENTORY"],
  POST_GRN: ["ADMIN", "MANAGER", "PURCHASING", "INVENTORY"],

  // Cleaning / production
  CREATE_CLEANING_BATCH: ["ADMIN", "MANAGER", "INVENTORY", "PRODUCTION"],
  POST_CLEANING_BATCH: ["ADMIN", "MANAGER", "INVENTORY", "PRODUCTION"],

  // Sales / delivery
  CREATE_SALES_ORDER: ["ADMIN", "MANAGER", "SALES"],
  CREATE_DELIVERY: ["ADMIN", "MANAGER", "SALES", "INVENTORY"],
  POST_DELIVERY: ["ADMIN", "MANAGER", "SALES", "INVENTORY"],

  // AR
  CREATE_AR_INVOICE: ["ADMIN", "MANAGER", "SALES", "FINANCE"],
  CREATE_RECEIPT: ["ADMIN", "MANAGER", "FINANCE"],

  // POS
  VIEW_POS: ["ADMIN", "MANAGER", "SALES", "FINANCE"],
  CREATE_POS_SALE: ["ADMIN", "MANAGER", "SALES", "FINANCE"],
  ENTER_POS_PRICE: ["ADMIN", "MANAGER", "SALES", "FINANCE"],
  OVERRIDE_POS_PRICE: ["ADMIN", "MANAGER", "FINANCE"],
  VOID_POS_SALE: ["ADMIN", "MANAGER", "FINANCE"],

  // AP
  CREATE_AP_INVOICE: ["ADMIN", "MANAGER", "PURCHASING", "FINANCE"],
  CREATE_AP_PAYMENT: ["ADMIN", "MANAGER", "FINANCE"],

  // Expenses / finance
  CREATE_EXPENSE_VOUCHER: ["ADMIN", "MANAGER", "FINANCE"],
  POST_EXPENSE_VOUCHER: ["ADMIN", "MANAGER", "FINANCE"],
  CREATE_JOURNAL: ["ADMIN", "MANAGER", "FINANCE"],

  // Reconciliation
  CREATE_RECONCILIATION: ["ADMIN", "MANAGER", "FINANCE"],
  CONFIRM_RECONCILIATION: ["ADMIN", "MANAGER", "FINANCE"],
  CANCEL_RECONCILIATION: ["ADMIN", "MANAGER", "FINANCE"],

  // Stock count
  CREATE_STOCK_COUNT: ["ADMIN", "MANAGER", "INVENTORY"],
  LOAD_STOCK_COUNT_LINES: ["ADMIN", "MANAGER", "INVENTORY"],
  UPDATE_STOCK_COUNT_LINES: ["ADMIN", "MANAGER", "INVENTORY"],
  POST_STOCK_COUNT: ["ADMIN", "MANAGER", "INVENTORY"],

  // Stock adjustments / damage
  CREATE_STOCK_ADJUSTMENT: ["ADMIN", "MANAGER", "INVENTORY"],
  POST_STOCK_ADJUSTMENT: ["ADMIN", "MANAGER", "INVENTORY"],

  // Backdated transactions (PHASE 4)
  CREATE_BACKDATED_DELIVERY: ["ADMIN", "MANAGER"],
  CREATE_BACKDATED_AR_INVOICE: ["ADMIN", "MANAGER"],
  CREATE_BACKDATED_AR_PAYMENT: ["ADMIN", "MANAGER"],
  CREATE_BACKDATED_AP_INVOICE: ["ADMIN", "MANAGER"],
  CREATE_BACKDATED_AP_PAYMENT: ["ADMIN", "MANAGER"],
  EDIT_BACKDATED_TRANSACTION: ["ADMIN", "MANAGER"],
  VIEW_BACKDATE_AUDIT: ["ADMIN", "MANAGER", "AUDITOR", "FINANCE"],

  // Lot lifecycle (PHASE 4)
  CLOSE_LOT: ["ADMIN", "MANAGER", "INVENTORY"],
};

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function getUserRoles(req) {
  const user = req.user || {};

  if (Array.isArray(user.roles)) {
    return user.roles
      .map((role) => {
        if (typeof role === "string") return role;
        return role.role_code || role.role_name || role.name || role.code;
      })
      .filter(Boolean)
      .map(normalizeRole);
  }

  if (Array.isArray(user.role_codes)) {
    return user.role_codes.filter(Boolean).map(normalizeRole);
  }

  if (Array.isArray(user.role_names)) {
    return user.role_names.filter(Boolean).map(normalizeRole);
  }

  if (typeof user.role_code === "string") {
    return [normalizeRole(user.role_code)];
  }

  if (typeof user.role_name === "string") {
    return [normalizeRole(user.role_name)];
  }

  if (typeof user.role === "string") {
    return [normalizeRole(user.role)];
  }

  return [];
}


export function requirePermission(action) {
  return function permissionMiddleware(req, res, next) {
    const allowedRoles = ACTION_ROLES[action];

    if (!allowedRoles) {
      return res.status(500).json({
        success: false,
        message: `Permission action '${action}' is not configured.`,
      });
    }

    const userRoles = getUserRoles(req);
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    const isAllowed = userRoles.some((role) =>
      normalizedAllowedRoles.includes(role)
    );

    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
        required_permission: action,
        user_roles: userRoles,
      });
    }

    next();
  };
}
