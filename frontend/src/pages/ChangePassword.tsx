import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from "lucide-react";

import { changePassword } from "@/api/client";
import { useAuth } from "@/lib/auth";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getErrorMessage(error: unknown) {
  const axiosError = error as {
    response?: {
      data?: {
        message?: string;
      };
    };
    message?: string;
  };

  return (
    axiosError?.response?.data?.message ||
    axiosError?.message ||
    "Failed to change password."
  );
}

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, updateUser, isAuthenticated, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passwordMismatch =
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword !== confirmPassword;

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 4;

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: (response) => {
      if (response?.user) {
        updateUser(response.user);
      }

      navigate("/", { replace: true });
    },
  });

 if (!isAuthenticated || !user) {
  return <Navigate to="/login" replace />;
}

const userId = user.user_id;

function handleSubmit(event: { preventDefault: () => void }) {
  event.preventDefault();

  if (!currentPassword || !newPassword || !confirmPassword) return;
  if (passwordMismatch || passwordTooShort) return;

  mutation.mutate({
    user_id: userId,
    current_password: currentPassword,
    new_password: newPassword,
  });
}

  function handleLogout() {
    const confirmed = window.confirm("Logout without changing password?");

    if (confirmed) {
      logout();
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <Card className="w-full max-w-md rounded-3xl border-0 shadow-2xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <LockKeyhole className="h-7 w-7" />
          </div>

          <div>
            <CardTitle className="text-2xl font-bold">
              Change Password
            </CardTitle>

            <p className="mt-2 text-sm text-slate-500">
              {user.password_expired
                ? "Your password has expired. Create a new password to continue."
                : "You must change your temporary password before continuing."}
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <PasswordInput
              label="Current Password"
              value={currentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent((current) => !current)}
              onChange={setCurrentPassword}
            />

            <PasswordInput
              label="New Password"
              value={newPassword}
              show={showNew}
              onToggle={() => setShowNew((current) => !current)}
              onChange={setNewPassword}
            />

            <PasswordInput
              label="Confirm New Password"
              value={confirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((current) => !current)}
              onChange={setConfirmPassword}
            />

            {passwordTooShort && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Password too short</AlertTitle>
                <AlertDescription>
                  Password must be at least 4 characters.
                </AlertDescription>
              </Alert>
            )}

            {passwordMismatch && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Passwords do not match</AlertTitle>
                <AlertDescription>
                  New password and confirmation password must match.
                </AlertDescription>
              </Alert>
            )}

            {mutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Password change failed</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(mutation.error)}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                passwordMismatch ||
                passwordTooShort ||
                mutation.isPending
              }
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Change Password"
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  show,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-11"
        />

        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
          onClick={onToggle}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
