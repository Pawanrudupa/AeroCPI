"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { RadarBackground } from "@/components/RadarBackground";

/**
 * /login — Terminal-HUD styled authentication page.
 *
 * Hits POST /auth/login on the FastAPI backend.
 * Stores JWT via AuthContext (localStorage).
 * Redirects to /dashboard on success.
 *
 * Background: Full-viewport ATC radar canvas with flight vectors.
 */
export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

    if (!email.trim() || !password.trim()) {
      setError("Both fields are required.");
      return;
    }

    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Authentication failed.");
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-text-primary flex items-center justify-center px-4 relative overflow-hidden">
      {/* ATC Radar Canvas — behind everything */}
      <RadarBackground />

      {/* Login Card — floats above the radar */}
      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <Link
            href="/"
            className="inline-block font-mono text-accent-amber text-sm hover:underline"
          >
            ← BACK TO LANDING
          </Link>

          <h1 className="text-2xl md:text-3xl font-bold font-mono text-text-primary">
            [ TERMINAL AUTH ]
          </h1>

          <p className="text-text-dim text-xs font-mono">
            AeroCPI DASHBOARD ACCESS — JWT + ARGON2 AUTHENTICATION
          </p>
        </div>

        {/* Login Form — glass-panel with backdrop blur */}
        <form
          onSubmit={handleSubmit}
          className="border border-accent-amber/30 bg-black/80 backdrop-blur-md p-6 md:p-8 space-y-5 shadow-2xl shadow-amber-900/10"
        >
          {/* Error State */}
          {error && (
            <div className="border border-alert bg-alert/10 px-4 py-3 text-xs font-mono text-alert flex items-start gap-2">
              <span className="text-alert font-bold shrink-0">ERROR:</span>
              <span>{error}</span>
            </div>
          )}

          {/* Email Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-xs font-mono text-text-dim tracking-wider"
            >
              ANALYST EMAIL
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="demo.analyst@aerocpi.local"
              autoComplete="email"
              autoFocus
              className="w-full"
            />
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-mono text-text-dim tracking-wider"
            >
              PASSWORD
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              className="w-full"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-accent-amber text-bg-void font-mono font-bold text-sm hover:bg-accent-amber/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-2 h-2 rounded-full bg-bg-void animate-ping" />
                AUTHENTICATING...
              </>
            ) : (
              "AUTHENTICATE →"
            )}
          </button>

          {/* Demo Account Notice */}
          <div className="border border-line bg-bg-void/60 px-4 py-3 text-[11px] font-mono text-text-dim space-y-1">
            <p>
              <span className="text-accent-amber font-bold">
                DEMO / EVALUATION ACCOUNT
              </span>
            </p>
            <p>
              Email:{" "}
              <span className="text-text-primary">
                demo.analyst@aerocpi.local
              </span>
            </p>
            <p>
              Password: set via{" "}
              <span className="text-text-primary">SEED_ANALYST_PASSWORD</span>{" "}
              environment variable
            </p>
            <p className="pt-1 text-text-dim/70">
              This is a prototype authentication system for evaluation purposes.
              Not a production RBI/MoSPI deployment.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center text-[11px] font-mono text-text-dim">
          AeroCPI v1.0.0 — JWT Bearer Token + Argon2id Password Hashing
        </div>
      </div>
    </main>
  );
}

