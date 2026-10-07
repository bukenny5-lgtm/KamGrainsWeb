import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { logBusinessEvent } from "../services/audit.service.js";

const router = express.Router();

function requireUserStatusPermission(req, res, next) {
  const { is_active } = req.body || {};

  if (typeof is_active !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "is_active boolean is required.",
    });
  }

  const action = is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER";
  return requirePermission(action)(req, res, next);
}

router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        u.user_id,
        u.username,
        u.full_name,
        u.is_active,
        u.created_at,
        u.password_last_changed,
        u.password_expiry_days,
        u.login_fail_count,
        COALESCE(
          json_agg(
            json_build_object(
              'role_code', ur.role_code,
              'role_name', r.role_name
            )
            ORDER BY ur.role_code
          ) FILTER (WHERE ur.role_code IS NOT NULL),
          '[]'::json
        ) AS roles
      FROM sec.app_user u
      LEFT JOIN sec.user_role ur
        ON ur.user_id = u.user_id
      LEFT JOIN sec.role r
        ON r.role_code = ur.role_code
      GROUP BY
        u.user_id,
        u.username,
        u.full_name,
        u.is_active,
        u.created_at,
        u.password_last_changed,
        u.password_expiry_days,
        u.login_fail_count
      ORDER BY u.full_name, u.username;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
      users: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load users.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

