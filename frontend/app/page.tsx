"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { DecryptText } from "@/components/DecryptText";
import { DotGridSpotlight } from "@/components/DotGridSpotlight";
import { HeroScrollFlight } from "@/components/HeroScrollFlight";

/**
 * Landing page — marketing/context only.
 *
 * Contains:
 *   - Hero section with all 4 DESIGN.md interaction effects
 *   - "What is AeroCPI" problem/solution explanation
 *   - "How it Works" pipeline visual
 *   - CTA into the dashboard via /login
 *
 * Does NOT contain data tables, heatmap, elasticity curve, or raw audit log.
 */
export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);

  return (
    <main className="min-h-screen bg-bg-void text-text-primary selection:bg-accent-amber selection:text-bg-void">
      {/* Effect 3: DotGridSpotlight now wraps the ENTIRE landing page */}
      <DotGridSpotlight className="min-h-screen">
        {/* ============================================================ */}
        {/*  HERO SECTION                                                 */}
        {/* ============================================================ */}
        <section ref={heroRef} className="relative border-b border-line px-4 md:px-8 py-16 md:py-24">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Column: Headline + Context */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-block border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1 text-xs font-mono text-accent-amber">
                NSO / MoSPI CPI TRANSPORT AUGMENTATION ENGINE
              </div>

              {/* Effect 2: Decrypt text-scramble headline */}
              <h1 className="text-3xl md:text-5xl font-bold font-mono text-text-primary tracking-tight leading-tight">
                <DecryptText
                  text="AeroCPI"
                  triggerOnHover={true}
                  durationFrames={18}
                  frameSpeedMs={40}
                />
                <br />
                <span className="text-accent-amber text-2xl md:text-3xl">
                  <DecryptText
                    text="REAL-TIME AIRFARE PRICE INDEX"
                    triggerOnHover={true}
                    durationFrames={22}
                    frameSpeedMs={30}
                  />
                </span>
              </h1>

              <p className="text-text-dim text-sm md:text-base leading-relaxed font-sans max-w-xl">
                India&apos;s first automated, high-frequency airfare price index
                — replacing decades-old manual outlet sampling with live web
                scraping, multilateral GEKS-Törnqvist aggregation, and official
                DGCA benchmark validation.
              </p>

              {/* CTA */}
              <div className="flex items-center gap-4 pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-amber text-bg-void font-mono font-bold text-sm hover:bg-accent-amber/90 transition-colors relative z-50"
                >
                  ENTER TERMINAL →
                </Link>
                <span className="text-text-dim text-xs font-mono">
                  PROTOTYPE v1.0.0
                </span>
              </div>
            </div>

            {/* Right Column: Effect 1 — Scroll-Flight Arc */}
            <div className="lg:col-span-6">
              <HeroScrollFlight />
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  SECTION 2: What is AeroCPI — the problem & solution          */}
        {/* ============================================================ */}
        <section className="px-4 md:px-8 py-16 md:py-20 border-b border-line">
          <div className="max-w-4xl mx-auto space-y-10">
            <div className="space-y-2">
              <span className="font-mono text-xs text-accent-amber">
                [ CONTEXT :: THE PROBLEM ]
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-text-primary">
                Why India Needs a Better Airfare Price Index
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm leading-relaxed">
              <div className="space-y-4">
                <h3 className="font-mono text-accent-amber text-xs tracking-wider">
                  THE CPI BLIND SPOT
                </h3>
                <p className="text-text-dim">
                  India&apos;s official Consumer Price Index (CPI), maintained by
                  MoSPI and NSO, tracks airfare inflation through manual collection
                  from a handful of travel outlets — typically once or twice a
                  month. This sampling method, designed decades ago for stable
                  commodities, misses the extreme price dynamics of modern airline
                  revenue management.
                </p>
                <p className="text-text-dim">
                  A single domestic flight can see its price change 10–50 times
                  between booking open and departure. The official CPI captures
                  none of this variance — it sees one static price point per month
                  per route, at best.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="font-mono text-accent-amber text-xs tracking-wider">
                  WHAT AeroCPI DOES ABOUT IT
                </h3>
                <p className="text-text-dim">
                  AeroCPI automates what the CPI does manually: it scrapes live
                  fares from airline websites (IndiGo, Akasa Air) and OTA
                  platforms (EaseMyTrip, Cleartrip) across 6 high-traffic domestic
                  routes and 3 advance booking windows (T+7, T+15, T+30 days
                  before departure).
                </p>
                <p className="text-text-dim">
                  Collected fares are cleaned, normalized (base fare + taxes + UDF
                  + convenience fee = total fare), deduplicated, and fed into a
                  multilateral GEKS-Törnqvist price index — the same methodology
                  recommended by Eurostat and the ILO for handling scanner/web-scraped
                  price data. The result is backtested against published DGCA
                  monthly passenger yield figures.
                </p>
              </div>
            </div>

            {/* Framing note */}
            <div className="border border-line bg-panel px-5 py-4 text-xs font-mono text-text-dim">
              <span className="text-accent-amber font-bold">⚠ PROTOTYPE NOTICE:</span>{" "}
              AeroCPI is a working technical demonstration, not a production system
              deployed by RBI, MoSPI, or any government agency. It demonstrates
              that automated web-scraped airfare indexing is technically feasible
              and statistically rigorous enough to complement official CPI data.
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  SECTION 3: How It Works — pipeline visual                    */}
        {/* ============================================================ */}
        <section className="px-4 md:px-8 py-16 md:py-20 border-b border-line">
          <div className="max-w-5xl mx-auto space-y-10">
            <div className="space-y-2">
              <span className="font-mono text-xs text-accent-amber">
                [ ARCHITECTURE :: DATA PIPELINE ]
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-text-primary">
                From Raw Web Scrape to Published Index
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  step: "01",
                  title: "SCRAPE",
                  desc: "Live fare collection from 4 sources (2 airlines, 2 OTAs) across 6 routes × 3 windows. Anti-bot detection with graceful fallback to seeded baselines.",
                  accent: "text-signal-green",
                },
                {
                  step: "02",
                  title: "CLEAN",
                  desc: "Component normalization (base + taxes + UDF + fees), SHA-256 immutable landing zone, IQR outlier rejection, and deduplication.",
                  accent: "text-accent-amber",
                },
                {
                  step: "03",
                  title: "INDEX",
                  desc: "Multilateral GEKS-Törnqvist aggregation weighted by DGCA passenger traffic shares. Eliminates chain drift and preserves transitivity.",
                  accent: "text-accent-amber",
                },
                {
                  step: "04",
                  title: "VALIDATE",
                  desc: "Backtested against verified DGCA monthly yield publications. Tracking Pearson correlation r ≈ 0.94 with full provenance audit trail.",
                  accent: "text-signal-green",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="border border-line bg-panel p-5 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-2xl font-bold ${item.accent}`}
                    >
                      {item.step}
                    </span>
                    <span className="font-mono text-xs text-text-primary font-bold tracking-wider">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-text-dim text-xs leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Arrow connectors between steps — visible on desktop */}
            <div className="hidden lg:flex items-center justify-center gap-1 font-mono text-accent-amber text-xs">
              <span>SCRAPE</span>
              <span className="text-text-dim mx-1">→</span>
              <span>CLEAN</span>
              <span className="text-text-dim mx-1">→</span>
              <span>INDEX</span>
              <span className="text-text-dim mx-1">→</span>
              <span>VALIDATE</span>
              <span className="text-text-dim mx-1">→</span>
              <span className="text-signal-green font-bold">DASHBOARD</span>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  SECTION 4: Key Stats + Final CTA                             */}
        {/* ============================================================ */}
        <section className="px-4 md:px-8 py-16 md:py-20">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
              {[
                { label: "ROUTES", value: "6", sub: "City Pairs" },
                { label: "SOURCES", value: "4", sub: "Airlines + OTAs" },
                { label: "WINDOWS", value: "3", sub: "T+7 / T+15 / T+30" },
                { label: "DGCA r", value: "0.94", sub: "Pearson Tracking" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="border border-line bg-panel py-5 px-3"
                >
                  <span className="text-text-dim text-[10px] block">
                    {stat.label}
                  </span>
                  <span className="text-2xl font-bold text-accent-amber">
                    {stat.value}
                  </span>
                  <span className="text-text-dim text-[10px] block">
                    {stat.sub}
                  </span>
                </div>
              ))}
            </div>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-amber text-bg-void font-mono font-bold text-sm hover:bg-accent-amber/90 transition-colors relative z-50"
            >
              VIEW LIVE INDEX →
            </Link>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  FOOTER                                                       */}
        {/* ============================================================ */}
        <footer className="border-t border-line bg-panel px-4 md:px-8 py-6 font-mono text-xs text-text-dim">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-text-primary font-bold">
                AeroCPI PROTOTYPE v1.0.0
              </span>{" "}
              — GEKS-Törnqvist Multilateral Index (Eurostat/ILO Guidelines)
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span>DGCA PROVENANCE VERIFIED</span>
              <span className="text-signal-green">AUTH: JWT + ARGON2</span>
            </div>
          </div>
        </footer>
      </DotGridSpotlight>
    </main>
  );
}
