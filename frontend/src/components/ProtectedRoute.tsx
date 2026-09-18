import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { useBusinessFeatures } from "@/lib/businessFeatures";
import type { BusinessFeatureCode } from "@/types/api";

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: string[];
  feature?: BusinessFeatureCode;
};

export default function ProtectedRoute({
  children,
  allowedRoles,
  feature,
}: ProtectedRouteProps) {
  const { isAuthenticated, mustChangePassword, hasRole } = useAuth();
  const { hasFeature } = useBusinessFeatures();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasRole(allowedRoles)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (feature && !hasFeature(feature)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