router.get("/roles", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        role_code,
        role_name
      FROM sec.role
      ORDER BY role_code;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
      roles: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load roles.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

router.post(
  "/roles",
  requireAuth,
  requirePermission("ASSIGN_ROLE"),
  async (req, res) => {
    try {
      const { role_code, role_name } = req.body || {};

      if (!role_code) {
        return res.status(400).json({
          success: false,
          message: "role_code is required.",
        });
      }

      if (!role_name) {
        return res.status(400).json({
          success: false,
          message: "role_name is required.",
        });
      }

      const result = await query(
        `
        INSERT INTO sec.role (
          role_code,
          role_name
        )
        VALUES ($1, $2)
        ON CONFLICT (role_code)
        DO UPDATE SET
          role_name = EXCLUDED.role_name
        RETURNING
          role_code,
          role_name;
        `,
        [String(role_code).toUpperCase(), role_name]
      );

      res.status(201).json({
        success: true,
        message: "Role saved successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to save role.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_USER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        username,
        full_name,
        password,
        password_expiry_days = 90,
        is_active = true,
        roles = [],
        branch_id = null,
        location_id = null,
      } = req.body || {};

      if (!username) {
        return res.status(400).json({
          success: false,
          message: "username is required.",
        });
      }

      if (!full_name) {
        return res.status(400).json({
          success: false,
          message: "full_name is required.",
        });
      }

      if (!password || String(password).length < 4) {
        return res.status(400).json({
          success: false,
          message: "password is required and must be at least 4 characters.",
        });
      }

      if (location_id && !branch_id) {
        return res.status(400).json({ success: false, message: "A branch is required before assigning an initial location." });
      }

      let branch = null;
      let location = null;
      if (branch_id) {
        const branchResult = await client.query(`
          SELECT branch_id,company_id,branch_code,branch_name
          FROM app.branch
          WHERE branch_id=$1 AND is_active`, [branch_id]);
        if (!branchResult.rowCount) return res.status(400).json({ success: false, message: "Operating branch is inactive or does not exist." });
        branch = branchResult.rows[0];
      }
      if (location_id) {
        const locationResult = await client.query(`
          SELECT location_id,branch_id,location_code,location_name
          FROM app.location
          WHERE location_id=$1 AND is_active`, [location_id]);
        if (!locationResult.rowCount) return res.status(400).json({ success: false, message: "Default location is inactive or does not exist." });
        location = locationResult.rows[0];
        if (location.branch_id !== branch_id) return res.status(400).json({ success: false, message: "Default location must belong to the selected operating branch." });
      }

      await client.query("BEGIN");

      const userResult = await client.query(
        `
        INSERT INTO sec.app_user (
          user_id,
          username,
          full_name,
          password_hash,
          is_active,
          created_at,
          password_last_changed,
          password_expiry_days,
          login_fail_count
        )
        VALUES (
          gen_random_uuid(),
          LOWER($1),
          $2,
          crypt($3, gen_salt('bf')),
          $4,
          now(),
          now(),
          $5,
          0
        )
        RETURNING
          user_id,
          username,
          full_name,
          is_active,
          created_at,
          password_last_changed,
          password_expiry_days,
          login_fail_count;
        `,
        [
          username.trim(),
          full_name.trim(),
          password,
          is_active,
          password_expiry_days,
        ]
      );

      const user = userResult.rows[0];

      const normalizedRoles = [...new Set((Array.isArray(roles) ? roles : []).map((roleCode) => String(roleCode).trim().toUpperCase()).filter(Boolean))];
      for (const roleCode of normalizedRoles) {
        await client.query(
          `
          INSERT INTO sec.user_role (
            user_id,
            role_code
          )
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING;
          `,
          [user.user_id, String(roleCode).toUpperCase()]
        );
      }

      if (branch) {
        await client.query(`
          INSERT INTO sec.user_branch(user_id,branch_id,is_default,is_active)
          VALUES($1,$2,true,true)`, [user.user_id, branch.branch_id]);
      }
      if (location) {
        await client.query(`
          INSERT INTO sec.user_location(user_id,location_id,is_default,is_active)
          VALUES($1,$2,true,true)`, [user.user_id, location.location_id]);
      }

      await logBusinessEvent(client, {
        eventCode: "USER_CREATED",
        objectType: "SEC.USER",
        objectId: user.user_id,
        userId: req.user?.user_id || null,
        metadata: { username: user.username, full_name: user.full_name },
      });
      for (const roleCode of normalizedRoles) {
        await logBusinessEvent(client, {
          eventCode: "USER_ROLE_ASSIGNED",
          objectType: "SEC.USER_ROLE",
          objectId: user.user_id,
          userId: req.user?.user_id || null,
          metadata: { role_code: roleCode },
        });
      }
      if (branch) {
        await logBusinessEvent(client, {
          eventCode: "USER_BRANCH_GRANTED",
          objectType: "SEC.USER_BRANCH",
          objectId: user.user_id,
          branchId: branch.branch_id,
          userId: req.user?.user_id || null,
          metadata: { target_user_id: user.user_id, branch_code: branch.branch_code, is_default: true },
        });
        await logBusinessEvent(client, {
          eventCode: "USER_DEFAULT_BRANCH_CHANGED",
          objectType: "SEC.USER_BRANCH",
          objectId: user.user_id,
          branchId: branch.branch_id,
          userId: req.user?.user_id || null,
          metadata: { target_user_id: user.user_id, branch_code: branch.branch_code },
        });
      }
      if (location) {
        await logBusinessEvent(client, {
          eventCode: "LOCATION_ACCESS_GRANTED",
          objectType: "SEC.USER_LOCATION",
          objectId: user.user_id,
          branchId: branch.branch_id,
          locationId: location.location_id,
          userId: req.user?.user_id || null,
          metadata: { target_user_id: user.user_id, location_code: location.location_code, is_default: true },
        });
        await logBusinessEvent(client, {
          eventCode: "USER_DEFAULT_LOCATION_CHANGED",
          objectType: "SEC.USER_LOCATION",
          objectId: user.user_id,
          branchId: branch.branch_id,
          locationId: location.location_id,
          userId: req.user?.user_id || null,
          metadata: { target_user_id: user.user_id, location_code: location.location_code },
        });
      }

      const rolesResult = await client.query(
        `
        SELECT
          ur.role_code,
          r.role_name
        FROM sec.user_role ur
        LEFT JOIN sec.role r
          ON r.role_code = ur.role_code
        WHERE ur.user_id = $1
        ORDER BY ur.role_code;
        `,
        [user.user_id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "User created successfully.",
        data: {
          ...user,
          roles: rolesResult.rows,
        },
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK");
      }

      const status = error.code === "23505" ? 409 : ["23503", "23514", "22P02"].includes(error.code) ? 400 : 500;
      const message = error.code === "23505"
        ? "That username already exists."
        : error.code === "23503"
          ? "The selected role or operating assignment is invalid."
          : error.code === "23514"
            ? error.message
            : "Failed to create user.";
      res.status(status).json({
        success: false,
        message,
        error: error.message,
        detail: error.detail || null,
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

router.post(
  "/:userId/roles",
  requireAuth,
  requirePermission("ASSIGN_ROLE"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role_code } = req.body || {};

      if (!role_code) {
        return res.status(400).json({
          success: false,
          message: "role_code is required.",
        });
      }

      const result = await query(
        `
        INSERT INTO sec.user_role (
          user_id,
          role_code
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING
          user_id,
          role_code;
        `,
        [userId, String(role_code).toUpperCase()]
      );

      res.status(201).json({
        success: true,
        message:
          result.rowCount > 0
            ? "Role assigned successfully."
            : "User already has this role.",
        data: result.rows[0] || {
          user_id: userId,
          role_code: String(role_code).toUpperCase(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to assign role.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

router.delete(
  "/:userId/roles/:roleCode",
  requireAuth,
  requirePermission("ASSIGN_ROLE"),
  async (req, res) => {
    try {
      const { userId, roleCode } = req.params;

      const result = await query(
        `
        DELETE FROM sec.user_role
        WHERE user_id = $1
          AND role_code = $2
        RETURNING
          user_id,
          role_code;
        `,
        [userId, String(roleCode).toUpperCase()]
      );

      res.json({
        success: true,
        message:
          result.rowCount > 0
            ? "Role removed successfully."
            : "Role was not assigned to this user.",
        data: result.rows[0] || null,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to remove role.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

router.patch(
  "/:userId/status",
  requireAuth,
  requireUserStatusPermission,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { is_active } = req.body || {};

      const result = await query(
        `
        UPDATE sec.app_user
        SET is_active = $2
        WHERE user_id = $1
        RETURNING
          user_id,
          username,
          full_name,
          is_active,
          created_at;
        `,
        [userId, is_active]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      res.json({
        success: true,
        message: is_active
          ? "User activated successfully."
          : "User deactivated successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to update user status.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

router.patch(
  "/:userId/password",
  requireAuth,
  requirePermission("RESET_PASSWORD"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { password } = req.body || {};

      if (!password || String(password).length < 4) {
        return res.status(400).json({
          success: false,
          message: "password is required and must be at least 4 characters.",
        });
      }

      const result = await query(
        `
        UPDATE sec.app_user
        SET
          password_hash = crypt($2, gen_salt('bf')),
          password_last_changed = NULL,
          login_fail_count = 0
        WHERE user_id = $1
        RETURNING
          user_id,
          username,
          full_name,
          is_active,
          password_last_changed;
        `,
        [userId, password]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      res.json({
        success: true,
        message: "Password reset successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to reset password.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

export default router;
