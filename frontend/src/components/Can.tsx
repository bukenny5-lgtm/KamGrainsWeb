import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth";

type CanProps = {
  roles: readonly string[];
  children: ReactNode;
  fallback?: ReactNode;
};

export default function Can({ roles, children, fallback = null }: CanProps) {
  const { hasRole } = useAuth();

  if (!hasRole([...roles])) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
