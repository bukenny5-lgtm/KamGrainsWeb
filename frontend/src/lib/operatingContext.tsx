import {createContext,useCallback,useContext,useEffect,useMemo,useState} from "react";
import type {ReactNode} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {getOperatingContext} from "@/api/client";
import {useAuth} from "@/lib/auth";
import {useBusinessFeatures} from "@/lib/businessFeatures";

type OperatingLocation={location_id:string;location_code:string;location_name:string;location_type:string;is_saleable:boolean;is_stock_holding:boolean;is_system:boolean;is_default?:boolean};
type OperatingBranch={branch_id:string;company_id:string;branch_code:string;branch_name:string;branch_type:string;is_head_office:boolean;default_location_id:string|null;locations:OperatingLocation[]};
type ContextValue={companyId:string|null;authorizedBranches:OperatingBranch[];currentBranch:OperatingBranch|null;authorizedLocations:OperatingLocation[];currentLocation:OperatingLocation|null;allBranches:boolean;multiLocationEnabled:boolean;changeBranch:(id:string)=>void;changeLocation:(id:string)=>void;isLoading:boolean};
const OperatingContext=createContext<ContextValue|null>(null);
const BRANCH_KEY="kam_grains_current_branch";const LOCATION_KEY="kam_grains_current_location";
function stored(key:string){try{return localStorage.getItem(key)||""}catch{return ""}}

export function OperatingContextProvider({children}:{children:ReactNode}){
  const {isAuthenticated}=useAuth();const queryClient=useQueryClient();const features=useBusinessFeatures();
  const [branchId,setBranchId]=useState(stored(BRANCH_KEY));const [locationId,setLocationId]=useState(stored(LOCATION_KEY));
  const query=useQuery({queryKey:["operating-context"],queryFn:()=>getOperatingContext(),enabled:isAuthenticated,staleTime:30_000});
  const data=query.data;const branches=(data?.branches||[]) as OperatingBranch[];
  const currentBranch=branches.find((branch)=>branch.branch_id===branchId)||branches.find((branch)=>branch.branch_id===data?.default_branch_id)||branches.find((branch)=>branch.branch_id===data?.current_branch?.branch_id)||branches[0]||null;
  const authorizedLocations=currentBranch?.locations||[];
  const currentLocation=authorizedLocations.find((location)=>location.location_id===locationId)||authorizedLocations.find((location)=>location.location_id===currentBranch?.default_location_id)||authorizedLocations.find((location)=>location.is_default)||authorizedLocations.find((location)=>location.is_saleable)||authorizedLocations[0]||null;

  useEffect(()=>{
    if(!isAuthenticated){setBranchId("");setLocationId("");try{localStorage.removeItem(BRANCH_KEY);localStorage.removeItem(LOCATION_KEY)}catch{}return}
    if(!data)return;
    const validBranch=branches.find((branch)=>branch.branch_id===branchId);
    const nextBranch=validBranch||branches.find((branch)=>branch.branch_id===data.default_branch_id)||branches[0]||null;
    if(nextBranch&&nextBranch.branch_id!==branchId){setBranchId(nextBranch.branch_id);try{localStorage.setItem(BRANCH_KEY,nextBranch.branch_id)}catch{}}
    if(!nextBranch){setBranchId("");setLocationId("");try{localStorage.removeItem(BRANCH_KEY);localStorage.removeItem(LOCATION_KEY)}catch{}}
  },[isAuthenticated,data,branchId,branches]);

  useEffect(()=>{
    if(!currentBranch)return;
    if(currentLocation?.location_id!==locationId){const next=currentLocation?.location_id||"";setLocationId(next);try{if(next)localStorage.setItem(LOCATION_KEY,next);else localStorage.removeItem(LOCATION_KEY)}catch{}}
  },[currentBranch,currentLocation,locationId]);

  const changeBranch=useCallback((id:string)=>{
    const branch=branches.find((item)=>item.branch_id===id);if(!branch)return;
    setBranchId(id);try{localStorage.setItem(BRANCH_KEY,id)}catch{}
    const next=branch.locations.find((location)=>location.is_default)||branch.locations.find((location)=>location.is_saleable)||branch.locations[0]||null;
    setLocationId(next?.location_id||"");try{if(next)localStorage.setItem(LOCATION_KEY,next.location_id);else localStorage.removeItem(LOCATION_KEY)}catch{}
    queryClient.removeQueries({predicate:(query)=>!["operating-context","business-features","business-profile"].includes(String(query.queryKey[0]))});
    queryClient.invalidateQueries();
  },[branches,queryClient]);
  const changeLocation=useCallback((id:string)=>{
    if(!authorizedLocations.some((location)=>location.location_id===id))return;
    setLocationId(id);try{localStorage.setItem(LOCATION_KEY,id)}catch{}
    queryClient.removeQueries({predicate:(query)=>!["operating-context","business-features","business-profile"].includes(String(query.queryKey[0]))});
    queryClient.invalidateQueries();
  },[authorizedLocations,queryClient]);
  const value=useMemo<ContextValue>(()=>({companyId:data?.company_id||null,authorizedBranches:branches,currentBranch,authorizedLocations,currentLocation,allBranches:Boolean(data?.all_branches),multiLocationEnabled:features.hasFeature("MULTI_LOCATION"),changeBranch,changeLocation,isLoading:query.isLoading}),[data,branches,currentBranch,authorizedLocations,currentLocation,features.hasFeature,changeBranch,changeLocation,query.isLoading]);
  return <OperatingContext.Provider value={value}>{children}</OperatingContext.Provider>;
}

export function useOperatingContext(){const value=useContext(OperatingContext);if(!value)throw new Error("useOperatingContext must be used inside OperatingContextProvider");return value;}
