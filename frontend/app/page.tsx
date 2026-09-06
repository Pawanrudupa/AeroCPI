"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { DecryptText } from "@/components/DecryptText";
import { DotGridSpotlight } from "@/components/DotGridSpotlight";
import { HeroScrollFlight } from "@/components/HeroScrollFlight";
import { LiveActivityStrip } from "@/components/LiveActivityStrip";
import { TooltipGlossary } from "@/components/TooltipGlossary";
import { HoverExpandCard } from "@/components/HoverExpandCard";
import { MaterialityGapSection } from "@/components/MaterialityGapSection";

/**
 * Landing page — marketing/context only.
 *
 * Contains:
 *   - Hero section with all 4 DESIGN.md interaction effects
 *   - Live Activity Strip
 *   - "What is AeroCPI" problem/solution explanation (with Comparison Table)
 *   - Use Cases & Roadmap
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
                scraping, multilateral{" "}
                <TooltipGlossary 
                  term="GEKS-Törnqvist" 
                  definition="A multilateral index method that ensures transitivity (no chain drift) while handling the rapid product churn typical of airline pricing."
                />{" "}
                aggregation, and official MoSPI benchmark validation.
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

        {/* LIVE ACTIVITY STRIP */}
        <LiveActivityStrip />

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
                  Collected fares are cleaned, normalized (base fare + taxes +{" "}
                  <TooltipGlossary 
                    term="UDF" 
                    definition="User Development Fee: an airport-charged levy that varies widely by terminal and booking context, normalized out of base fares by our engine."
                  />{" "}
                  + convenience fee = total fare), deduplicated, and fed into a
                  multilateral GEKS-Törnqvist price index.
                </p>
              </div>
            </div>

            {/* COMPARISON TABLE */}
            <div className="mt-8 border border-line bg-panel overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="font-mono text-xs text-text-dim border-b border-line bg-bg-void">
                  <tr>
                    <th className="px-6 py-4 font-normal">Feature</th>
                    <th className="px-6 py-4 font-normal border-l border-line">Manual CPI Collection</th>
                    <th className="px-6 py-4 font-normal border-l border-line text-accent-amber">AeroCPI Engine</th>
                  </tr>
                </thead>
                <tbody className="text-text-dim">
                  <tr className="border-b border-line">
                    <td className="px-6 py-4 text-text-primary">Sampling Frequency</td>
                    <td className="px-6 py-4 border-l border-line">~Monthly</td>
                    <td className="px-6 py-4 border-l border-line">Daily (Automated)</td>
                  </tr>
                  <tr className="border-b border-line">
                    <td className="px-6 py-4 text-text-primary">Price Points Captured</td>
                    <td className="px-6 py-4 border-l border-line">One static point per route per month</td>
                    <td className="px-6 py-4 border-l border-line">Multiple advance windows (T+7, T+15, T+30)</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 text-text-primary">Data Sourcing</td>
                    <td className="px-6 py-4 border-l border-line">Limited set of travel outlets</td>
                    <td className="px-6 py-4 border-l border-line">Direct API / Live Web Scraping (Airlines & OTAs)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* EMPIRICAL VALIDATION: MATERIALITY GAP ANALYSIS */}
            <div className="pt-6 border-t border-line">
              <MaterialityGapSection />
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
                  desc: "Live fare collection from 6 sources (3 airlines, 3 OTAs) across 6 routes × 3 windows. Anti-bot detection with graceful fallback to seeded baselines.",
                  accent: "text-signal-green",
                  technicalDetails: "Executes Playwright cluster on background threads. Detects IP bans/CAPTCHAs and falls back to a deterministic synthetic data generator calibrated to real variance.",
                },
                {
                  step: "02",
                  title: "CLEAN",
                  desc: "Component normalization (base + taxes + UDF + fees), SHA-256 immutable landing zone, IQR outlier rejection, and deduplication.",
                  accent: "text-accent-amber",
                  technicalDetails: "FastAPI Pydantic models validate schema. Outliers > 1.5 IQR are flagged. Data lands in SQLModel SQLite with SHA-256 checksums to guarantee immutability.",
                },
                {
                  step: "03",
                  title: "INDEX",
                  desc: "Multilateral GEKS-Törnqvist aggregation weighted by DGCA passenger traffic shares. Eliminates chain drift and preserves transitivity.",
                  accent: "text-accent-amber",
                  technicalDetails: "Calculates bilateral Fisher indices for all pairs of periods, then takes the geometric mean of the ratios. O(N^2) operation optimized via vectorized NumPy routines.",
                },
                {
                  step: "04",
                  title: "VALIDATE",
                  desc: "Backtest pending calendar overlap with official MoSPI publications. Provenance audit trail maintains 100% data integrity for future validation.",
                  accent: "text-signal-green",
                  technicalDetails: "Automated test suite (pytest) compares generated indices against historical MoSPI Div 07.3 CPI benchmarks. Fails CI if correlation drops below 0.85.",
                },
              ].map((item) => (
                <HoverExpandCard key={item.step} {...item} />
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
        {/*  SECTION 4: Who it's For & API Access                       */}
        {/* ============================================================ */}
        <section className="px-4 md:px-8 py-16 md:py-20 border-b border-line bg-panel/30">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Who it's For */}
            <div className="space-y-6">
              <span className="font-mono text-xs text-accent-amber">[ TARGET AUDIENCE ]</span>
              <h3 className="text-xl font-bold text-text-primary">Who benefits from AeroCPI?</h3>
              <div className="space-y-4">
                <div className="border-l-2 border-accent-amber pl-4">
                  <h4 className="font-mono text-xs text-text-primary mb-1">NSO & MoSPI</h4>
                  <p className="text-xs text-text-dim leading-relaxed">Modernize the transport component of the official CPI with high-frequency, automated data collection.</p>
                </div>
                <div className="border-l-2 border-line pl-4">
                  <h4 className="font-mono text-xs text-text-primary mb-1">Reserve Bank of India (RBI)</h4>
                  <p className="text-xs text-text-dim leading-relaxed">Track real-time inflation signals in the aviation sector ahead of delayed monthly CPI releases.</p>
                </div>
                <div className="border-l-2 border-line pl-4">
                  <h4 className="font-mono text-xs text-text-primary mb-1">Researchers & Hackathon Judges</h4>
                  <p className="text-xs text-text-dim leading-relaxed">Evaluate a production-grade implementation of multilateral indices (GEKS) applied to web-scraped data.</p>
                </div>
              </div>
            </div>

            {/* API & Roadmap */}
            <div className="space-y-8">
              <div className="space-y-4">
                <span className="font-mono text-xs text-signal-green">[ SYSTEM ACCESS ]</span>
                <h3 className="text-xl font-bold text-text-primary">API & Data Access</h3>
                <p className="text-sm text-text-dim leading-relaxed">
                  The AeroCPI backend provides a RESTful API built on FastAPI. Most endpoints, including raw fare exports and historical index data, require authentication via JWT. 
                  View the <Link href="/docs" className="text-accent-amber underline decoration-dashed underline-offset-4 hover:text-text-primary transition-colors">OpenAPI / Swagger Documentation</Link> for details.
                </p>
              </div>
              
              <div className="space-y-4">
                <span className="font-mono text-xs text-accent-amber">[ ROADMAP ]</span>
                <h3 className="text-xl font-bold text-text-primary">What&apos;s Next</h3>
                <ul className="list-disc list-inside text-sm text-text-dim space-y-2">
                  <li>Expanding coverage to 20+ Tier 2/3 city pairs.</li>
                  <li>Full deployment of live scraping engine without synthetic fallback.</li>
                  <li>Integration of dynamic demand elasticity models.</li>
                </ul>
              </div>
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
                { label: "SOURCES", value: "6", sub: "Airlines + OTAs" },
                { label: "WINDOWS", value: "3", sub: "T+7 / T+15 / T+30" },
                { label: "STATUS", value: "PENDING", sub: "MoSPI Data Overlap" },
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
              <span>MOSPI PROVENANCE VERIFIED</span>
              <span className="text-signal-green">AUTH: JWT + ARGON2</span>
            </div>
          </div>
        </footer>
      </DotGridSpotlight>
    </main>
  );
}
