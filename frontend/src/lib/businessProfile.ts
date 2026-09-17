import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBusinessProfile } from "@/api/client";
import type { BusinessProfile } from "@/types/api";

export const BUSINESS_PROFILE_FALLBACK: BusinessProfile = {
  company_id: null,
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

export function useBusinessProfile() {
  const query = useQuery({
    queryKey: ["business-profile"],
    queryFn: getBusinessProfile,
    select: (response) => response.data,
  });

  const profile = useMemo(() => query.data ? { ...BUSINESS_PROFILE_FALLBACK, ...query.data } : BUSINESS_PROFILE_FALLBACK, [query.data]);

  return {
    ...query,
    data: profile,
  };
}
