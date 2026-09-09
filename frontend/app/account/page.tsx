"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  api,
  API_BASE,
  type UserProfileRecord,
  type LoginEventRecord,
  type ApiKeyGenerateResponse,
  type ElevationRequestRecord,
} from "@/lib/api";
import { InstitutionalNavbar } from "@/components/InstitutionalNavbar";
import { DotGridSpotlight } from "@/components/DotGridSpotlight";

export default function AccountProfilePage() {
  const { isAuthenticated, token, userEmail, mustChangePassword, updateAuthState } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginEventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile Edit State
  const [nameInput, setNameInput] = useState("");
  const [orgInput, setOrgInput] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // API Key State
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyMsg, setApiKeyMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Elevation Request State
  const [elevationRequest, setElevationRequest] = useState<ElevationRequestRecord | null>(null);
  const [elevationReason, setElevationReason] = useState("");
  const [elevationSubmitting, setElevationSubmitting] = useState(false);
  const [elevationMsg, setElevationMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [profData, historyData, elevData] = await Promise.all([
        api.getProfile(token),
        api.getLoginHistory(token).catch(() => []),
        api.getElevationRequest(token).catch(() => ({ request: null })),
      ]);
      setProfile(profData);
      setNameInput(profData.name || "");
      setOrgInput(profData.organization || "");
      setLoginHistory(historyData);
      setElevationRequest(elevData?.request || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load account details";
      setProfileMsg({ text: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleSubmitElevation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (elevationReason.trim().length < 10) {
      setElevationMsg({ text: "Please provide a detailed justification (at least 10 characters).", type: "error" });
      return;
    }
    setElevationSubmitting(true);
    setElevationMsg(null);
    try {
      const res = await api.submitElevationRequest(token, elevationReason.trim());
      setElevationRequest(res.request);
      setElevationReason("");
      setElevationMsg({
        text: res.message || "Elevation request submitted. Institutional administrators have been notified via email.",
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit elevation request";
      setElevationMsg({ text: msg, type: "error" });
    } finally {
      setElevationSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [isAuthenticated, router, loadData]);

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setProfileSaving(true);
    setProfileMsg(null);

    try {
      const updated = await api.updateProfile(token, {
        name: nameInput,
        organization: orgInput,
      });
      setProfile(updated);
      updateAuthState({ userName: updated.name, userOrganization: updated.organization });
      setProfileMsg({ text: "Profile details updated successfully.", type: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Profile update failed";
      setProfileMsg({ text: msg, type: "error" });
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "New password and confirmation do not match.", type: "error" });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ text: "Password must be at least 8 characters.", type: "error" });
      return;
    }

    setPasswordSaving(true);
    try {
      await api.changePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      updateAuthState({ mustChangePassword: false });
      if (profile) setProfile({ ...profile, must_change_password: false });
      setPasswordMsg({
        text: "Permanent password set successfully! Temporary restriction lifted.",
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password change failed";
      setPasswordMsg({ text: msg, type: "error" });
    } finally {
      setPasswordSaving(false);
    }
  };

  // Handle Generate API Key
  const handleGenerateApiKey = async () => {
    if (!token) return;
    if (profile?.api_key_prefix) {
      if (!confirm("Regenerating an API key will immediately invalidate your existing key. Continue?")) {
        return;
      }
    }
    setApiKeyLoading(true);
    setApiKeyMsg(null);

    try {
      const res: ApiKeyGenerateResponse = await api.generateApiKey(token);
      setNewlyGeneratedKey(res.api_key);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              api_key_prefix: res.prefix,
              api_key_created_at: res.created_at,
            }
          : null
      );
      setApiKeyMsg({
        text: "New personal API key created. Copy and store it immediately in your secure store.",
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate API key";
      setApiKeyMsg({ text: msg, type: "error" });
    } finally {
      setApiKeyLoading(false);
    }
  };

  // Handle Revoke API Key
  const handleRevokeApiKey = async () => {
    if (!token) return;
    if (!confirm("Are you sure you want to revoke your API key? All programmatic integrations using it will immediately cease to function.")) {
      return;
    }
    setApiKeyLoading(true);
    setApiKeyMsg(null);

    try {
      await api.revokeApiKey(token);
      setNewlyGeneratedKey(null);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              api_key_prefix: null,
              api_key_created_at: null,
            }
          : null
      );
      setApiKeyMsg({ text: "API key revoked successfully.", type: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke API key";
      setApiKeyMsg({ text: msg, type: "error" });
    } finally {
      setApiKeyLoading(false);
    }
  };

  const copyApiKey = () => {
    if (!newlyGeneratedKey) return;
    navigator.clipboard.writeText(newlyGeneratedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const isPasswordChangeMandatory = mustChangePassword || profile?.must_change_password;

  return (
    <div className="min-h-screen bg-bg-void text-text-primary flex flex-col font-sans selection:bg-accent-amber selection:text-bg-void">
      <InstitutionalNavbar />

      <div className="flex-1 relative w-full bg-bg-void">
        <DotGridSpotlight className="w-full h-full min-h-[calc(100vh-180px)]">
          <main className="w-full max-w-7xl mx-auto px-4 md:px-8 py-8 relative z-10 font-mono">
            {/* Breadcrumb & Header */}
            <div className="mb-6 border-b border-line pb-4">
              <div className="flex items-center gap-2 text-xs text-text-dim mb-1">
                <Link href="/dashboard" className="hover:text-text-primary">
                  AeroCPI
                </Link>
                <span>/</span>
                <span className="text-text-primary">ACCOUNT & PROFILE</span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary flex items-center gap-3">
                <span>Institutional Account & Security</span>
                {profile?.role && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${
                      profile.role === "admin"
                        ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                        : "bg-accent-amber/10 border-accent-amber/30 text-accent-amber"
                    }`}
                  >
                    ROLE: {profile.role.toUpperCase()}
                  </span>
                )}
              </h1>
              <p className="text-xs text-text-dim font-sans mt-1">
                Manage your institutional identity, credential rotation, session audit history, and programmatic API access keys.
              </p>
            </div>

            {/* First Login Warning Banner */}
            {isPasswordChangeMandatory && (
              <div className="mb-6 p-4 border-2 border-accent-amber bg-accent-amber/10 text-text-primary flex items-start gap-3">
                <span className="text-accent-amber text-lg font-bold">⚠</span>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-accent-amber font-mono">
                    FIRST-LOGIN INITIALIZATION REQUIRED
                  </div>
                  <div className="text-xs text-text-primary font-sans">
                    You are currently using an administrator-provisioned temporary password. 
                    Please set a permanent password in the <strong className="font-mono text-accent-amber">Credential Management</strong> section below to complete your institutional onboarding.
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center text-xs text-text-dim animate-pulse">
                RETRIEVING INSTITUTIONAL CREDENTIAL RECORD...
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Profile & Password */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Card 1: Institutional Identity */}
                  <div className="border border-line bg-panel p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <h2 className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span className="text-accent-amber">■</span>
                        <span>INSTITUTIONAL PROFILE & AFFILIATION</span>
                      </h2>
                      <span className="text-[10px] text-text-dim">
                        UID: #{profile?.id || "—"}
                      </span>
                    </div>

                    {profileMsg && (
                      <div
                        className={`p-2.5 text-xs border ${
                          profileMsg.type === "success"
                            ? "bg-signal-green/10 border-signal-green/40 text-signal-green"
                            : "bg-alert/10 border-alert/40 text-alert"
                        }`}
                      >
                        {profileMsg.text}
                      </div>
                    )}

                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            REGISTERED EMAIL (IMMUTABLE)
                          </label>
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={profile?.email || ""}
                            className="w-full bg-bg-void/60 border border-line px-3 py-1.5 text-xs text-text-dim cursor-not-allowed select-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            ACCESS ROLE (ADMIN CONTROLLED)
                          </label>
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={profile?.role ? profile.role.toUpperCase() : ""}
                            className="w-full bg-bg-void/60 border border-line px-3 py-1.5 text-xs text-text-dim cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            OFFICER / RESEARCHER NAME *
                          </label>
                          <input
                            type="text"
                            required
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="e.g. Dr. Rajeshwari Sundaram"
                            className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-accent-amber focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            INSTITUTION / DEPARTMENT *
                          </label>
                          <input
                            type="text"
                            required
                            value={orgInput}
                            onChange={(e) => setOrgInput(e.target.value)}
                            placeholder="e.g. Reserve Bank of India — DEPR"
                            className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-accent-amber focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="submit"
                          disabled={profileSaving}
                          className="px-4 py-1.5 border border-accent-amber text-accent-amber hover:bg-accent-amber hover:text-bg-void transition-colors text-xs font-bold disabled:opacity-50"
                        >
                          {profileSaving ? "SAVING..." : "UPDATE PROFILE"}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Card 2: Password & Credentials */}
                  <div
                    className={`border bg-panel p-5 space-y-4 ${
                      isPasswordChangeMandatory ? "border-accent-amber" : "border-line"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <h2 className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span className="text-signal-green">■</span>
                        <span>CREDENTIAL MANAGEMENT & ROTATION</span>
                      </h2>
                      {isPasswordChangeMandatory && (
                        <span className="text-[10px] text-accent-amber font-bold">
                          ACTION MANDATORY
                        </span>
                      )}
                    </div>

                    {passwordMsg && (
                      <div
                        className={`p-2.5 text-xs border ${
                          passwordMsg.type === "success"
                            ? "bg-signal-green/10 border-signal-green/40 text-signal-green"
                            : "bg-alert/10 border-alert/40 text-alert"
                        }`}
                      >
                        {passwordMsg.text}
                      </div>
                    )}

                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            CURRENT PASSWORD *
                          </label>
                          <input
                            type="password"
                            required
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="••••••••••••"
                            className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-signal-green focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            NEW PASSWORD (MIN 8) *
                          </label>
                          <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••••••"
                            className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-signal-green focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            CONFIRM PASSWORD *
                          </label>
                          <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••••••"
                            className="w-full bg-bg-void border border-line px-3 py-1.5 text-xs text-text-primary focus:border-signal-green focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-text-dim font-sans">
                          Argon2id cryptographic hashing applied with unique salt.
                        </span>
                        <button
                          type="submit"
                          disabled={passwordSaving}
                          className="px-4 py-1.5 bg-signal-green/20 border border-signal-green text-signal-green hover:bg-signal-green hover:text-bg-void transition-colors text-xs font-bold disabled:opacity-50"
                        >
                          {passwordSaving ? "ROTATING..." : "CHANGE PASSWORD"}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Card: Analyst Role Elevation Request */}
                  <div className="border border-line bg-panel p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <h2 className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span className="text-accent-amber">▲</span>
                        <span>ANALYST ROLE ELEVATION REQUEST</span>
                      </h2>
                      {profile?.role === "analyst" || profile?.role === "admin" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-signal-green/10 border border-signal-green/30 text-signal-green rounded">
                          ACTIVE: {profile.role.toUpperCase()}
                        </span>
                      ) : elevationRequest?.status === "pending" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-accent-amber/10 border border-accent-amber/30 text-accent-amber rounded animate-pulse">
                          PENDING ADMIN REVIEW
                        </span>
                      ) : elevationRequest?.status === "approved" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-signal-green/10 border border-signal-green/30 text-signal-green rounded">
                          APPROVED
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-dim">
                          CURRENT ROLE: {String(profile?.role || "viewer").toUpperCase()}
                        </span>
                      )}
                    </div>

                    {elevationMsg && (
                      <div
                        className={`p-2.5 text-xs border ${
                          elevationMsg.type === "success"
                            ? "bg-signal-green/10 border-signal-green/40 text-signal-green"
                            : "bg-alert/10 border-alert/40 text-alert"
                        }`}
                      >
                        {elevationMsg.text}
                      </div>
                    )}

                    {profile?.role === "analyst" || profile?.role === "admin" ? (
                      <div className="p-4 border border-signal-green/20 bg-signal-green/5 text-xs text-text-dim space-y-1 font-sans">
                        <div className="font-mono text-signal-green font-bold">
                          FULL ANALYST PRIVILEGES ACTIVE
                        </div>
                        <p>
                          Your account holds institutional <strong className="text-text-primary font-mono">{profile.role.toUpperCase()}</strong> authority. You have unrestricted access to raw multilateral flight quotes, GEKS-Törnqvist series, and pipeline execution.
                        </p>
                      </div>
                    ) : elevationRequest && elevationRequest.status === "pending" ? (
                      <div className="p-4 border border-accent-amber/30 bg-accent-amber/5 text-xs space-y-2">
                        <div className="flex items-center justify-between text-accent-amber font-mono font-bold">
                          <span>REQUEST SUBMITTED &amp; PENDING REVIEW</span>
                          <span className="text-[10px] font-normal text-text-dim">
                            {new Date(elevationRequest.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-text-dim font-sans">
                          An institutional administrator has been notified via email. Your justification is queued for evaluation in the Administrative Console.
                        </div>
                        <div className="p-2.5 bg-bg-void border border-line text-[11px] text-text-primary italic">
                          "{elevationRequest.reason}"
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitElevation} className="space-y-4">
                        <p className="text-xs text-text-dim font-sans leading-relaxed">
                          Request elevation from <strong className="font-mono text-text-primary">VIEWER</strong> to <strong className="font-mono text-accent-amber">ANALYST</strong>. Submitting this form sends an instant notification email to the institutional administrator for verification.
                        </p>

                        <div>
                          <label className="block text-[11px] text-text-dim mb-1">
                            JUSTIFICATION &amp; USE CASE * (MIN 10 CHARS)
                          </label>
                          <textarea
                            required
                            rows={3}
                            value={elevationReason}
                            onChange={(e) => setElevationReason(e.target.value)}
                            placeholder="State your institutional role, department, and why you require multilateral fare index access (e.g. NSO transport price research)..."
                            className="w-full bg-bg-void border border-line p-2.5 text-xs text-text-primary focus:border-accent-amber focus:outline-none resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-text-dim font-sans">
                            Notification sent to institutional admin upon submission.
                          </span>
                          <button
                            type="submit"
                            disabled={elevationSubmitting || !elevationReason.trim()}
                            className="px-4 py-2 bg-accent-amber text-bg-void font-bold text-xs hover:bg-accent-amber/90 transition-colors disabled:opacity-50"
                          >
                            {elevationSubmitting ? "NOTIFYING ADMIN..." : "REQUEST ANALYST ACCESS →"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Card 3: Scoped Login History */}
                  <div className="border border-line bg-panel p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <h2 className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span className="text-accent-amber">■</span>
                        <span>SESSION AUDIT & ACCESS LOG (LAST 25 EVENTS)</span>
                      </h2>
                      <span className="text-[10px] text-text-dim">
                        SCOPED TO YOUR ACCOUNT
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-line/60">
                      <table className="w-full text-left text-xs border-collapse font-mono">
                        <thead>
                          <tr className="border-b border-line bg-bg-void/60 text-text-dim text-[10px]">
                            <th className="py-2 px-3">TIMESTAMP (UTC)</th>
                            <th className="py-2 px-3">CLIENT IP</th>
                            <th className="py-2 px-3">USER AGENT</th>
                            <th className="py-2 px-3 text-right">EVENT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/40 text-[11px]">
                          {loginHistory.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-text-dim">
                                No prior authentication events recorded.
                              </td>
                            </tr>
                          ) : (
                            loginHistory.map((e) => (
                              <tr key={e.id} className="hover:bg-panel/80">
                                <td className="py-2 px-3 text-text-dim whitespace-nowrap">
                                  {new Date(e.timestamp).toLocaleString("en-IN", {
                                    timeZone: "Asia/Kolkata",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </td>
                                <td className="py-2 px-3 font-mono text-text-primary">
                                  {e.ip_address}
                                </td>
                                <td className="py-2 px-3 text-text-dim max-w-xs truncate font-sans text-[10px]">
                                  {e.user_agent}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <span
                                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                      e.status === "success"
                                        ? "bg-signal-green/10 text-signal-green border border-signal-green/30"
                                        : "bg-alert/10 text-alert border border-alert/30"
                                    }`}
                                  >
                                    {e.status.toUpperCase()}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right 1 Col: Programmatic API Key & Automation */}
                <div className="space-y-6">
                  {/* API Key Panel */}
                  <div className="border border-line bg-panel p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <h2 className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span className="text-signal-green">■</span>
                        <span>PROGRAMMATIC API KEY</span>
                      </h2>
                      <span className="text-[10px] text-text-dim">X-API-Key</span>
                    </div>

                    <p className="text-xs text-text-dim font-sans leading-relaxed">
                      Personal high-entropy keys allow pipeline automation, cron ingestion, and scripted economic models (R / Python / Stata) to query AeroCPI without interactive login.
                    </p>

                    {apiKeyMsg && (
                      <div
                        className={`p-2.5 text-xs border ${
                          apiKeyMsg.type === "success"
                            ? "bg-signal-green/10 border-signal-green/40 text-signal-green"
                            : "bg-alert/10 border-alert/40 text-alert"
                        }`}
                      >
                        {apiKeyMsg.text}
                      </div>
                    )}

                    {/* Active Key Display or Prompt */}
                    {newlyGeneratedKey ? (
                      <div className="space-y-2 p-3 border border-signal-green bg-signal-green/10">
                        <div className="text-[10px] text-signal-green font-bold flex items-center justify-between">
                          <span>PLAINTEXT KEY (SHOWN ONCE):</span>
                          <span className="text-[9px] bg-alert/20 text-alert px-1">EPHEMERAL VIEW</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            readOnly
                            value={newlyGeneratedKey}
                            className="w-full bg-bg-void border border-line px-2 py-1.5 text-xs font-mono text-signal-green select-all focus:outline-none"
                          />
                          <button
                            onClick={copyApiKey}
                            className="px-2.5 py-1.5 border border-signal-green bg-signal-green text-bg-void hover:bg-signal-green/80 transition-colors text-[11px] font-bold whitespace-nowrap"
                          >
                            {copiedKey ? "COPIED" : "COPY"}
                          </button>
                        </div>
                        <div className="text-[10px] text-text-dim font-sans leading-tight">
                          This key is now saved hashed at rest via SHA-256. It cannot be recovered if lost.
                        </div>
                      </div>
                    ) : profile?.api_key_prefix ? (
                      <div className="p-3 border border-line bg-bg-void/60 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-text-dim">ACTIVE KEY:</span>
                          <span className="text-signal-green font-bold">SHA-256 SECURED</span>
                        </div>
                        <div className="font-mono text-sm text-text-primary tracking-wider bg-bg-void p-2 border border-line">
                          {profile.api_key_prefix}••••••••••••
                        </div>
                        <div className="text-[10px] text-text-dim flex justify-between">
                          <span>Created: {new Date(profile.api_key_created_at!).toLocaleDateString("en-IN")}</span>
                          <span className="text-signal-green">Status: Active</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border border-dashed border-line text-center text-xs text-text-dim">
                        No programmatic API key currently active.
                      </div>
                    )}

                    {/* Key Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleGenerateApiKey}
                        disabled={apiKeyLoading}
                        className="flex-1 py-1.5 border border-signal-green/80 bg-signal-green/10 text-signal-green hover:bg-signal-green hover:text-bg-void transition-colors text-xs font-bold disabled:opacity-50"
                      >
                        {profile?.api_key_prefix ? "REGENERATE KEY" : "CREATE API KEY"}
                      </button>

                      {profile?.api_key_prefix && (
                        <button
                          onClick={handleRevokeApiKey}
                          disabled={apiKeyLoading}
                          className="py-1.5 px-3 border border-alert/60 text-alert hover:bg-alert hover:text-bg-void transition-colors text-xs font-bold disabled:opacity-50"
                        >
                          REVOKE
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Programmatic Usage Snippet */}
                  <div className="border border-line bg-panel p-5 space-y-3 font-mono text-xs">
                    <div className="text-xs font-bold text-accent-amber border-b border-line pb-2">
                      DEVELOPER & CLI INTEGRATION
                    </div>
                    <p className="text-[11px] text-text-dim font-sans leading-relaxed">
                      Supply the API key via the <code className="text-text-primary">X-API-Key</code> request header:
                    </p>

                    <div className="p-3 bg-bg-void border border-line text-[11px] overflow-x-auto space-y-2 text-text-dim">
                      <div className="text-text-dim"># 1. Daily Multilateral Index</div>
                      <div className="text-signal-green select-all">
                        curl -H &quot;X-API-Key: {profile?.api_key_prefix ? `${profile.api_key_prefix}...` : "aero_live_TOKEN"}&quot; \<br />
                        &nbsp;&nbsp;{API_BASE}/index/daily
                      </div>

                      <div className="text-text-dim pt-2"># 2. Raw Verified Fare Quotes</div>
                      <div className="text-signal-green select-all">
                        curl -H &quot;X-API-Key: {profile?.api_key_prefix ? `${profile.api_key_prefix}...` : "aero_live_TOKEN"}&quot; \<br />
                        &nbsp;&nbsp;&quot;{API_BASE}/fares/raw?route=DEL-BOM&amp;limit=10&quot;
                      </div>
                    </div>

                    <div className="text-[10px] text-text-dim font-sans">
                      All responses return standard JSON conforming to the OpenAPI / Swagger documentation schema at <code className="text-accent-amber">/docs</code>.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </DotGridSpotlight>
      </div>
    </div>
  );
}
