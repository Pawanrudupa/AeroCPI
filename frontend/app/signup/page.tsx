"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { RadarBackground } from "@/components/RadarBackground";

/**
 * /signup — Terminal-HUD styled self-service VIEWER registration page.
 *
 * Hits POST /auth/register on the FastAPI backend.
 * Un-gated instant onboarding: assigns VIEWER role and logs in immediately.
 * Background: Full-viewport ATC radar canvas with flight vectors.
 */
export default function SignupPage() {
  const router = useRouter();
  const { register, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* If already authenticated, redirect straight to dashboard */
  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("A valid email address is required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters in length.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const result = await register({
      email: cleanEmail,
      password,
      name: name.trim() || undefined,
      organization: organization.trim() || undefined,
    });
    setIsSubmitting(false);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Registration failed.");
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-text-primary flex items-center justify-center px-4 py-12 relative overflow-hidden font-mono">
      {/* ATC Radar Canvas — behind everything */}
      <RadarBackground />

      {/* Registration Card — floats above the radar */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <Link
            href="/login"
            className="inline-block text-accent-amber text-xs hover:underline"
          >
            ← BACK TO TERMINAL LOGIN
          </Link>

          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
            [ VIEWER SIGNUP ]
          </h1>

          <p className="text-text-dim text-xs">
            INSTANT UN-GATED ACCESS — PUBLIC &amp; RESEARCH OBSERVER
          </p>
        </div>

        {/* Signup Form — glass-panel with backdrop blur */}
        <form
          onSubmit={handleSubmit}
          className="border border-line bg-black/85 backdrop-blur-md p-6 md:p-8 space-y-4 shadow-2xl shadow-amber-900/10"
        >
          {/* Badge */}
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <span className="text-[11px] text-text-dim flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-signal-green" />
              <span>SELF-SERVICE REGISTRATION</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-signal-green/10 border border-signal-green/30 text-signal-green">
              ROLE: VIEWER
            </span>
          </div>

          {/* Error State */}
          {error && (
            <div className="border border-alert bg-alert/10 px-4 py-3 text-xs text-alert flex items-start gap-2">
              <span className="text-alert font-bold shrink-0">ERROR:</span>
              <span>{error}</span>
            </div>
          )}

          {/* Email Field */}
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="block text-[11px] text-text-dim tracking-wider"
            >
              OFFICIAL / PERSONAL EMAIL *
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. researcher@university.edu"
              autoComplete="email"
              className="w-full bg-bg-void border border-line px-3 py-2 text-xs text-text-primary focus:border-accent-amber focus:outline-none"
            />
          </div>

          {/* Full Name Field */}
          <div className="space-y-1">
            <label
              htmlFor="name"
              className="block text-[11px] text-text-dim tracking-wider"
            >
              FULL NAME
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Priya Nair"
              autoComplete="name"
              className="w-full bg-bg-void border border-line px-3 py-2 text-xs text-text-primary focus:border-accent-amber focus:outline-none"
            />
          </div>

          {/* Organization Field */}
          <div className="space-y-1">
            <label
              htmlFor="organization"
              className="block text-[11px] text-text-dim tracking-wider"
            >
              INSTITUTION / DEPARTMENT
            </label>
            <input
              id="organization"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g. Center for Economic Studies"
              autoComplete="organization"
              className="w-full bg-bg-void border border-line px-3 py-2 text-xs text-text-primary focus:border-accent-amber focus:outline-none"
            />
          </div>

          {/* Password Field */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-[11px] text-text-dim tracking-wider"
              >
                PASSWORD (MIN 8) *
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="new-password"
                className="w-full bg-bg-void border border-line px-3 py-2 text-xs text-text-primary focus:border-accent-amber focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="confirmPassword"
                className="block text-[11px] text-text-dim tracking-wider"
              >
                CONFIRM *
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="new-password"
                className="w-full bg-bg-void border border-line px-3 py-2 text-xs text-text-primary focus:border-accent-amber focus:outline-none"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 bg-accent-amber text-bg-void font-bold text-xs hover:bg-accent-amber/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 tracking-wider"
          >
            {isSubmitting ? (
              <>
                <span className="w-2 h-2 rounded-full bg-bg-void animate-ping" />
                INITIALIZING ACCOUNT...
              </>
            ) : (
              "CREATE VIEWER ACCOUNT →"
            )}
          </button>

          {/* Access Scope Info */}
          <div className="border border-line bg-bg-void/60 p-3 text-[10px] text-text-dim space-y-1 font-sans leading-relaxed">
            <div className="font-mono text-accent-amber font-bold">ACCESS TIER SUMMARY:</div>
            <div>
              &bull; <strong>VIEWER (Instant)</strong>: Full access to price indices, charts, elasticity curves, and research methodology.
            </div>
            <div>
              &bull; <strong>ANALYST (Elevated)</strong>: Raw quote audit logs and pipeline trigger can be requested post-signup via your Account page.
            </div>
          </div>

          {/* Link back to login */}
          <div className="pt-2 text-center text-xs border-t border-line text-text-dim">
            <span>Already registered? </span>
            <Link
              href="/login"
              className="text-accent-amber hover:underline font-bold"
            >
              Sign in to Terminal →
            </Link>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center text-[10px] text-text-dim">
          AeroCPI Institutional Platform &bull; Argon2id Hash &bull; Instant Access
        </div>
      </div>
    </main>
  );
}
