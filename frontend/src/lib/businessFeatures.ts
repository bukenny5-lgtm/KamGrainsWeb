import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBusinessFeatures } from "@/api/client";
import type { BusinessFeatureCode, BusinessFeatures, BusinessFeaturesResponse } from "@/types/api";
import { useAuth } from "@/lib/auth";

export const BUSINESS_FEATURE_FALLBACK: BusinessFeatures = {
  sales: true,
  purchasing: true,
  inventory: true,
  cleaning: true,
  finance: true,
  reports: true,
  pos: false,
  barcode: false,
  MULTI_LOCATION: false,
  tax_engine: false,
  efris: false,
};

export function useBusinessFeatures() {
  const { isAuthenticated } = useAuth();
  const query = useQuery<BusinessFeaturesResponse>({
    queryKey: ["business-features"],
    queryFn: getBusinessFeatures,
    enabled: isAuthenticated,
  });

  const features = useMemo<BusinessFeatures>(() => ({
    ...BUSINESS_FEATURE_FALLBACK,
    ...(query.data?.features || {}),
  }), [query.data]);

  function hasFeature(featureCode: BusinessFeatureCode) {
    return features[featureCode] === true;
  }

  return { ...query, features, hasFeature };
}
