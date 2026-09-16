import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
} from "lucide-react";

import {
  assignUserRole,
  createRole,
  createUser,
  getRoles,
  getUsers,
  removeUserRole,
  resetUserPassword,
  updateUserStatus,
} from "@/api/client";

import Can from "@/components/Can";
import { ACTION_ROLES } from "@/lib/permissions";

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
import { Label } from "@/components/ui/label";
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

function activeBadge(value: unknown) {
  return value ? (
    <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
  ) : (
    <Badge variant="destructive">Inactive</Badge>
  );
}

function getErrorMessage(error: unknown) {
  const err = error as {
    response?: {
      data?: {
        message?: string;
        error?: string;
      };
    };
    message?: string;
  };

  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Action failed. Please try again."
  );
}

export default function Users() {
  const [search, setSearch] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AnyRecord | null>(null);

  const [newUser, setNewUser] = useState({
    username: "",
    full_name: "",
    password: "",
    password_expiry_days: "90",
    role_code: "ADMIN",
  });

  const [newRole, setNewRole] = useState({
    role_code: "",
    role_name: "",
  });

  const [roleToAssign, setRoleToAssign] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: getUsers,
  });

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: getRoles,
  });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      await usersQuery.refetch();

      setIsCreateUserOpen(false);
      setNewUser({
        username: "",
        full_name: "",
        password: "",
        password_expiry_days: "90",
        role_code: "ADMIN",
      });
      setLastRefreshed(new Date());
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: async () => {
      await rolesQuery.refetch();

      setIsCreateRoleOpen(false);
      setNewRole({
        role_code: "",
        role_name: "",
      });
      setLastRefreshed(new Date());
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({
      userId,
      roleCode,
    }: {
      userId: string;
      roleCode: string;
    }) => assignUserRole(userId, { role_code: roleCode }),
    onSuccess: async () => {
      await usersQuery.refetch();

      setRoleToAssign("");
      setLastRefreshed(new Date());
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({
      userId,
      roleCode,
    }: {
      userId: string;
      roleCode: string;
    }) => removeUserRole(userId, roleCode),
    onSuccess: async () => {
      await usersQuery.refetch();

      setLastRefreshed(new Date());
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      userId,
      isActive,
    }: {
      userId: string;
      isActive: boolean;
    }) => updateUserStatus(userId, { is_active: isActive }),
    onSuccess: async () => {
      await usersQuery.refetch();

      setLastRefreshed(new Date());
    },
  });

  const passwordMutation = useMutation({
    mutationFn: ({
      userId,
      password,
    }: {
      userId: string;
      password: string;
    }) => resetUserPassword(userId, { password }),
    onSuccess: async () => {
      setNewPassword("");
      setLastRefreshed(new Date());
    },
  });

  const users: AnyRecord[] = normalizeArray(usersQuery.data, ["users", "data"]);
  const roles: AnyRecord[] = normalizeArray(rolesQuery.data, ["roles", "data"]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return users;

    return users.filter((user) =>
      [
        user.username,
        user.full_name,
        user.is_active ? "active" : "inactive",
        JSON.stringify(user.roles || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [users, search]);

  const activeCount = filteredUsers.filter((user) => user.is_active).length;
  const inactiveCount = filteredUsers.length - activeCount;

  const selectedUserLatest =
    selectedUser &&
    users.find((user) => user.user_id === selectedUser.user_id);

  const displayedSelectedUser = selectedUserLatest || selectedUser;

  async function handleRefresh() {
    await Promise.all([usersQuery.refetch(), rolesQuery.refetch()]);
    setLastRefreshed(new Date());
  }

  function openUserDetails(user: AnyRecord) {
    setSelectedUser(user);
    setRoleToAssign("");
    setNewPassword("");
    setIsUserDetailsOpen(true);
  }

  function handleCreateUser() {
    createUserMutation.mutate({
      username: newUser.username.trim(),
      full_name: newUser.full_name.trim(),
      password: newUser.password,
      password_expiry_days: Number(newUser.password_expiry_days || 90),
      is_active: true,
      roles: [newUser.role_code],
    });
  }

  function handleCreateRole() {
    createRoleMutation.mutate({
      role_code: newRole.role_code.trim().toUpperCase(),
      role_name: newRole.role_name.trim(),
    });
  }

  if (usersQuery.isLoading || rolesQuery.isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (usersQuery.isError || rolesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Users failed to load</AlertTitle>
        <AlertDescription>
          {getErrorMessage(usersQuery.error || rolesQuery.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users & Roles</h1>
          <p className="mt-1 text-slate-500">
            Create system users, manage roles, and control account access.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          <Can roles={ACTION_ROLES.ASSIGN_ROLE}>
            <Button variant="outline" onClick={() => setIsCreateRoleOpen(true)}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              New Role
            </Button>
          </Can>

          <Can roles={ACTION_ROLES.CREATE_USER}>
            <Button onClick={() => setIsCreateUserOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New User
            </Button>
          </Can>
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
            <CardTitle className="text-sm text-slate-500">Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredUsers.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeCount}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Inactive</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{inactiveCount}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{roles.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User List
          </CardTitle>

          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search user, name, role, status..."
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Login Fail Count</TableHead>
                  <TableHead>Password Changed</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">
                        {user.username}
                      </TableCell>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell>{activeBadge(user.is_active)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(user.roles || []).map((role: AnyRecord) => (
                            <Badge key={role.role_code} variant="outline">
                              {role.role_code}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{user.login_fail_count || 0}</TableCell>
                      <TableCell>
                        {formatDateTime(user.password_last_changed)}
                      </TableCell>
                      <TableCell>{formatDateTime(user.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openUserDetails(user)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Manage
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

      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create User Account</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              label="Username"
              value={newUser.username}
              onChange={(value) => setNewUser({ ...newUser, username: value })}
            />

            <FormInput
              label="Full Name"
              value={newUser.full_name}
              onChange={(value) => setNewUser({ ...newUser, full_name: value })}
            />

            <FormInput
              label="Temporary Password"
              type="password"
              value={newUser.password}
              onChange={(value) => setNewUser({ ...newUser, password: value })}
            />

            <FormInput
              label="Password Expiry Days"
              type="number"
              value={newUser.password_expiry_days}
              onChange={(value) =>
                setNewUser({ ...newUser, password_expiry_days: value })
              }
            />

            <div className="space-y-2 md:col-span-2">
              <Label>Initial Role</Label>
              <Select
                value={newUser.role_code}
                onValueChange={(value) =>
                  setNewUser({ ...newUser, role_code: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.role_code} value={role.role_code}>
                      {role.role_code} - {role.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {createUserMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to create user</AlertTitle>
              <AlertDescription>
                {getErrorMessage(createUserMutation.error)}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setIsCreateUserOpen(false)}
            >
              Cancel
            </Button>

            <Can roles={ACTION_ROLES.CREATE_USER}>
              <Button
                onClick={handleCreateUser}
                disabled={
                  !newUser.username ||
                  !newUser.full_name ||
                  !newUser.password ||
                  !newUser.role_code ||
                  createUserMutation.isPending
                }
              >
                {createUserMutation.isPending ? "Saving..." : "Create User"}
              </Button>
            </Can>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateRoleOpen} onOpenChange={setIsCreateRoleOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create / Update Role</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <FormInput
              label="Role Code"
              value={newRole.role_code}
              onChange={(value) => setNewRole({ ...newRole, role_code: value })}
            />

            <FormInput
              label="Role Name"
              value={newRole.role_name}
              onChange={(value) => setNewRole({ ...newRole, role_name: value })}
            />
          </div>

          {createRoleMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to save role</AlertTitle>
              <AlertDescription>
                {getErrorMessage(createRoleMutation.error)}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setIsCreateRoleOpen(false)}
            >
              Cancel
            </Button>

            <Can roles={ACTION_ROLES.ASSIGN_ROLE}>
              <Button
                onClick={handleCreateRole}
                disabled={
                  !newRole.role_code ||
                  !newRole.role_name ||
                  createRoleMutation.isPending
                }
              >
                {createRoleMutation.isPending ? "Saving..." : "Save Role"}
              </Button>
            </Can>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isUserDetailsOpen} onOpenChange={setIsUserDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[96vw] !max-w-[900px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage User</DialogTitle>
          </DialogHeader>

          {displayedSelectedUser && (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-3">
                <InfoBox
                  label="Username"
                  value={displayedSelectedUser.username}
                />
                <InfoBox
                  label="Full Name"
                  value={displayedSelectedUser.full_name}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <div className="mt-1">
                    {activeBadge(displayedSelectedUser.is_active)}
                  </div>
                </div>
                <InfoBox
                  label="Created At"
                  value={formatDateTime(displayedSelectedUser.created_at)}
                />
                <InfoBox
                  label="Password Changed"
                  value={formatDateTime(
                    displayedSelectedUser.password_last_changed
                  )}
                />
                <InfoBox
                  label="Login Fail Count"
                  value={String(displayedSelectedUser.login_fail_count || 0)}
                />
              </div>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Assigned Roles</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(displayedSelectedUser.roles || []).length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No roles assigned.
                      </p>
                    ) : (
                      displayedSelectedUser.roles.map((role: AnyRecord) => (
                        <div
                          key={role.role_code}
                          className="flex items-center gap-2 rounded-full border bg-white px-3 py-1"
                        >
                          <span className="text-sm font-medium">
                            {role.role_code}
                          </span>

                          <Can roles={ACTION_ROLES.ASSIGN_ROLE}>
                            <button
                              className="text-xs text-red-600 hover:underline"
                              onClick={() =>
                                removeRoleMutation.mutate({
                                  userId: displayedSelectedUser.user_id,
                                  roleCode: role.role_code,
                                })
                              }
                            >
                              Remove
                            </button>
                          </Can>
                        </div>
                      ))
                    )}
                  </div>

                  <Can roles={ACTION_ROLES.ASSIGN_ROLE}>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <Select
                        value={roleToAssign}
                        onValueChange={setRoleToAssign}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role to assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((role) => (
                            <SelectItem
                              key={role.role_code}
                              value={role.role_code}
                            >
                              {role.role_code} - {role.role_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        disabled={!roleToAssign || assignRoleMutation.isPending}
                        onClick={() =>
                          assignRoleMutation.mutate({
                            userId: displayedSelectedUser.user_id,
                            roleCode: roleToAssign,
                          })
                        }
                      >
                        Assign Role
                      </Button>
                    </div>
                  </Can>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Account Actions</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Can
                      roles={
                        displayedSelectedUser.is_active
                          ? ACTION_ROLES.DEACTIVATE_USER
                          : ACTION_ROLES.ACTIVATE_USER
                      }
                    >
                      <Button
                        variant={
                          displayedSelectedUser.is_active
                            ? "destructive"
                            : "default"
                        }
                        onClick={() =>
                          statusMutation.mutate({
                            userId: displayedSelectedUser.user_id,
                            isActive: !displayedSelectedUser.is_active,
                          })
                        }
                      >
                        {displayedSelectedUser.is_active
                          ? "Deactivate User"
                          : "Activate User"}
                      </Button>
                    </Can>
                  </div>

                  <Can roles={ACTION_ROLES.RESET_PASSWORD}>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <Input
                        type="password"
                        placeholder="New temporary password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />

                      <Button
                        variant="outline"
                        disabled={!newPassword || passwordMutation.isPending}
                        onClick={() =>
                          passwordMutation.mutate({
                            userId: displayedSelectedUser.user_id,
                            password: newPassword,
                          })
                        }
                      >
                        Reset Password
                      </Button>
                    </div>
                  </Can>
                </CardContent>
              </Card>

              {(assignRoleMutation.isError ||
                removeRoleMutation.isError ||
                statusMutation.isError ||
                passwordMutation.isError) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>User action failed</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(
                      assignRoleMutation.error ||
                        removeRoleMutation.error ||
                        statusMutation.error ||
                        passwordMutation.error
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsUserDetailsOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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
