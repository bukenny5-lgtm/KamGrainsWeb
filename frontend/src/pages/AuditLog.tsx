import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Database,
  Eye,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import {
  getAuditEventActions,
  getAuditEventById,
  getAuditEvents,
  getAuditEventTables,
  getBackdateEvents,
  getBackdateEventById,
} from "@/api/client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AnyRecord = Record<string, any>;

function normalizeArray(data: any, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;

  return [];
}

function formatDateTime(value: unknown) {
  if (!value) return "-";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function formatDate(value: unknown) {
  if (!value) return "-";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString();
}

function actionBadge(action: unknown, label?: unknown) {
  const text = String(action || "").toUpperCase();
  const display = String(label || action || "-").toUpperCase();

  if (text === "I" || display === "INSERT") {
    return <Badge className="bg-green-600 hover:bg-green-600">INSERT</Badge>;
  }

  if (text === "U" || display === "UPDATE") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">UPDATE</Badge>;
  }

  if (text === "D" || display === "DELETE") {
    return <Badge variant="destructive">DELETE</Badge>;
  }

  return <Badge variant="outline">{display}</Badge>;
}

function shortJson(value: unknown) {
  if (!value) return "-";

  try {
    const text = JSON.stringify(value);
    return text.length > 90 ? `${text.slice(0, 90)}...` : text;
  } catch {
    return String(value);
  }
}

