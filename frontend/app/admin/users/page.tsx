"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, type UserAdminRecord, type ElevationRequestRecord } from "@/lib/api";
import { InstitutionalNavbar } from "@/components/InstitutionalNavbar";
import { DotGridSpotlight } from "@/components/DotGridSpotlight";

export default function AdminUsersPage() {
  const { isAuthenticated, role, token, userEmail } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Provision modal state
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [newRole, setNewRole] = useState<"analyst" | "admin">("analyst");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // One-time password display
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [passwordNoticeUser, setPasswordNoticeUser] = useState<string | null>(null);

  // Action status message
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Elevation Requests State
  const [elevationRequests, setElevationRequests] = useState<ElevationRequestRecord[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [elevationTab, setElevationTab] = useState<"pending" | "all">("pending");

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const [userData, elevData] = await Promise.all([
        api.adminListUsers(token),
        api.adminListElevationRequests(token).catch(() => []),
      ]);
      setUsers(userData);
      setElevationRequests(elevData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load accounts";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleApproveElevation = async (req: ElevationRequestRecord) => {
    if (!token) return;
    const notes = prompt(
      `Approve analyst access for ${req.user_email}? Optional message to user:`,
      "Institutional analyst privileges approved."
    );
    if (notes === null) return;
    setActionLoadingId(req.id);
    try {
      await api.adminApproveElevationRequest(token, req.id, notes || undefined);
      setStatusMsg({
        text: `Elevation approved for ${req.user_email}. User elevated to ANALYST & confirmation email dispatched.`,
        type: "success",
      });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve elevation request";
      setStatusMsg({ text: msg, type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectElevation = async (req: ElevationRequestRecord) => {
    if (!token) return;
    const notes = prompt(
      `Reject elevation request for ${req.user_email}? Optional explanation sent to requester:`,
      "Request declined at this time."
    );
    if (notes === null) return;
    setActionLoadingId(req.id);
    try {
      await api.adminRejectElevationRequest(token, req.id, notes || undefined);
      setStatusMsg({
        text: `Elevation request rejected for ${req.user_email}. Notification email dispatched.`,
        type: "success",
      });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject elevation request";
      setStatusMsg({ text: msg, type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (role && role !== "admin") {
      // Forbidden: analyst accounts cannot access this view
      setError("Institutional Administrator privileges required. Analysts do not have access to account provisioning.");
      setLoading(false);
      return;
    }
    if (token && role === "admin") {
      fetchUsers();
    }
  }, [isAuthenticated, role, token, router, fetchUsers]);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setProvisionError(null);
    setProvisioning(true);

    try {
      const res = await api.adminProvisionUser(token, {
        email: newEmail,
        name: newName,
        organization: newOrg,
        role: newRole,
      });

      setGeneratedPassword(res.temporary_password);
      setPasswordNoticeUser(res.user.email);
      setNewEmail("");
      setNewName("");
      setNewOrg("");
      setNewRole("analyst");
      setStatusMsg({ text: `Account for ${res.user.email} provisioned.`, type: "success" });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to provision account";
      setProvisionError(msg);
    } finally {
      setProvisioning(false);
    }
  };

  const handleToggleStatus = async (user: UserAdminRecord) => {
    if (!token) return;
    if (user.email === userEmail) {
      alert("You cannot deactivate your own administrative account.");
      return;
    }
    const action = user.is_active ? "deactivate" : "reactivate";
    if (!confirm(`Are you sure you want to ${action} access for ${user.email}?`)) return;

    try {
      await api.adminToggleUserStatus(token, user.id, !user.is_active);
      setStatusMsg({
        text: `Account ${user.email} ${user.is_active ? "deactivated" : "reactivated"}.`,
        type: "success",
      });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Status update failed";
      setStatusMsg({ text: msg, type: "error" });
    }
  };

  const handleRoleChange = async (user: UserAdminRecord, nextRole: "analyst" | "admin") => {
    if (!token) return;
    if (user.email === userEmail) {
      alert("You cannot change your own authorization role.");
      return;
    }
    if (!confirm(`Change role of ${user.email} to ${nextRole.toUpperCase()}?`)) return;

    try {
      await api.adminChangeUserRole(token, user.id, nextRole);
      setStatusMsg({ text: `Role for ${user.email} updated to ${nextRole.toUpperCase()}.`, type: "success" });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Role update failed";
      setStatusMsg({ text: msg, type: "error" });
    }
  };

  const handleResetPassword = async (user: UserAdminRecord) => {
    if (!token) return;
    if (!confirm(`Reset password for ${user.email}? User will be required to create a new password on login.`)) {
      return;
    }

    try {
      const res = await api.adminResetPassword(token, user.id);
      setGeneratedPassword(res.temporary_password);
      setPasswordNoticeUser(user.email);
      setShowModal(true);
      setStatusMsg({ text: `Password reset for ${user.email}.`, type: "success" });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password reset failed";
      setStatusMsg({ text: msg, type: "error" });
    }
  };

  const copyPassword = () => {
    if (!generatedPassword) return;
    navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // RBAC Guard: If logged in as analyst
  if (role && role !== "admin") {
    return (
      <div className="min-h-screen bg-bg-void text-text-primary flex flex-col font-mono">
        <InstitutionalNavbar />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full border border-alert bg-panel p-6 text-center space-y-4 shadow-2xl">
            <div className="inline-flex p-3 rounded-full bg-alert/10 text-alert border border-alert/30">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-alert tracking-wider">[ 403 ACCESS FORBIDDEN ]</h2>
            <p className="text-xs text-text-dim leading-relaxed">
              Institutional Administrator privileges are required to access user provisioning. 
              Your active session (<span className="text-text-primary">{userEmail}</span>) has role{" "}
              <span className="text-accent-amber font-bold">ANALYST</span>.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-block px-4 py-2 border border-accent-amber text-accent-amber hover:bg-accent-amber hover:text-bg-void transition-colors text-xs font-bold"
              >
                RETURN TO DASHBOARD
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = users.filter((u) => u.is_active).length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const analystCount = users.filter((u) => u.role === "analyst").length;
  const pendingElevationCount = elevationRequests.filter((r) => r.status === "pending").length;
  const displayedElevationRequests =
    elevationTab === "pending"
      ? elevationRequests.filter((r) => r.status === "pending")
      : elevationRequests;

  return (
    <div className="min-h-screen bg-bg-void text-text-primary flex flex-col font-sans selection:bg-accent-amber selection:text-bg-void">
      <InstitutionalNavbar />

      <div className="flex-1 relative w-full bg-bg-void">
        <DotGridSpotlight className="w-full h-full min-h-[calc(100vh-180px)]">
          <main className="w-full max-w-7xl mx-auto px-4 md:px-8 py-8 relative z-10 font-mono">
            {/* Breadcrumb & Header */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-text-dim mb-1">
                  <Link href="/dashboard" className="hover:text-text-primary">
                    AeroCPI
                  </Link>
                  <span>/</span>
                  <span className="text-signal-green">ADMIN</span>
                  <span>/</span>
                  <span className="text-text-primary">USER PROVISIONING</span>
                </div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary flex items-center gap-3">
                  <span>Institutional User Management</span>
                  <span className="text-xs px-2 py-0.5 bg-signal-green/10 border border-signal-green/30 text-signal-green rounded">
                    ADMIN ONLY
                  </span>
                </h1>
                <p className="text-xs text-text-dim font-sans mt-1">
                  Controlled institutional provisioning for MoSPI, NSO, RBI, and vetted economic research institutions. Public self-registration is permanently disabled.
                </p>
              </div>

              {/* Action Button */}
              <button
                onClick={() => {
                  setGeneratedPassword(null);
                  setPasswordNoticeUser(null);
                  setShowModal(true);
                }}
                className="px-4 py-2 bg-signal-green/10 border border-signal-green text-signal-green hover:bg-signal-green hover:text-bg-void transition-colors text-xs font-bold tracking-wider flex items-center gap-2"
              >
                <span>+</span>
                <span>PROVISION NEW ACCOUNT</span>
              </button>
            </div>

            {/* Notification Banner */}
            {statusMsg && (
              <div
                className={`mb-6 p-3 text-xs border flex items-center justify-between ${
                  statusMsg.type === "success"
                    ? "bg-signal-green/10 border-signal-green/40 text-signal-green"
                    : "bg-alert/10 border-alert/40 text-alert"
                }`}
              >
                <span>{statusMsg.text}</span>
                <button
                  onClick={() => setStatusMsg(null)}
                  className="text-[10px] underline hover:opacity-80"
                >
                  DISMISS
                </button>
              </div>
            )}

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
              <div className="border border-line bg-panel p-4">
                <div className="text-[11px] text-text-dim mb-1">TOTAL ACCOUNTS</div>
                <div className="text-2xl font-bold text-text-primary">{users.length}</div>
                <div className="text-[10px] text-text-dim mt-1">Institutional records</div>
              </div>
              <div className="border border-line bg-panel p-4">
                <div className="text-[11px] text-text-dim mb-1">ACTIVE SEATS</div>
                <div className="text-2xl font-bold text-signal-green">{activeCount}</div>
                <div className="text-[10px] text-text-dim mt-1">Authorized for access</div>
              </div>
              <div className="border border-line bg-panel p-4">
                <div className="text-[11px] text-text-dim mb-1">ADMINISTRATORS</div>
                <div className="text-2xl font-bold text-accent-amber">{adminCount}</div>
                <div className="text-[10px] text-text-dim mt-1">Full control privileges</div>
              </div>
              <div className="border border-line bg-panel p-4">
                <div className="text-[11px] text-text-dim mb-1">ANALYSTS</div>
                <div className="text-2xl font-bold text-text-primary">{analystCount}</div>
                <div className="text-[10px] text-text-dim mt-1">Read & ETL compute roles</div>
              </div>
              <div
                className={`border p-4 ${
                  pendingElevationCount > 0 ? "border-accent-amber bg-accent-amber/5" : "border-line bg-panel"
                }`}
              >
                <div className="text-[11px] text-text-dim mb-1">PENDING ELEVATIONS</div>
                <div
                  className={`text-2xl font-bold ${
                    pendingElevationCount > 0 ? "text-accent-amber animate-pulse" : "text-text-primary"
                  }`}
                >
                  {pendingElevationCount}
                </div>
                <div className="text-[10px] text-text-dim mt-1">Requires review</div>
              </div>
            </div>

            {/* Pending Elevation Requests Panel */}
            <div className="mb-8 border border-line bg-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-bg-void/40 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      pendingElevationCount > 0 ? "bg-accent-amber animate-ping" : "bg-text-dim"
                    }`}
                  />
                  <span className="text-xs font-bold tracking-wider text-text-primary">
                    ANALYST ELEVATION REQUESTS
                  </span>
                  <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-accent-amber/10 border border-accent-amber/30 text-accent-amber font-mono font-bold">
                    {pendingElevationCount} PENDING
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-line text-[11px]">
                    <button
                      onClick={() => setElevationTab("pending")}
                      className={`px-2.5 py-1 ${
                        elevationTab === "pending"
                          ? "bg-accent-amber text-bg-void font-bold"
                          : "text-text-dim hover:text-text-primary"
                      }`}
                    >
                      PENDING ONLY
                    </button>
                    <button
                      onClick={() => setElevationTab("all")}
                      className={`px-2.5 py-1 ${
                        elevationTab === "all"
                          ? "bg-accent-amber text-bg-void font-bold"
                          : "text-text-dim hover:text-text-primary"
                      }`}
                    >
                      ALL HISTORY ({elevationRequests.length})
                    </button>
                  </div>
                </div>
              </div>

              {displayedElevationRequests.length === 0 ? (
                <div className="p-6 text-center text-xs text-text-dim font-sans">
                  {elevationTab === "pending"
                    ? "✓ No pending analyst elevation requests requiring review."
                    : "No elevation request history recorded."}
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {displayedElevationRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-void/20 hover:bg-bg-void/40 transition-colors"
                    >
                      <div className="space-y-1.5 max-w-2xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-text-primary">
                            {req.user_name || "Name Not Set"}
                          </span>
                          <span className="text-xs text-text-dim font-mono">
                            &lt;{req.user_email}&gt;
                          </span>
                          <span className="text-[10px] px-2 py-0.5 bg-panel border border-line text-text-dim rounded">
                            {req.user_organization || "Independent"}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border ${
                              req.status === "approved"
                                ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                                : req.status === "rejected"
                                ? "bg-alert/10 border-alert/30 text-alert"
                                : "bg-accent-amber/10 border-accent-amber/30 text-accent-amber"
                            }`}
                          >
                            {req.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="text-xs text-text-primary italic bg-bg-void/60 border border-line/60 p-2 rounded">
                          "{req.reason}"
                        </div>

                        <div className="text-[10px] text-text-dim flex items-center gap-3 font-sans flex-wrap">
                          <span>Submitted: {new Date(req.created_at).toLocaleString()}</span>
                          {req.reviewed_by && (
                            <span>Reviewed by: {req.reviewed_by}</span>
                          )}
                          {req.review_notes && (
                            <span className="italic">Note: "{req.review_notes}"</span>
                          )}
                        </div>
                      </div>

                      {req.status === "pending" && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleApproveElevation(req)}
                            disabled={actionLoadingId === req.id}
                            className="px-3 py-1.5 bg-signal-green/10 border border-signal-green text-signal-green hover:bg-signal-green hover:text-bg-void transition-colors text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>✓</span>
                            <span>APPROVE ACCESS</span>
                          </button>
                          <button
                            onClick={() => handleRejectElevation(req)}
                            disabled={actionLoadingId === req.id}
                            className="px-3 py-1.5 bg-alert/10 border border-alert text-alert hover:bg-alert hover:text-bg-void transition-colors text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>✕</span>
                            <span>REJECT</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* User Directory Table */}
            <div className="border border-line bg-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-bg-void/40">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-signal-green" />
                  <span className="text-xs font-bold tracking-wider text-text-primary">
                    AUTHENTICATED USERS DIRECTORY
                  </span>
                </div>
                <button
                  onClick={fetchUsers}
                  disabled={loading}
                  className="text-xs text-text-dim hover:text-accent-amber transition-colors flex items-center gap-1"
                >
                  <span>⟳</span>
                  <span>REFRESH</span>
                </button>
              </div>

              {loading ? (
                <div className="p-8 text-center text-xs text-text-dim animate-pulse">
                  QUERYING INSTITUTIONAL DIRECTORY...
                </div>
              ) : error ? (
                <div className="p-6 text-center text-xs text-alert">{error}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-line bg-bg-void/60 text-text-dim font-mono text-[11px]">
                        <th className="py-2.5 px-4">IDENTITY / EMAIL</th>
                        <th className="py-2.5 px-4">ORGANIZATION</th>
                        <th className="py-2.5 px-4">ROLE</th>
                        <th className="py-2.5 px-4">STATUS</th>
                        <th className="py-2.5 px-4">SECURITY FLAGS</th>
                        <th className="py-2.5 px-4">LAST LOGIN</th>
                        <th className="py-2.5 px-4 text-right">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60 font-mono">
                      {users.map((u) => {
                        const isSelf = u.email === userEmail;
                        return (
                          <tr
                            key={u.id}
                            className={`hover:bg-panel/80 transition-colors ${
                              !u.is_active ? "opacity-50" : ""
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-text-primary">{u.name || "—"}</div>
                              <div className="text-[11px] text-text-dim">{u.email}</div>
                            </td>
                            <td className="py-3 px-4 text-text-dim">
                              {u.organization || "Unassigned"}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                                  u.role === "admin"
                                    ? "bg-signal-green/10 text-signal-green border-signal-green/30"
                                    : "bg-accent-amber/10 text-accent-amber border-accent-amber/30"
                                }`}
                              >
                                {u.role.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 text-[11px] ${
                                  u.is_active ? "text-signal-green" : "text-alert"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    u.is_active ? "bg-signal-green" : "bg-alert"
                                  }`}
                                />
                                {u.is_active ? "ACTIVE" : "REVOKED"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-[11px]">
                              <div className="flex flex-col gap-0.5">
                                {u.must_change_password && (
                                  <span className="text-accent-amber text-[10px]">
                                    ⚠ Force Password Change
                                  </span>
                                )}
                                {u.has_api_key && (
                                  <span className="text-signal-green text-[10px]">
                                    ✓ API Key Provisioned
                                  </span>
                                )}
                                {!u.must_change_password && !u.has_api_key && (
                                  <span className="text-text-dim text-[10px]">Standard</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-text-dim text-[11px]">
                              {u.last_login_at
                                ? new Date(u.last_login_at).toLocaleString("en-IN", {
                                    timeZone: "Asia/Kolkata",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Never logged in"}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2 text-[11px]">
                                {u.role === "analyst" ? (
                                  <button
                                    onClick={() => handleRoleChange(u, "admin")}
                                    disabled={isSelf}
                                    className="px-2 py-1 border border-line hover:border-signal-green hover:text-signal-green transition-colors"
                                    title="Elevate to Admin"
                                  >
                                    → ADMIN
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRoleChange(u, "analyst")}
                                    disabled={isSelf}
                                    className={`px-2 py-1 border border-line hover:border-accent-amber hover:text-accent-amber transition-colors ${
                                      isSelf ? "opacity-30 cursor-not-allowed" : ""
                                    }`}
                                    title="Demote to Analyst"
                                  >
                                    → ANALYST
                                  </button>
                                )}

                                <button
                                  onClick={() => handleResetPassword(u)}
                                  className="px-2 py-1 border border-line hover:border-text-primary text-text-dim hover:text-text-primary transition-colors"
                                  title="Generate new temporary password"
                                >
                                  RESET PASS
                                </button>

                                <button
                                  onClick={() => handleToggleStatus(u)}
                                  disabled={isSelf}
                                  className={`px-2 py-1 border ${
                                    isSelf
                                      ? "border-line text-text-dim opacity-30 cursor-not-allowed"
                                      : u.is_active
                                      ? "border-alert/40 text-alert hover:bg-alert/10"
                                      : "border-signal-green/40 text-signal-green hover:bg-signal-green/10"
                                  } transition-colors`}
                                >
                                  {u.is_active ? "DEACTIVATE" : "ACTIVATE"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Security Notice Footer */}
            <div className="mt-6 border border-line/60 bg-bg-void/40 p-4 text-xs text-text-dim font-sans leading-relaxed">
              <span className="font-mono text-accent-amber font-bold">
                INSTITUTIONAL GOVERNANCE POLICY:
              </span>{" "}
              All accounts provisioned here are subject to cryptographic session auditing. Deactivating an account immediately invalidates its active sessions and associated API keys. Self-elevation and self-deactivation are strictly blocked at the database engine level.
            </div>
          </main>
        </DotGridSpotlight>
      </div>

      {/* Provision Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-bg-void/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
          <div className="max-w-lg w-full border border-line bg-panel p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span className="text-signal-green">●</span>
                <span>{generatedPassword ? "CREDENTIAL ISSUANCE" : "PROVISION INSTITUTIONAL ACCOUNT"}</span>
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setGeneratedPassword(null);
                  setPasswordNoticeUser(null);
                }}
                className="text-text-dim hover:text-text-primary text-xs"
              >
                ✕ CLOSE
              </button>
            </div>

            {generatedPassword ? (
              <div className="space-y-4">
                <div className="p-3 bg-signal-green/10 border border-signal-green/30 text-signal-green text-xs">
                  Account provisioned for <span className="font-bold">{passwordNoticeUser}</span>. Provide these initial credentials to the authorized institutional officer.
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] text-text-dim">TEMPORARY INITIAL PASSWORD (SHOWN ONCE):</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedPassword}
                      className="w-full bg-bg-void border border-accent-amber text-accent-amber font-mono font-bold text-sm px-3 py-2 select-all focus:outline-none"
                    />
                    <button
                      onClick={copyPassword}
                      className="px-3 py-2 border border-accent-amber bg-accent-amber/10 text-accent-amber hover:bg-accent-amber hover:text-bg-void transition-colors text-xs font-bold whitespace-nowrap"
                    >
                      {copied ? "COPIED ✓" : "COPY PASS"}
                    </button>
                  </div>
                </div>

                <div className="p-3 border border-line bg-bg-void/60 text-[11px] text-text-dim space-y-1 font-sans">
                  <div className="font-mono text-accent-amber font-bold">MANDATORY COMPLIANCE:</div>
                  <div>1. The account is flagged with <code className="text-accent-amber">must_change_password=true</code>.</div>
                  <div>2. On their initial login, the user will be forced to specify a new password before accessing data.</div>
                  <div>3. This initial secret is not stored plaintext and will not be displayed again.</div>
                </div>

                <button
                  onClick={() => {
                    setShowModal(false);
                    setGeneratedPassword(null);
                    setPasswordNoticeUser(null);
                  }}
                  className="w-full py-2 border border-line bg-bg-void text-text-primary hover:bg-panel transition-colors text-xs font-bold"
                >
                  DISMISS & FINISH
                </button>
              </div>
            ) : (
              <form onSubmit={handleProvision} className="space-y-3">
                {provisionError && (
                  <div className="p-2.5 bg-alert/10 border border-alert/30 text-alert text-xs">
                    {provisionError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-text-dim mb-1">
                    OFFICIAL INSTITUTIONAL EMAIL *
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. s.verma@mospi.gov.in"
                    className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-signal-green focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-dim mb-1">
                    OFFICER FULL NAME *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Dr. Sunita Verma"
                    className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-signal-green focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-dim mb-1">
                    INSTITUTION / DEPARTMENT *
                  </label>
                  <input
                    type="text"
                    required
                    value={newOrg}
                    onChange={(e) => setNewOrg(e.target.value)}
                    placeholder="e.g. MoSPI — Price Statistics Division"
                    className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-signal-green focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-dim mb-1">
                    AUTHORIZATION ROLE *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as "analyst" | "admin")}
                    className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-signal-green focus:outline-none"
                  >
                    <option value="analyst">ANALYST — Read-only index queries + pipeline compute execution</option>
                    <option value="admin">ADMIN — Full institutional administrator + user provisioning</option>
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1.5 text-xs text-text-dim hover:text-text-primary"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={provisioning}
                    className="px-4 py-1.5 bg-signal-green/20 border border-signal-green text-signal-green hover:bg-signal-green hover:text-bg-void transition-colors text-xs font-bold disabled:opacity-50"
                  >
                    {provisioning ? "PROVISIONING..." : "GENERATE CREDENTIALS"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
