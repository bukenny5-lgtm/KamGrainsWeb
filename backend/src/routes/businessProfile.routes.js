import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

const FALLBACKS = {
  company_name: "KAM GRAINS SUPPLIES",
  business_name: "KAM GRAINS",
  business_type: "Grain Wholesale and Cleaning",
  currency_code: "UGX",
  phone: null,
  email: null,
  address: "Kampala, Uganda",
  logo_path: null,
  timezone: "Africa/Kampala",
};

const PROFILE_COLUMNS = [
  "company_name",
  "business_name",
  "business_type",
  "phone",
  "email",
  "address",
  "logo_path",
  "timezone",
];

function toProfile(row) {
  return {
    company_id: row?.company_id ?? null,
    company_name: row?.company_name || FALLBACKS.company_name,
    business_name: row?.business_name || FALLBACKS.business_name,
    business_type: row?.business_type || FALLBACKS.business_type,
    currency_code: row?.currency_code || FALLBACKS.currency_code,
    phone: row?.phone ?? FALLBACKS.phone,
    email: row?.email ?? FALLBACKS.email,
    address: row?.address || FALLBACKS.address,
    logo_path: row?.logo_path ?? FALLBACKS.logo_path,
    timezone: row?.timezone || FALLBACKS.timezone,
  };
}

async function loadProfile() {
  const result = await query(`
    SELECT company_id, company_name, business_name, business_type,
           currency_code, phone, email, address, logo_path, timezone
    FROM app.company_profile
    WHERE is_active = true
    ORDER BY created_at, company_id
    LIMIT 1;
  `);

  return toProfile(result.rows[0]);
}

router.get("/", async (req, res) => {
  try {
    const profile = await loadProfile();
    res.json({ success: true, data: profile, business_profile: profile });
  } catch (error) {
    res.json({
      success: true,
      data: toProfile(null),
      business_profile: toProfile(null),
      fallback: true,
      warning: "Business profile is unavailable; fallback branding is active.",
    });
  }
});

router.patch(
  "/",
  requireAuth,
  requirePermission("EDIT_SETUP"),
  async (req, res) => {
    try {
      const body = req.body || {};
      const suppliedFields = Object.keys(body);
      const invalidFields = suppliedFields.filter(
        (field) => !PROFILE_COLUMNS.includes(field)
      );

      if (invalidFields.length) {
        return res.status(400).json({
          success: false,
          message: `Unsupported business profile field(s): ${invalidFields.join(", ")}.`,
        });
      }

      if (!suppliedFields.length) {
        return res.status(400).json({
          success: false,
          message: "At least one business profile field is required.",
        });
      }

      for (const field of suppliedFields) {
        if (field === "timezone" && (!String(body[field] || "").trim() || String(body[field]).length > 100)) {
          return res.status(400).json({ success: false, message: "timezone must be a non-empty value of 100 characters or fewer." });
        }
        if (["company_name", "business_name"].includes(field) && !String(body[field] || "").trim()) {
          return res.status(400).json({ success: false, message: `${field} cannot be empty.` });
        }
        if (body[field] !== null && typeof body[field] !== "string") {
          return res.status(400).json({ success: false, message: `${field} must be text or null.` });
        }
      }

      const values = suppliedFields.map((field) => body[field] === "" ? null : body[field]);
      const assignments = suppliedFields.map((field, index) => `${field} = $${index + 1}`).join(", ");
      const result = await query(`
        UPDATE app.company_profile
        SET ${assignments}
        WHERE company_id = (
          SELECT company_id FROM app.company_profile
          WHERE is_active = true
          ORDER BY created_at, company_id
          LIMIT 1
        )
        RETURNING company_id, company_name, business_name, business_type,
                  currency_code, phone, email, address, logo_path, timezone;
      `, values);

      if (!result.rowCount) {
        return res.status(404).json({ success: false, message: "Active business profile not found." });
      }

      const profile = toProfile(result.rows[0]);
      return res.json({ success: true, message: "Business profile updated successfully.", data: profile, business_profile: profile });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Failed to update business profile.", error: error.message, detail: error.detail || null });
    }
  }
);

export default router;
