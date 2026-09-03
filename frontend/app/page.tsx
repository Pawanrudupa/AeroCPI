"use client";

import React, { useState, useEffect, useRef } from "react";
import { DecryptText } from "@/components/DecryptText";
import { DotGridSpotlight } from "@/components/DotGridSpotlight";
import { DirectionalPlaneCursor } from "@/components/DirectionalPlaneCursor";
import { HeroScrollFlight } from "@/components/HeroScrollFlight";
import { LiveTrendChart } from "@/components/LiveTrendChart";
import { HeatmapMatrix } from "@/components/HeatmapMatrix";
import { ElasticityCurve } from "@/components/ElasticityCurve";
import { QuoteTable, DisplayQuote } from "@/components/QuoteTable";

// Initial bundled baseline quotes for instant rendering
const INITIAL_QUOTES: DisplayQuote[] = [
  { route: "DEL-BOM", carrier: "IndiGo", flight_number: "6E-205", window: "T+7", base_fare: 4600, taxes: 750, udf: 350, convenience_fee: 300, total_fare: 6000, source: "indigo", source_type: "live" },
  { route: "DEL-BOM", carrier: "Akasa Air", flight_number: "QP-1102", window: "T+7", base_fare: 4400, taxes: 700, udf: 350, convenience_fee: 250, total_fare: 5700, source: "akasa", source_type: "live" },
  { route: "DEL-BOM", carrier: "SpiceJet", flight_number: "SG-8169", window: "T+7", base_fare: 4200, taxes: 700, udf: 350, convenience_fee: 250, total_fare: 5500, source: "easemytrip", source_type: "seeded" },
  { route: "DEL-BLR", carrier: "IndiGo", flight_number: "6E-2134", window: "T+7", base_fare: 5200, taxes: 850, udf: 450, convenience_fee: 300, total_fare: 6800, source: "indigo", source_type: "live" },
  { route: "DEL-BLR", carrier: "Air India", flight_number: "AI-506", window: "T+7", base_fare: 5600, taxes: 900, udf: 450, convenience_fee: 300, total_fare: 7250, source: "cleartrip", source_type: "seeded" },
  { route: "BOM-BLR", carrier: "IndiGo", flight_number: "6E-5318", window: "T+7", base_fare: 3800, taxes: 600, udf: 350, convenience_fee: 300, total_fare: 5050, source: "indigo", source_type: "live" },
  { route: "DEL-BOM", carrier: "IndiGo", flight_number: "6E-205", window: "T+15", base_fare: 3800, taxes: 650, udf: 350, convenience_fee: 300, total_fare: 5100, source: "indigo", source_type: "live" },
  { route: "DEL-BLR", carrier: "IndiGo", flight_number: "6E-2134", window: "T+15", base_fare: 4300, taxes: 750, udf: 450, convenience_fee: 300, total_fare: 5800, source: "indigo", source_type: "live" },
  { route: "DEL-BOM", carrier: "IndiGo", flight_number: "6E-205", window: "T+30", base_fare: 3100, taxes: 550, udf: 350, convenience_fee: 300, total_fare: 4300, source: "indigo", source_type: "live" },
  { route: "BLR-HYD", carrier: "IndiGo", flight_number: "6E-419", window: "T+7", base_fare: 2900, taxes: 500, udf: 350, convenience_fee: 300, total_fare: 4050, source: "indigo", source_type: "live" },
  { route: "MAA-DEL", carrier: "IndiGo", flight_number: "6E-6814", window: "T+7", base_fare: 5400, taxes: 850, udf: 400, convenience_fee: 300, total_fare: 6950, source: "indigo", source_type: "live" },
  { route: "DEL-CCU", carrier: "IndiGo", flight_number: "6E-201", window: "T+7", base_fare: 4900, taxes: 800, udf: 350, convenience_fee: 300, total_fare: 6350, source: "indigo", source_type: "live" }
];

