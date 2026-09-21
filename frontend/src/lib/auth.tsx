import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type Role = {
  role_code: string;
  role_name?: string | null;
};

export type AuthUser = {
  user_id: string;
  username: string;
  full_name: string;
  is_active: boolean;
  password_last_changed?: string | null;
  password_expiry_days?: number | null;
  must_change_password?: boolean;
  password_expired?: boolean;
  roles: Role[];
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
  hasRole: (roles: string[]) => boolean;
  mustChangePassword: boolean;
};

const STORAGE_KEY = "kam_grains_auth_user";
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const INACTIVITY_MESSAGE =
  "Your session expired after 20 minutes of inactivity. Please log in again.";
const SESSION_EXPIRED_KEY = "kam_grains_session_expired_message";

const TOKEN_KEYS = [
  "token",
  "authToken",
  "accessToken",
  "kam_grains_token",
  "auth_token",
];

const LOGOUT_EVENT_NAME = "kam-grains-logout";
const AUTH_BROADCAST_CHANNEL = "kam-grains-auth-channel";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function clearAuthStorage() {
  localStorage.removeItem(STORAGE_KEY);

  for (const key of TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
}

function persistSessionExpiredMessage(message = INACTIVITY_MESSAGE) {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, message);
  } catch {
    // Ignore storage failures when persisting the redirect message.
  }
}

function clearSessionExpiredMessage() {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  } catch {
    // Ignore storage failure.
  }
}

function broadcastLogout() {
  try {
    localStorage.setItem("kam_grains_logout_at", String(Date.now()));
  } catch {
    // Ignore localStorage broadcast failure.
  }

  try {
    window.dispatchEvent(new Event(LOGOUT_EVENT_NAME));
  } catch {
    // Ignore event failure.
  }

  try {
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    channel.postMessage({ type: "LOGOUT", at: Date.now() });
    channel.close();
  } catch {
    // BroadcastChannel is optional.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const inactivityTimerRef = useRef<number | null>(null);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current !== null) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    clearSessionExpiredMessage();
    setUser(null);
    broadcastLogout();
  }, []);

  const scheduleInactivityLogout = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = window.setTimeout(() => {
      persistSessionExpiredMessage();
      logout();
      window.location.assign("/login");
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer, logout]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;

    function forceLocalLogout() {
      clearAuthStorage();
      clearSessionExpiredMessage();
      setUser(null);
    }

    function handleStorage(event: StorageEvent) {
      const changedKey = event.key || "";

      if (
        changedKey === STORAGE_KEY ||
        changedKey === "kam_grains_logout_at" ||
        TOKEN_KEYS.includes(changedKey)
      ) {
        const storedUser = readStoredUser();

        if (!storedUser) {
          setUser(null);
          return;
        }

        setUser(storedUser);
      }
    }

    function handleLogoutEvent() {
      forceLocalLogout();
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      const storedUser = readStoredUser();

      if (!storedUser) {
        setUser(null);
      }
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(LOGOUT_EVENT_NAME, handleLogoutEvent);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    try {
      channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.type === "LOGOUT") {
          forceLocalLogout();
        }
      };
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LOGOUT_EVENT_NAME, handleLogoutEvent);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (channel) {
        channel.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!user) {
      clearInactivityTimer();
      return;
    }

    const resetIdleTimer = () => {
      scheduleInactivityLogout();
    };

    const activityEvents = [
      "click",
      "keydown",
      "mousemove",
      "mousedown",
      "touchstart",
      "scroll",
      "pointerdown",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });

    scheduleInactivityLogout();

    return () => {
      clearInactivityTimer();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [clearInactivityTimer, scheduleInactivityLogout, user]);

  function login(nextUser: AuthUser) {
    clearSessionExpiredMessage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function updateUser(nextUser: AuthUser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function hasRole(roles: string[]) {
    if (!user) return false;

    const userRoles = (Array.isArray(user.roles) ? user.roles : []).map((role) =>
      String(role.role_code).toUpperCase()
    );

    return roles.some((role) => userRoles.includes(role.toUpperCase()));
  }

  const mustChangePassword = Boolean(
    user?.must_change_password || user?.password_expired
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      logout,
      updateUser,
      hasRole,
      mustChangePassword,
    }),
    [user, mustChangePassword, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
