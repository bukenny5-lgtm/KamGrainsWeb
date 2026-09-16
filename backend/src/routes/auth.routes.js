import express from "express";
import jwt from "jsonwebtoken";
import { query } from "../db.js";

const router = express.Router();

function getJwtSecret() {
  return process.env.JWT_SECRET || "kam_grains_secret_key";
}

function buildUserPayload(user, roles) {
  return {
    user_id: user.user_id,
    username: user.username,
    full_name: user.full_name,
    is_active: user.is_active,
    roles,
  };
}

function signToken(user, roles) {
  return jwt.sign(buildUserPayload(user, roles), getJwtSecret(), {
    expiresIn: "12h",
  });
}

function calculatePasswordStatus(user) {
  const expiryDays = Number(user.password_expiry_days || 0);

  const mustChangePassword = !user.password_last_changed;

  let passwordExpired = false;

  if (user.password_last_changed && expiryDays > 0) {
    const lastChanged = new Date(user.password_last_changed);
    const expiryDate = new Date(lastChanged);
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    passwordExpired = new Date() > expiryDate;
  }

  return {
    must_change_password: mustChangePassword,
    password_expired: passwordExpired,
  };
}

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    const loginResult = await query("SELECT * FROM sec.login($1, $2);", [
      username.trim(),
      password,
    ]);

    if (loginResult.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    const loginUser = loginResult.rows[0];

    const userResult = await query(
      `
      SELECT
        user_id,
        username,
        full_name,
        is_active,
        created_at,
        password_last_changed,
        password_expiry_days,
        login_fail_count
      FROM sec.app_user
      WHERE user_id = COALESCE($1::uuid, user_id)
        AND LOWER(username) = LOWER($2)
      LIMIT 1;
      `,
      [loginUser.user_id || null, username.trim()]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "User account was not found after login.",
      });
    }

    const user = userResult.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        message: "This user account is inactive.",
      });
    }

    const rolesResult = await query(
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

    const roles = rolesResult.rows;
    const passwordStatus = calculatePasswordStatus(user);
    const token = signToken(user, roles);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        is_active: user.is_active,
        password_last_changed: user.password_last_changed,
        password_expiry_days: user.password_expiry_days,
        must_change_password: passwordStatus.must_change_password,
        password_expired: passwordStatus.password_expired,
        roles,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const { user_id, current_password, new_password } = req.body || {};

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required.",
      });
    }

    if (!current_password) {
      return res.status(400).json({
        success: false,
        message: "Current password is required.",
      });
    }

    if (!new_password || String(new_password).length < 4) {
      return res.status(400).json({
        success: false,
        message: "New password is required and must be at least 4 characters.",
      });
    }

    if (current_password === new_password) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as current password.",
      });
    }

    const verifyResult = await query(
      "SELECT sec.verify_current_password($1, $2) AS is_valid;",
      [user_id, current_password]
    );

    if (!verifyResult.rows[0]?.is_valid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    const changeResult = await query(
      "SELECT sec.change_user_password($1, $2) AS changed;",
      [user_id, new_password]
    );

    if (!changeResult.rows[0]?.changed) {
      return res.status(400).json({
        success: false,
        message: "Password was not changed.",
      });
    }

    const userResult = await query(
      `
      SELECT
        user_id,
        username,
        full_name,
        is_active,
        password_last_changed,
        password_expiry_days
      FROM sec.app_user
      WHERE user_id = $1;
      `,
      [user_id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User account was not found.",
      });
    }

    const user = userResult.rows[0];

    const rolesResult = await query(
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
      [user_id]
    );

    const roles = rolesResult.rows;
    const token = signToken(user, roles);

    return res.json({
      success: true,
      message: "Password changed successfully.",
      token,
      user: {
        ...user,
        must_change_password: false,
        password_expired: false,
        roles,
      },
    });
  } catch (error) {
    console.error("Change password error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change password.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

export default router;