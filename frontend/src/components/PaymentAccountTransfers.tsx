import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCrossBranchTransfer, createPaymentAccountTransfer, crossBranchTransferAction, getBranches, getPaymentAccountTransfers, getPaymentTransferAccounts, voidPaymentAccountTransfer } from "@/api/client";
import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Account = Record<string, any>;
type Props = { accounts: Account[]; onChanged: () => Promise<unknown> };

const money = (value: unknown) => `UGX ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const errorMessage = (error: any) => error?.response?.data?.message || error?.message || "Transfer failed.";

export default function PaymentAccountTransfers({ accounts, onChanged }: Props) {
  const qc = useQueryClient();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [crossBranch, setCrossBranch] = useState(false);
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const history = useQuery({ queryKey: ["payment-account-transfers"], queryFn: getPaymentAccountTransfers });
  const branchesQuery = useQuery({ queryKey: ["cross-branch-transfer-branches"], queryFn: () => getBranches(false, false), enabled: crossBranch });
  const destinationAccountsQuery = useQuery({ queryKey: ["cross-branch-destination-accounts", destinationBranchId], queryFn: () => getPaymentTransferAccounts(destinationBranchId), enabled: crossBranch && Boolean(destinationBranchId) });
  const transfer = useMutation({
    mutationFn: () => crossBranch ? createCrossBranchTransfer({ source_branch_id: sourceBranchId, destination_branch_id: destinationBranchId, from_payment_account_id: fromId, to_payment_account_id: toId, amount: Number(amount), transaction_date: transactionDate, reason, reference: reference || undefined, idempotency_key: crypto.randomUUID() }) : createPaymentAccountTransfer({ from_payment_account_id: fromId, to_payment_account_id: toId, amount: Number(amount), transaction_date: transactionDate, reason, reference: reference || undefined, idempotency_key: crypto.randomUUID() }),
    onSuccess: async () => { await onChanged(); await qc.invalidateQueries({ queryKey: ["payment-account-transfers"] }); setAmount(""); setReason(""); setReference(""); }
  });
  const voidTransfer = useMutation({
    mutationFn: (id: string) => voidPaymentAccountTransfer(id, { reason: "Voided by authorized user" }),
    onSuccess: async () => { await onChanged(); await qc.invalidateQueries({ queryKey: ["payment-account-transfers"] }); }
  });
  const crossAction = useMutation({
    mutationFn: ({ id, action, payload }: { id: string; action: string; payload?: any }) => crossBranchTransferAction(id, action, payload),
    onSuccess: async () => { await onChanged(); await qc.invalidateQueries({ queryKey: ["payment-account-transfers"] }); }
  });
  const from = accounts.find((row) => row.account_id === fromId);
  const availableDestinationAccounts = crossBranch ? (destinationAccountsQuery.data?.data || []) : accounts;
  const to = availableDestinationAccounts.find((row: any) => row.account_id === toId);
  const value = Number(amount || 0);
  const supported = from && to && (crossBranch ? from.channel_type === "CASH" && to.channel_type === "CASH" : ["CASH->CASH", "CASH->BANK", "BANK->CASH"].includes(`${from.channel_type}->${to.channel_type}`));

  return <>
    <Can roles={ACTION_ROLES.CREATE_PAYMENT_ACCOUNT_TRANSFER}>
      <Card className="rounded-2xl shadow-sm">
        <CardHeader><CardTitle>Transfer Funds Between Payment Accounts</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border bg-slate-50 p-3 text-sm"><input type="checkbox" checked={crossBranch} onChange={(event) => { setCrossBranch(event.target.checked); setToId(""); }} /><span>Cross-branch cash funding (requires approval, dispatch, and destination receipt)</span></div>
          {crossBranch && <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Source Branch</Label><Select value={sourceBranchId} onValueChange={(value) => { setSourceBranchId(value); setFromId(""); }}><SelectTrigger><SelectValue placeholder="Select source branch" /></SelectTrigger><SelectContent>{(branchesQuery.data?.data || []).map((row: any) => <SelectItem key={row.branch_id} value={row.branch_id}>{row.branch_code} — {row.branch_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Destination Branch</Label><Select value={destinationBranchId} onValueChange={(value) => { setDestinationBranchId(value); setToId(""); }}><SelectTrigger><SelectValue placeholder="Select destination branch" /></SelectTrigger><SelectContent>{(branchesQuery.data?.data || []).filter((row: any) => row.branch_id !== sourceBranchId).map((row: any) => <SelectItem key={row.branch_id} value={row.branch_id}>{row.branch_code} — {row.branch_name}</SelectItem>)}</SelectContent></Select></div></div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>From Account</Label><Select value={fromId} onValueChange={setFromId}><SelectTrigger><SelectValue placeholder="Select source account" /></SelectTrigger><SelectContent>{accounts.filter((row) => row.is_active).map((row) => <SelectItem key={row.account_id} value={row.account_id}>{row.account_code} — {row.account_name} / {row.provider_name || row.channel_type}</SelectItem>)}</SelectContent></Select>{from && <p className="text-xs text-slate-500">Current: {money(from.current_balance)} · Available: {money(from.available_balance)}</p>}</div>
            <div className="space-y-2"><Label>To Account</Label><Select value={toId} onValueChange={setToId}><SelectTrigger><SelectValue placeholder="Select destination account" /></SelectTrigger><SelectContent>{availableDestinationAccounts.filter((row: any) => row.is_active).map((row: any) => <SelectItem key={row.account_id} value={row.account_id}>{row.account_code} — {row.account_name} / {row.provider_name || row.channel_type}</SelectItem>)}</SelectContent></Select>{to && <p className="text-xs text-slate-500">Current: {money(to.current_balance)}</p>}</div>
            <div className="space-y-2"><Label>Transaction Date</Label><Input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></div>
            <div className="space-y-2"><Label>Amount</Label><Input type="number" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Reason</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this internal transfer required?" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Reference (optional)</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank slip, authorization, or supporting reference" /></div>
          </div>
          {from && to && <div className="rounded-xl border bg-slate-50 p-4 text-sm"><p className="font-semibold">Preview</p><p>{money(value)} from {from.account_code} to {to.account_code}</p><p>Source after: {money(Number(from.current_balance || 0) - value)} · Destination after: {money(Number(to.current_balance || 0) + value)}</p></div>}
          {!supported && from && to && <p className="text-sm text-amber-700">{crossBranch ? "Cross-branch funding is limited to CASH source and destination accounts." : "Supported initial transfers are CASH↔CASH and CASH↔BANK."}</p>}
          {transfer.error && <Alert variant="destructive"><AlertTitle>Transfer failed</AlertTitle><AlertDescription>{errorMessage(transfer.error)}</AlertDescription></Alert>}
          <Button disabled={!fromId || !toId || fromId === toId || value <= 0 || !reason.trim() || !supported || (crossBranch && (!sourceBranchId || !destinationBranchId || sourceBranchId === destinationBranchId)) || transfer.isPending} onClick={() => transfer.mutate()}>{crossBranch ? "Create Cross-Branch Request" : "Confirm Transfer"}</Button>
        </CardContent>
      </Card>
    </Can>
    <Card className="rounded-2xl shadow-sm"><CardHeader><CardTitle>Payment Account Transfer History</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Transfer</TableHead><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Journal</TableHead><TableHead /></TableRow></TableHeader><TableBody>{(history.data?.data || []).map((row: any) => <TableRow key={row.transfer_id}><TableCell>{row.transfer_no}</TableCell><TableCell>{row.transaction_date}</TableCell><TableCell>{row.from_account_code} — {row.from_account_name}</TableCell><TableCell>{row.to_account_code} — {row.to_account_name}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell>{row.status}</TableCell><TableCell>{row.journal_no || "—"}</TableCell><TableCell className="space-x-1">{row.transfer_type === "CROSS_BRANCH" && row.status === "DRAFT" && <Can roles={ACTION_ROLES.CREATE_CROSS_BRANCH_TRANSFER}><Button size="sm" variant="outline" onClick={() => crossAction.mutate({ id: row.transfer_id, action: "submit" })}>Submit</Button></Can>}{row.transfer_type === "CROSS_BRANCH" && row.status === "SUBMITTED" && <Can roles={ACTION_ROLES.APPROVE_CROSS_BRANCH_TRANSFER}><Button size="sm" variant="outline" onClick={() => crossAction.mutate({ id: row.transfer_id, action: "approve" })}>Approve</Button></Can>}{row.transfer_type === "CROSS_BRANCH" && row.status === "APPROVED" && <Can roles={ACTION_ROLES.DISPATCH_CROSS_BRANCH_TRANSFER}><Button size="sm" variant="outline" onClick={() => crossAction.mutate({ id: row.transfer_id, action: "dispatch" })}>Dispatch</Button></Can>}{row.transfer_type === "CROSS_BRANCH" && ["IN_TRANSIT","DISPATCHED"].includes(row.status) && <Can roles={ACTION_ROLES.RECEIVE_CROSS_BRANCH_TRANSFER}><Button size="sm" variant="outline" onClick={() => crossAction.mutate({ id: row.transfer_id, action: "receive", payload: { received_amount: row.amount } })}>Receive</Button></Can>}{row.transfer_type === "CROSS_BRANCH" && ["DRAFT","SUBMITTED","APPROVED"].includes(row.status) && <Can roles={ACTION_ROLES.CANCEL_CROSS_BRANCH_TRANSFER}><Button size="sm" variant="outline" onClick={() => crossAction.mutate({ id: row.transfer_id, action: "cancel" })}>Cancel</Button></Can>}{row.transfer_type === "CROSS_BRANCH" && row.status === "COMPLETED" && <Can roles={ACTION_ROLES.REVERSE_CROSS_BRANCH_TRANSFER}><Button size="sm" variant="outline" onClick={() => crossAction.mutate({ id: row.transfer_id, action: "reverse" })}>Reverse</Button></Can>}{row.status === "POSTED" && <Can roles={ACTION_ROLES.VOID_PAYMENT_ACCOUNT_TRANSFER}><Button size="sm" variant="outline" onClick={() => voidTransfer.mutate(row.transfer_id)}>Void</Button></Can>}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
  </>;
}