function changeTypeBadge(type: string | undefined) {
  const t = String(type || "").toUpperCase();
  if (t === "CREATE") {
    return <Badge className="bg-green-600 hover:bg-green-600">CREATE</Badge>;
  }
  if (t === "UPDATE") {
    return <Badge className="bg-blue-600 hover:bg-blue-600">UPDATE</Badge>;
  }
  return <Badge variant="outline">{t || "-"}</Badge>;
}

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [eventType, setEventType] = useState<"regular" | "backdate">("regular");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState<"regular" | "backdate">("regular");

  // Regular audit queries
  const eventsQuery = useQuery({
    queryKey: ["audit-events", tableFilter, actionFilter],
    queryFn: () =>
      getAuditEvents({
        table_name: tableFilter === "ALL" ? undefined : tableFilter,
        action: actionFilter === "ALL" ? undefined : actionFilter,
        limit: 500,
      }),
    enabled: eventType === "regular",
  });

  const tablesQuery = useQuery({
    queryKey: ["audit-event-tables"],
    queryFn: getAuditEventTables,
    enabled: eventType === "regular",
  });

  const actionsQuery = useQuery({
    queryKey: ["audit-event-actions"],
    queryFn: getAuditEventActions,
    enabled: eventType === "regular",
  });

  // Backdate events query
  const backdateEventsQuery = useQuery({
    queryKey: ["backdate-events"],
    queryFn: () => getBackdateEvents({ limit: 500 }),
    enabled: eventType === "backdate",
  });

  const detailQuery = useQuery({
    queryKey: ["audit-event-detail", selectedEventId, selectedEventType],
    queryFn: () =>
      selectedEventType === "regular"
        ? getAuditEventById(selectedEventId as string)
        : getBackdateEventById(selectedEventId as string),
    enabled: Boolean(selectedEventId && isDetailsOpen),
  });

  const events: AnyRecord[] =
    eventType === "regular"
      ? normalizeArray(eventsQuery.data, ["data"])
      : normalizeArray(backdateEventsQuery.data, ["data"]);

  const auditedTables: AnyRecord[] = normalizeArray(tablesQuery.data, ["data"]);
  const actions: AnyRecord[] = normalizeArray(actionsQuery.data, ["data"]);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return events;

    return events.filter((event) => {
      const searchable = eventType === "regular"
        ? [
            event.event_ts,
            event.action,
            event.action_label,
            event.table_name,
            event.schema_name,
            event.object_name,
            JSON.stringify(event.row_pk || {}),
            JSON.stringify(event.row_data || {}),
            event.user_id,
            event.client_addr,
            event.txid,
          ]
        : [
            event.table_name,
            event.created_by_username,
            event.created_date,
            event.days_backdated,
            event.backdate_reason,
            event.approved_by_username,
            event.change_type,
            event.record_id,
          ];
      return searchable.join(" ").toLowerCase().includes(term);
    });
  }, [events, search, eventType]);

  const insertCount = filteredEvents.filter(
    (event) => String(event.action).toUpperCase() === "I"
  ).length;

  const updateCount = filteredEvents.filter(
    (event) => String(event.action).toUpperCase() === "U"
  ).length;

  const deleteCount = filteredEvents.filter(
    (event) => String(event.action).toUpperCase() === "D"
  ).length;

  const backdateCreateCount = filteredEvents.filter(
    (event) => String(event.change_type).toUpperCase() === "CREATE"
  ).length;

  const backdateUpdateCount = filteredEvents.filter(
    (event) => String(event.change_type).toUpperCase() === "UPDATE"
  ).length;

  const selectedEvent: AnyRecord | undefined =
    detailQuery.data?.data || undefined;

  async function handleRefresh() {
    if (eventType === "regular") {
      await Promise.all([
        eventsQuery.refetch(),
        tablesQuery.refetch(),
        actionsQuery.refetch(),
      ]);
    } else {
      await backdateEventsQuery.refetch();
    }
    setLastRefreshed(new Date());
  }

  function openDetails(eventId: string, type: "regular" | "backdate") {
    setSelectedEventId(eventId);
    setSelectedEventType(type);
    setIsDetailsOpen(true);
  }

  const isLoading =
    (eventType === "regular" &&
      (eventsQuery.isLoading || tablesQuery.isLoading || actionsQuery.isLoading)) ||
    (eventType === "backdate" && backdateEventsQuery.isLoading);

  const isError =
    (eventType === "regular" && eventsQuery.isError) ||
    (eventType === "backdate" && backdateEventsQuery.isError);

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (isError) {
    const errorMsg =
      (eventType === "regular" ? eventsQuery.error : backdateEventsQuery.error) as Error;
    return (
      <Alert variant="destructive">
        <AlertTitle>Audit log failed to load</AlertTitle>
        <AlertDescription>
          {errorMsg?.message || "Check backend connection."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="mt-1 text-slate-500">
            {eventType === "regular"
              ? "Existing database audit trail from audit.event triggers."
              : "Backdated transactions log from audit.backdate_event."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={eventType}
            onValueChange={(value) => setEventType(value as "regular" | "backdate")}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select audit type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">Regular Audit</SelectItem>
              <SelectItem value="backdate">Backdated Events</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-slate-500">
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredEvents.length}</p>
          </CardContent>
        </Card>

        {eventType === "regular" ? (
          <>
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-slate-500">Inserts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{insertCount}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-slate-500">Updates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{updateCount}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-slate-500">Deletes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{deleteCount}</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-slate-500">Creates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{backdateCreateCount}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-slate-500">Updates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{backdateUpdateCount}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-slate-500">Total Backdays</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {filteredEvents.reduce(
                    (sum, e) => sum + Number(e.days_backdated || 0),
                    0
                  )}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Event List
          </CardTitle>

          <div className="grid gap-3 xl:grid-cols-[1fr_260px_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search..."
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {eventType === "regular" && (
              <>
                <Select value={tableFilter} onValueChange={setTableFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter table" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Tables</SelectItem>
                    {auditedTables.map((item) => (
                      <SelectItem key={item.table_name} value={item.table_name}>
                        {item.table_name} ({item.event_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Actions</SelectItem>
                    {actions.map((item) => (
                      <SelectItem key={item.action} value={item.action}>
                        {item.action_label} ({item.event_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                {eventType === "regular" ? (
                  <TableRow>
                    <TableHead>Event Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Row Key</TableHead>
                    <TableHead>Row Data</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>TxID</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Record ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Change Type</TableHead>
                    <TableHead>Backdated Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Approved By</TableHead>
                    <TableHead>Approved At</TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                )}
              </TableHeader>

              <TableBody>
                {filteredEvents.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={eventType === "regular" ? 9 : 10}
                      className="h-24 text-center"
                    >
                      No events found.
                    </TableCell>
                  </TableRow>
                ) : eventType === "regular" ? (
                  filteredEvents.map((event) => (
                    <TableRow key={event.event_id}>
                      <TableCell>{formatDateTime(event.event_ts)}</TableCell>
                      <TableCell>
                        {actionBadge(event.action, event.action_label)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {event.table_name}
                      </TableCell>
                      <TableCell className="max-w-52 truncate text-xs">
                        {shortJson(event.row_pk)}
                      </TableCell>
                      <TableCell className="max-w-80 truncate text-xs">
                        {shortJson(event.row_data)}
                      </TableCell>
                      <TableCell>{event.client_addr || "-"}</TableCell>
                      <TableCell>{event.txid || "-"}</TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
                        {event.user_id || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(event.event_id, "regular")}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  filteredEvents.map((event) => (
                    <TableRow key={event.backdate_event_id}>
                      <TableCell>{formatDate(event.created_date)}</TableCell>
                      <TableCell className="font-medium">
                        {event.table_name}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
                        {event.record_id}
                      </TableCell>
                      <TableCell>{event.created_by_username || event.created_by || "-"}</TableCell>
                      <TableCell>{changeTypeBadge(event.change_type)}</TableCell>
                      <TableCell>{event.days_backdated}</TableCell>
                      <TableCell className="max-w-40 truncate">
                        {event.backdate_reason || "-"}
                      </TableCell>
                      <TableCell>{event.approved_by_username || event.approved_by || "-"}</TableCell>
                      <TableCell>{formatDateTime(event.approved_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openDetails(String(event.backdate_event_id), "backdate")
                          }
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[1050px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEventType === "regular" ? "Audit Event Details" : "Backdated Event Details"}
            </DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load event</AlertTitle>
              <AlertDescription>
                {(detailQuery.error as Error)?.message || "Please try again."}
              </AlertDescription>
            </Alert>
          ) : !selectedEvent ? (
            <Alert>
              <AlertTitle>No event selected</AlertTitle>
              <AlertDescription>
                The selected event could not be found.
              </AlertDescription>
            </Alert>
          ) : selectedEventType === "regular" ? (
            // Regular audit event detail
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox
                  label="Event Time"
                  value={formatDateTime(selectedEvent.event_ts)}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Action
                  </p>
                  <div className="mt-1">
                    {actionBadge(selectedEvent.action, selectedEvent.action_label)}
                  </div>
                </div>
                <InfoBox label="Table" value={selectedEvent.table_name || "-"} />
                <InfoBox label="Transaction ID" value={String(selectedEvent.txid || "-")} />
                <InfoBox label="Schema" value={selectedEvent.schema_name || "-"} />
                <InfoBox label="Object" value={selectedEvent.object_name || "-"} />
                <InfoBox label="Client Address" value={selectedEvent.client_addr || "-"} />
                <InfoBox label="User ID" value={selectedEvent.user_id || "-"} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <JsonBox title="Row Primary Key" data={selectedEvent.row_pk} />
                <JsonBox title="Row Data" data={selectedEvent.row_data} />
              </div>
            </div>
          ) : (
            // Backdated event detail
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-4">
                <InfoBox label="Event ID" value={String(selectedEvent.backdate_event_id)} />
                <InfoBox label="Table" value={selectedEvent.table_name || "-"} />
                <InfoBox label="Record ID" value={selectedEvent.record_id || "-"} />
                <InfoBox label="Change Type" value={selectedEvent.change_type || "-"} />
                <InfoBox label="Created Date" value={formatDate(selectedEvent.created_date)} />
                <InfoBox label="System Date" value={formatDateTime(selectedEvent.system_date)} />
                <InfoBox label="Days Backdated" value={String(selectedEvent.days_backdated)} />
                <InfoBox label="Created By" value={selectedEvent.created_by_username || selectedEvent.created_by || "-"} />
                <InfoBox label="Backdate Reason" value={selectedEvent.backdate_reason || "-"} />
                <InfoBox label="Approved By" value={selectedEvent.approved_by_username || selectedEvent.approved_by || "-"} />
                <InfoBox label="Approved At" value={formatDateTime(selectedEvent.approved_at)} />
                <InfoBox label="Logged At" value={formatDateTime(selectedEvent.created_at)} />
              </div>
            </div>
          )}

          <div className="flex justify-end border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setIsDetailsOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words font-semibold">{value || "-"}</p>
    </div>
  );
}

function JsonBox({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-slate-500" />
        <h3 className="font-semibold">{title}</h3>
      </div>

      <pre className="max-h-96 overflow-auto rounded-xl bg-white p-3 text-xs">
        {data ? JSON.stringify(data, null, 2) : "-"}
      </pre>
    </div>
  );
}