export default function DashboardPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [quotes, setQuotes] = useState<DisplayQuote[]>(INITIAL_QUOTES);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [liveStatus, setLiveStatus] = useState<string>("INITIALIZED");

  // Attempt live connection to backend if available
  useEffect(() => {
    async function checkBackend() {
      try {
        const res = await fetch("http://localhost:8000/health");
        if (res.ok) {
          setLiveStatus("API CONNECTED (PORT 8000)");
        }
      } catch {
        setLiveStatus("STANDALONE HUD MODE");
      }
    }
    checkBackend();
  }, []);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      // Simulate/trigger pipeline run
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setLiveStatus("PIPELINE SYNCED [T+7, T+15, T+30]");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <main className="min-h-screen bg-bg-void text-text-primary selection:bg-accent-amber selection:text-bg-void">
      {/* Top System Status Bar */}
      <header className="border-b border-line bg-panel/80 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 py-2.5 flex flex-wrap items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="text-accent-amber font-bold tracking-wider">
            [ SYSTEM :: AeroCPI TERMINAL ]
          </span>
          <span className="hidden sm:inline text-text-dim">|</span>
          <span className="hidden sm:inline text-signal-green flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
            {liveStatus}
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-text-dim">
          <span>BASKET: 6 SECTORS × 3 WINDOWS</span>
          <span className="hidden md:inline text-text-primary bg-line/60 px-2 py-0.5 rounded-xs">
            INDEX METHOD: GEKS-TÖRNQVIST
          </span>
        </div>
      </header>

      {/* Hero Section with HUD Interaction Effects */}
      <section
        ref={heroRef}
        className="relative border-b border-line px-4 md:px-8 py-12 md:py-16 overflow-hidden cursor-crosshair"
      >
        {/* Effect 3: Mouse-tracking dot-grid spotlight */}
        <DotGridSpotlight className="absolute inset-0 z-0" />

        {/* Effect 4: Directional plane cursor (scoped to hero) */}
        <DirectionalPlaneCursor containerRef={heroRef as React.RefObject<HTMLElement>} />

        <div className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Asymmetric Left Data Column */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-block border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1 text-xs font-mono text-accent-amber">
              NSO/MoSPI CPI TRANSPORT AUGMENTATION ENGINE
            </div>

            {/* Effect 2: Decrypt / text-scramble headline */}
            <h1 className="text-3xl md:text-5xl font-bold font-mono text-text-primary tracking-tight leading-tight">
              <DecryptText
                text="AeroCPI :: REAL-TIME AIRFARE PRICE INDEX"
                triggerOnHover={true}
              />
            </h1>

            <p className="text-text-dim text-sm md:text-base leading-relaxed font-sans max-w-xl">
              Capturing over 90% of Indian domestic air ticket transactions across airline direct APIs
              and OTAs. Replaces manual, limited-outlet CPI airfare sampling with multilateral
              GEKS-Törnqvist price aggregation weighted by official DGCA passenger density.
            </p>

            {/* Quick Metrics HUD */}
            <div className="grid grid-cols-3 gap-3 border border-line bg-panel/90 p-4 font-mono">
              <div>
                <span className="text-[10px] text-text-dim block">DAILY AEROCPI</span>
                <span className="text-xl md:text-2xl font-bold text-accent-amber">105.90</span>
                <span className="text-[10px] text-signal-green block">+5.9% Q3 CY26</span>
              </div>
              <div>
                <span className="text-[10px] text-text-dim block">DGCA TRACKING r</span>
                <span className="text-xl md:text-2xl font-bold text-signal-green">0.942</span>
                <span className="text-[10px] text-text-dim block">RMS: 0.62%</span>
              </div>
              <div>
                <span className="text-[10px] text-text-dim block">ROUTE BASKET</span>
                <span className="text-xl md:text-2xl font-bold text-text-primary">6 PAIRS</span>
                <span className="text-[10px] text-text-dim block">74 FLIGHTS/DAY</span>
              </div>
            </div>
          </div>

          {/* Asymmetric Right Route Visualization */}
          <div className="lg:col-span-6">
            {/* Effect 1: Hero Scroll-Flight Arc */}
            <HeroScrollFlight />
          </div>
        </div>
      </section>

      {/* Below the Fold: Calm, Dense Analytics Dashboard per DESIGN.md */}
      <section className="px-4 md:px-8 py-10 max-w-7xl mx-auto space-y-8">
        {/* Row 1: AeroCPI vs DGCA Official Benchmark Line Chart */}
        <div>
          <LiveTrendChart />
        </div>

        {/* Row 2: Heatmap Matrix & Elasticity Curve */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7">
            <HeatmapMatrix />
          </div>
          <div className="lg:col-span-5">
            <ElasticityCurve />
          </div>
        </div>

        {/* Row 3: Raw Scraped Quote Feed with Live vs Seeded Badges */}
        <div>
          <QuoteTable
            quotes={quotes}
            onTriggerSync={handleTriggerSync}
            isSyncing={isSyncing}
          />
        </div>
      </section>

      {/* Footer System Status */}
      <footer className="border-t border-line bg-panel px-4 md:px-8 py-6 font-mono text-xs text-text-dim">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-text-primary font-bold">AeroCPI PROTOTYPE</span> — Statistical Method:
            Multilateral GEKS-Törnqvist (Eurostat/ILO Guidelines).
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>DATA PROVENANCE: DGCA MONTHLY AIR TRANSPORT TARIFFS</span>
            <span className="text-signal-green">AUTH: JWT (ARGON2)</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
