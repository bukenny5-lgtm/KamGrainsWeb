import { useAuth } from "@/lib/auth";

export function usePermissions() {
  const { hasRole } = useAuth();

  function can(roles: readonly string[]) {
    return hasRole([...roles]);
  }

  return {
    can,
  };
}
