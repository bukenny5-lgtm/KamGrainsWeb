import {useMemo,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {getBranchAccessAdmin,setUserBranchAccess,setUserLocationAccess,updateBranch} from "@/api/client";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Label} from "@/components/ui/label";

type Row={user_id:string;branch_id:string;location_id:string;is_active:boolean;is_default:boolean};
export default function BranchAccessPanel(){
  const client=useQueryClient();
  const query=useQuery({queryKey:["branch-access-admin"],queryFn:getBranchAccessAdmin});
  const [userId,setUserId]=useState("");
  const [branchId,setBranchId]=useState("");
  const [locationId,setLocationId]=useState("");
  const [branchDefault,setBranchDefault]=useState(false);
  const [locationDefault,setLocationDefault]=useState(false);
  const data=query.data||{};
  const users=data.users||[];const branches=data.branches||[];const locations=data.locations||[];
  const activeUserId=userId||users[0]?.user_id||"";
  const selectedBranch=branches.find((branch:any)=>branch.branch_id===branchId)||branches[0];
  const branchLocations=useMemo(()=>locations.filter((location:any)=>location.branch_id===selectedBranch?.branch_id),[locations,selectedBranch?.branch_id]);
  const branchGrants:Row[]=data.user_branches||[];const locationGrants:Row[]=data.user_locations||[];
  const currentBranchGrant=branchGrants.find(row=>row.user_id===activeUserId&&row.branch_id===selectedBranch?.branch_id&&row.is_active);
  const hasBranch=Boolean(currentBranchGrant);
  const selectedLocation=branchLocations.find((location:any)=>location.location_id===locationId)||branchLocations[0];
  const currentLocationGrant=locationGrants.find(row=>row.user_id===activeUserId&&row.location_id===selectedLocation?.location_id&&row.is_active);
  const hasLocation=Boolean(currentLocationGrant);
  const mutation=useMutation({mutationFn:async(input:{kind:"branch"|"location";active:boolean})=>input.kind==="branch"?setUserBranchAccess(activeUserId,selectedBranch.branch_id,{is_active:input.active,is_default:input.active&&branchDefault}):setUserLocationAccess(activeUserId,selectedLocation.location_id,{is_active:input.active,is_default:input.active&&locationDefault}),onSuccess:async()=>{await client.invalidateQueries({queryKey:["branch-access-admin"]});await client.invalidateQueries({queryKey:["operating-context"]});}});
  const procurementMutation=useMutation({mutationFn:(mode:string)=>updateBranch(selectedBranch.branch_id,{...selectedBranch,procurement_mode:mode}),onSuccess:async()=>{await client.invalidateQueries({queryKey:["branch-access-admin"]});await client.invalidateQueries({queryKey:["operating-context"]});}});
  if(query.isLoading)return <Card><CardContent className="p-5 text-sm text-slate-500">Loading branch access…</CardContent></Card>;
  if(query.isError)return <Card><CardContent className="p-5 text-sm text-red-600">Branch access administration is unavailable.</CardContent></Card>;
  return <Card className="rounded-2xl shadow-sm"><CardHeader><CardTitle>Branch and Location Access</CardTitle><p className="text-sm text-slate-500">Grant a user branch access first, then grant locations within that branch. Role permissions remain separate.</p></CardHeader><CardContent className="space-y-5">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2"><Label>User</Label><Select value={activeUserId} onValueChange={value=>{setUserId(value);setBranchDefault(false);setLocationDefault(false)}}><SelectTrigger><SelectValue placeholder="Choose user"/></SelectTrigger><SelectContent>{users.map((user:any)=><SelectItem key={user.user_id} value={user.user_id}>{user.full_name||user.username} ({user.username}){user.is_active?"":" — inactive"}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Branch</Label><Select value={selectedBranch?.branch_id||""} onValueChange={value=>{setBranchId(value);setLocationId("");setBranchDefault(false);setLocationDefault(false)}}><SelectTrigger><SelectValue placeholder="Choose branch"/></SelectTrigger><SelectContent>{branches.map((branch:any)=><SelectItem key={branch.branch_id} value={branch.branch_id}>{branch.branch_name} ({branch.branch_code})</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Location</Label><Select value={selectedLocation?.location_id||""} onValueChange={value=>{setLocationId(value);setLocationDefault(false)}}><SelectTrigger><SelectValue placeholder="Choose location"/></SelectTrigger><SelectContent>{branchLocations.map((location:any)=><SelectItem key={location.location_id} value={location.location_id}>{location.location_name} ({location.location_code})</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><span className="text-sm font-medium">Branch procurement policy</span><Select value={selectedBranch?.procurement_mode||"HYBRID"} onValueChange={value=>procurementMutation.mutate(value)}><SelectTrigger className="max-w-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="CENTRAL_ONLY">Central only</SelectItem><SelectItem value="LOCAL_ALLOWED">Local allowed</SelectItem><SelectItem value="LOCAL_WITH_APPROVAL">Local with approval</SelectItem><SelectItem value="HYBRID">Hybrid</SelectItem></SelectContent></Select><span className="text-xs text-slate-500">Internal replenishment remains available independently of supplier purchasing.</span></div>
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><span className="text-sm font-medium">Branch access: {hasBranch?"Assigned":"Not assigned"}</span><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={branchDefault||Boolean(currentBranchGrant?.is_default)} onChange={event=>setBranchDefault(event.target.checked)} disabled={!hasBranch}/>Default branch</label><Button size="sm" onClick={()=>mutation.mutate({kind:"branch",active:!hasBranch||(branchDefault&&!currentBranchGrant?.is_default)})} disabled={mutation.isPending||!activeUserId||!selectedBranch}>{!hasBranch?"Grant branch":branchDefault&&!currentBranchGrant?.is_default?"Set as default":"Revoke branch"}</Button><span className="text-xs text-slate-500">A default branch is selected only from active grants.</span></div>
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><span className="text-sm font-medium">Location access: {hasLocation?"Assigned":"Not assigned"}</span><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={locationDefault||Boolean(currentLocationGrant?.is_default)} onChange={event=>setLocationDefault(event.target.checked)} disabled={!hasLocation}/>Default location</label><Button size="sm" variant="outline" onClick={()=>mutation.mutate({kind:"location",active:!hasLocation||(locationDefault&&!currentLocationGrant?.is_default)})} disabled={mutation.isPending||!activeUserId||!hasBranch||!selectedLocation}>{!hasLocation?"Grant location":locationDefault&&!currentLocationGrant?.is_default?"Set as default":"Revoke location"}</Button><span className="text-xs text-slate-500">Assign branch access before location access.</span></div>
    {mutation.isError&&<p role="alert" className="text-sm text-red-600">Could not update access. Confirm the branch is assigned before granting a location.</p>}
  </CardContent></Card>;
}
