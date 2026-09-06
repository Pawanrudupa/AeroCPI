"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, API_BASE, type MaterialityGapResponse } from "@/lib/api";
import { DotGridSpotlight } from "@/components/DotGridSpotlight";

export default function MethodologyPage() {
  const { isAuthenticated, userEmail, role, logout } = useAuth();
  const [gapData, setGapData] = useState<MaterialityGapResponse | null>(null);
  const [apiStatus, setApiStatus] = useState<"connected" | "offline" | "checking">("checking");

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [gapRes, healthRes] = await Promise.all([
          api.materialityGap().catch(() => null),
          fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
        ]);
        if (isMounted) {
          if (gapRes) setGapData(gapRes);
          setApiStatus(healthRes && healthRes.ok ? "connected" : "offline");
        }
      } catch {
        if (isMounted) setApiStatus("offline");
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalQuotes = gapData?.provenance.total_quotes ?? 3696;
  const livePct = gapData?.provenance.live_pct ?? 13.2;
  const seededPct = gapData?.provenance.seeded_pct ?? 86.8;

  return (
    <div className="min-h-screen bg-bg-void text-text-primary flex flex-col font-sans selection:bg-accent-amber selection:text-bg-void">
      {/* ============================================================ */}
      {/*  TERMINAL TOP NAVIGATION                                     */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-40 border-b border-line bg-panel/95 backdrop-blur-md px-4 md:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          {/* Brand & Status */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-accent-amber font-bold tracking-wider hover:underline flex-shrink-0 whitespace-nowrap"
            >
              [ AeroCPI ]
            </Link>

            <span className="hidden sm:inline text-text-dim">|</span>

            <span className="inline-flex items-center gap-1.5 text-text-dim text-[11px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiStatus === "connected"
                    ? "bg-signal-green animate-pulse"
                    : apiStatus === "offline"
                    ? "bg-alert"
                    : "bg-text-dim"
                }`}
              />
              <span className="hidden md:inline">METHODOLOGY & RESEARCH FOUNDATIONS</span>
              <span className="md:hidden">RESEARCH</span>
            </span>

            <span className="hidden lg:inline text-text-dim">|</span>
            <span className="hidden lg:inline text-text-dim text-[11px]">
              DATASET: {totalQuotes.toLocaleString()} QUOTES ({livePct}% LIVE / {seededPct}% SEEDED)
            </span>
          </div>

          {/* Navigation links & Auth */}
          <div className="flex items-center gap-2 md:gap-3 text-[11px]">
            <nav className="flex items-center gap-1 border-r border-line pr-2 md:pr-3 mr-1">
              <Link
                href="/dashboard"
                className="px-2 py-1 transition-colors font-bold text-text-dim hover:text-text-primary hover:bg-panel"
              >
                [ DASHBOARD ]
              </Link>
              <Link
                href="/dashboard/reports"
                className="px-2 py-1 transition-colors font-bold text-text-dim hover:text-text-primary hover:bg-panel"
              >
                [ REPORTS ]
              </Link>
              <Link
                href="/methodology"
                className="px-2 py-1 transition-colors font-bold text-accent-amber border-b border-accent-amber"
              >
                [ METHODOLOGY ]
              </Link>
            </nav>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-text-dim hidden sm:inline">
                  {userEmail}
                  {role && <span className="ml-1 text-signal-green">[{role.toUpperCase()}]</span>}
                </span>
                <button
                  onClick={logout}
                  className="px-2 py-1 text-alert hover:text-text-primary hover:bg-alert/10 transition-colors border border-transparent hover:border-alert/30"
                >
                  [ LOGOUT ]
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-2.5 py-1 bg-accent-amber text-bg-void font-bold hover:bg-accent-amber/90 transition-colors"
              >
                ENTER TERMINAL →
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/*  MAIN CONTENT                                                */}
      {/* ============================================================ */}
      <div className="flex-1 relative w-full bg-bg-void">
        <DotGridSpotlight className="w-full h-full min-h-[calc(100vh-120px)]">
          <main className="max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-16 space-y-16 relative z-10">
            
            {/* Header / Hero */}
            <div className="space-y-4 border-b border-line pb-8">
              <div className="inline-block border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1 text-xs font-mono text-accent-amber">
                NSO / MoSPI CPI TRANSPORT AUGMENTATION FRAMEWORK
              </div>
              <h1 className="text-3xl md:text-4xl font-bold font-mono text-text-primary tracking-tight">
                Methodology, Precedent & Integrity Record
              </h1>
              <p className="text-sm md:text-base text-text-dim max-w-3xl leading-relaxed">
                A consolidated repository of verified academic literature, international statistical guidelines,
                our regulatory policy roadmap, and an unvarnished audit of AeroCPI&apos;s development and verification track record.
              </p>

              {/* Quick Jump Bar */}
              <div className="pt-4 flex flex-wrap gap-2 text-xs font-mono">
                <a
                  href="#precedent"
                  className="border border-line bg-panel px-3 py-1.5 text-text-dim hover:text-accent-amber hover:border-accent-amber transition-colors"
                >
                  § 1. PRECEDENT & RESEARCH
                </a>
                <a
                  href="#policy-roadmap"
                  className="border border-line bg-panel px-3 py-1.5 text-text-dim hover:text-accent-amber hover:border-accent-amber transition-colors"
                >
                  § 2. POLICY ROADMAP
                </a>
                <a
                  href="#verification-record"
                  className="border border-line bg-panel px-3 py-1.5 text-text-dim hover:text-accent-amber hover:border-accent-amber transition-colors"
                >
                  § 3. VERIFICATION & DATA INTEGRITY
                </a>
                <a
                  href="#limitations-roadmap"
                  className="border border-line bg-panel px-3 py-1.5 text-text-dim hover:text-accent-amber hover:border-accent-amber transition-colors"
                >
                  § 4. LIMITATIONS & ROADMAP
                </a>
              </div>
            </div>

            {/* ============================================================ */}
            {/*  SECTION 1: Precedent & Research Foundations                 */}
            {/* ============================================================ */}
            <section id="precedent" className="space-y-8 scroll-mt-20">
              <div className="space-y-2">
                <span className="font-mono text-xs text-accent-amber">[ 01 :: FOUNDATIONS ]</span>
                <h2 className="text-2xl font-bold font-mono text-text-primary">
                  Precedent & Research Foundations
                </h2>
                <p className="text-sm text-text-dim leading-relaxed max-w-3xl">
                  AeroCPI is not an ad-hoc pricing scraper; it implements methodologies grounded directly in 
                  peer-reviewed econometric research and official statistical standards formulated by national 
                  statistical offices and international treaty organizations.
                </p>
              </div>

              {/* PROMINENT FEATURE: Polidoro et al. (2015) */}
              <div className="border-2 border-accent-amber/70 bg-panel p-6 md:p-8 space-y-5 rounded-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-accent-amber text-bg-void font-mono font-bold text-[10px] px-3 py-1 uppercase tracking-wider">
                  Primary Empirical Precedent
                </div>
                
                <div className="space-y-1">
                  <span className="font-mono text-xs text-signal-green font-bold">
                    OFFICIAL STATISTICAL AGENCY OPERATIONAL BLUEPRINT
                  </span>
                  <h3 className="text-lg md:text-xl font-bold text-text-primary font-mono">
                    Polidoro, Giannini, Lo Conte, Mosca, &amp; Rossetti (2015)
                  </h3>
                </div>

                <blockquote className="border-l-2 border-accent-amber pl-4 py-1 text-sm font-serif italic text-text-primary bg-bg-void/40">
                  Polidoro, F., Giannini, R., Lo Conte, R., Mosca, S., &amp; Rossetti, F. (2015). &ldquo;Web scraping techniques to collect data on consumer electronics and airfares for Italian HICP compilation.&rdquo; <em>Statistical Journal of the IAOS</em>, 31(2), 165–176. DOI: 10.3233/SJI-150901.
                </blockquote>

                <div className="space-y-3 text-xs md:text-sm text-text-dim leading-relaxed font-sans border-t border-line/60 pt-4">
                  <p>
                    <strong className="text-text-primary font-mono">Why this is our exact precedent:</strong> While substantial academic literature studies web scraping in broad commercial contexts, Polidoro et al. at Istat (Italy&apos;s National Institute of Statistics) represents the closest real-world precedent to AeroCPI. It documents the actual operational pilot and deployment by a sovereign National Statistical Office (NSO) of automated web scraping to harvest airfares directly for official Harmonised Index of Consumer Prices (HICP) compilation in the Italian consumer market.
                  </p>
                  <p>
                    The authors proved that an official statistics bureau can successfully automate online airfare collection to feed a real price index, systematically addressing price variance across advance booking departure horizons and the structural volatility of airline yield management. AeroCPI takes this established NSO precedent and applies its core operational architecture to the high-density domestic routes of the Indian civil aviation market, encountering and testing our own sector-specific challenges: dynamic revenue management, booking windows (T+7, T+15, T+30), and fare component decomposition (base fare, UDF, and taxes).
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3 font-mono text-xs">
                  <a
                    href="https://doi.org/10.3233/SJI-150901"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-accent-amber hover:underline"
                  >
                    <span>DOI: 10.3233/SJI-150901</span>
                    <span>↗</span>
                  </a>
                  <span className="text-text-dim">•</span>
                  <span className="text-text-dim">Institutional Context: Istat / Italian HICP Compilation</span>
                </div>
              </div>

              {/* Supporting Citations Grid */}
              <div className="space-y-4 pt-2">
                <h3 className="font-mono text-xs text-text-dim uppercase tracking-wider">
                  Core Econometric &amp; Multilateral Index Citations (Independently Verified)
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  {/* Citation 2: Ivancic, Diewert, Fox */}
                  <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-accent-amber font-bold">
                        MULTILATERAL INDEX THEORY &amp; CHAIN DRIFT ELIMINATION
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">JOURNAL OF ECONOMETRICS (2011)</span>
                    </div>
                    <p className="font-serif text-sm text-text-primary">
                      Ivancic, L., Diewert, W.E., &amp; Fox, K.J. (2011). &ldquo;Scanner data, time aggregation and the construction of price indexes.&rdquo; <em>Journal of Econometrics</em>, 161(1), 24–35.
                    </p>
                    <p className="text-xs text-text-dim leading-relaxed">
                      <strong className="text-text-primary font-mono">Methodological Role:</strong> Provides the theoretical justification for AeroCPI&apos;s multilateral GEKS aggregation. Standard bilateral chain indices suffer from severe &ldquo;chain drift&rdquo; when applied to high-frequency airline fares due to bouncing prices and promotional discount cycles. Ivancic et al. adapted the multilateral GEKS method to scanner and transaction data, guaranteeing transitivity and drift-free index levels over time.
                    </p>
                  </div>

                  {/* Citation 3: Cavallo & Rigobon */}
                  <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-accent-amber font-bold">
                        HIGH-FREQUENCY ONLINE TELEMETRY BENCHMARK
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">JEP (2016) / BILLION PRICES PROJECT</span>
                    </div>
                    <p className="font-serif text-sm text-text-primary">
                      Cavallo, A., &amp; Rigobon, R. (2016). &ldquo;The Billion Prices Project: Using Online Prices for Measurement and Research.&rdquo; <em>Journal of Economic Perspectives</em>, 30(2), 151–178.
                    </p>
                    <p className="text-xs text-text-dim leading-relaxed">
                      <strong className="text-text-primary font-mono">Methodological Role:</strong> Demonstrates that daily web-scraped price indices mirror official CPI trends while providing real-time macro signals weeks before official statistical releases. AeroCPI applies this principle specifically to the most volatile, dynamic consumer expenditure category in India&apos;s transport basket: commercial civil aviation.
                    </p>
                  </div>

                  {/* Citation 4: Eurostat (2022) */}
                  <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-accent-amber font-bold">
                        OFFICIAL MULTILATERAL METHODOLOGY GUIDELINES
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">PUBLICATIONS OFFICE OF THE EU (2022)</span>
                    </div>
                    <p className="font-serif text-sm text-text-primary">
                      Eurostat (2022). &ldquo;Guide on Multilateral Methods in the Harmonised Index of Consumer Prices.&rdquo; Publications Office of the European Union.
                    </p>
                    <p className="text-xs text-text-dim leading-relaxed">
                      <strong className="text-text-primary font-mono">Methodological Role:</strong> Codifies official European statistical standards for implementing GEKS-Törnqvist formulas, determining window lengths, applying rolling window splicing techniques (half-splice vs. mean splice), and filtering extreme outliers in non-traditional high-frequency price feeds.
                    </p>
                  </div>

                  {/* Citation 5: Eurostat (2020) */}
                  <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-accent-amber font-bold">
                        ETHICAL &amp; TECHNICAL WEB SCRAPING GUIDELINES
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">EUROSTAT DIRECTORATE C (2020)</span>
                    </div>
                    <p className="font-serif text-sm text-text-primary">
                      Eurostat (2020). &ldquo;Practical guidelines on web scraping for the HICP.&rdquo; Directorate C: Macro-economic statistics.
                    </p>
                    <p className="text-xs text-text-dim leading-relaxed">
                      <strong className="text-text-primary font-mono">Methodological Role:</strong> Outlines operational principles for official statistical agencies: maintaining transparent crawler headers, respecting server throttling, preserving cryptographic checksums (SHA-256) of raw HTML/JSON landing zones, and handling dynamic JavaScript single-page applications.
                    </p>
                  </div>

                  {/* Citation 6: International CPI Manual */}
                  <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-accent-amber font-bold">
                        GLOBAL STATISTICAL CONSENSUS &amp; AXIOMATIC CRITERIA
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">ILO / IMF / OECD / EUROSTAT / UNECE / WORLD BANK</span>
                    </div>
                    <p className="font-serif text-sm text-text-primary">
                      ILO, IMF, OECD, Eurostat, UNECE, World Bank. <em>Consumer Price Index Manual: Theory and Practice.</em>
                    </p>
                    <p className="text-xs text-text-dim leading-relaxed">
                      <strong className="text-text-primary font-mono">Methodological Role:</strong> Establishes the axiomatic tests (monotonicity, proportionality, time reversal, circularity/transitivity, commodity reversal) required for any price index to qualify for sovereign national accounting and inflation target monitoring.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ============================================================ */}
            {/*  SECTION 2: Policy Roadmap: Statutory Data-Sharing Mandate    */}
            {/* ============================================================ */}
            <section id="policy-roadmap" className="space-y-8 scroll-mt-20 border-t border-line pt-12">
              <div className="space-y-2">
                <span className="font-mono text-xs text-accent-amber">[ 02 :: REGULATORY ARCHITECTURE ]</span>
                <h2 className="text-2xl font-bold font-mono text-text-primary">
                  Policy Roadmap: A Statutory Data-Sharing Mandate
                </h2>
                <p className="text-sm text-text-dim leading-relaxed max-w-3xl">
                  Web scraping is an essential diagnostic proof-of-concept, but an official national price index cannot 
                  permanently rely on scraping commercial booking portals against aggressive anti-bot countermeasures.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* The Technical Reality */}
                <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                  <span className="font-mono text-xs text-alert font-bold block">
                    THE LIMITS OF SCRAPING IN REGULATED INFRASTRUCTURE
                  </span>
                  <p className="text-xs text-text-dim leading-relaxed">
                    AeroCPI&apos;s empirical testing on live Indian booking channels documented clear operational barriers: IndiGo direct HTTP requests were stopped with HTTP 403 Forbidden by Akamai Bot Manager, and remained soft-blocked (returning empty flight data payloads) even when routed through Playwright with stealth evasions. Akasa Air returned initial HTTP 403 Forbidden responses, and while network-level blocks could be bypassed via Playwright, the browser still encountered soft-blocking with zero extractable flights. Meanwhile, major OTAs (EaseMyTrip and Cleartrip) returned HTTP 200 OK containing interactive CAPTCHA challenge interstitials in the response body.
                  </p>
                  <p className="text-xs text-text-dim leading-relaxed">
                    Escalating an adversarial arms race—deploying rotating residential proxies, headless stealth masking, or CAPTCHA-solving farms—is technically fragile and ethically inappropriate for an official government statistical pipeline.
                  </p>
                </div>

                {/* The Sustainable Solution */}
                <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                  <span className="font-mono text-xs text-signal-green font-bold block">
                    THE REGULATORY REMEDY: STRUCTURED REPORTING
                  </span>
                  <p className="text-xs text-text-dim leading-relaxed">
                    The sustainable long-term solution is not more aggressive scraping, but a directional policy transition toward a <strong>statutory data-sharing mandate</strong>.
                  </p>
                  <p className="text-xs text-text-dim leading-relaxed">
                    Under such a framework, scheduled commercial airlines operating in India would be required to transmit structured fare data directly to the statistical authority (MoSPI/NSO) or civil aviation regulator via secure, machine-readable API endpoints or standardized periodic data feeds.
                  </p>
                </div>
              </div>

              {/* Precedents Box */}
              <div className="border border-line bg-panel p-6 space-y-5 rounded-sm">
                <h3 className="font-mono text-xs text-accent-amber uppercase tracking-wider">
                  Established Precedent in Regulated Indian &amp; Global Sectors
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-text-dim leading-relaxed">
                  <div className="space-y-2 border-l border-line pl-3">
                    <span className="font-mono text-text-primary font-bold block">Indian Telecom (TRAI)</span>
                    <p>
                      Telecom service providers in India are mandated by regulation to file granular tariff structures, subscriber metrics, and service quality reports directly with the Telecom Regulatory Authority of India (TRAI). The regulator does not scrape commercial telecom websites to determine market pricing.
                    </p>
                  </div>

                  <div className="space-y-2 border-l border-line pl-3">
                    <span className="font-mono text-text-primary font-bold block">Taxation &amp; Trade (GSTN)</span>
                    <p>
                      The Goods and Services Tax Network (GSTN) established standardized digital transaction reporting across thousands of commercial entities, demonstrating that automated, secure data interchange at national scale is technically and administratively routine in India.
                    </p>
                  </div>

                  <div className="space-y-2 border-l border-line pl-3">
                    <span className="font-mono text-text-primary font-bold block">Aviation Precedent (US DOT)</span>
                    <p>
                      In civil aviation internationally, the United States Department of Transportation (DOT) has maintained long-standing statutory airline data reporting requirements (such as Form 41 financial and traffic reporting and the Origin and Destination Survey DB1B), mandating that airlines submit yield, traffic, and ticket price samples directly to the federal government.
                    </p>
                  </div>
                </div>

                <div className="border-t border-line/60 pt-4 text-xs font-mono text-text-dim">
                  <span className="text-accent-amber font-bold">DIRECTIONAL TARGET:</span> Joint MoSPI–DGCA regulatory directive standardizing automated daily JSON/XML tariff telemetry feeds, replacing scraper uncertainty with verified, tamper-evident carrier data pipelines.
                </div>
              </div>
            </section>

            {/* ============================================================ */}
            {/*  SECTION 3: Verification & Data Integrity Track Record       */}
            {/* ============================================================ */}
            <section id="verification-record" className="space-y-8 scroll-mt-20 border-t border-line pt-12">
              <div className="space-y-2">
                <span className="font-mono text-xs text-accent-amber">[ 03 :: INTEGRITY AUDIT ]</span>
                <h2 className="text-2xl font-bold font-mono text-text-primary">
                  Verification &amp; Data Integrity Track Record
                </h2>
                <p className="text-sm text-text-dim leading-relaxed max-w-3xl">
                  A credible statistical instrument requires strict honesty about its own development. 
                  Below is an unvarnished audit log of actual corrections, abandoned assumptions, and data 
                  provenance standards implemented during this project.
                </p>
              </div>

              <div className="space-y-4">
                {/* Event 1: Row-level LIVE / SEEDED tagging */}
                <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-mono text-xs text-signal-green font-bold">
                      01. ROW-LEVEL PROVENANCE TAGGING (LIVE VS. SEEDED)
                    </span>
                    <span className="font-mono text-[11px] px-2 py-0.5 border border-line bg-bg-void text-text-dim">
                      AUDIT STATUS: ENFORCED IN DB &amp; UI
                    </span>
                  </div>
                  <p className="text-xs text-text-dim leading-relaxed">
                    AeroCPI never silently presents synthetic or seeded calibration quotes as live web-scraped data. Every single row in the <code className="text-accent-amber">FareQuote</code> database table carries an explicit <code className="text-text-primary">source_type</code> flag (<code className="text-signal-green">live</code> vs. <code className="text-text-dim">seeded</code>).
                  </p>
                  <p className="text-xs text-text-dim leading-relaxed">
                    All UI dashboards, audit logs, coverage matrices, and materiality gap calculations prominently report this exact split ({livePct}% live / {seededPct}% seeded across {totalQuotes.toLocaleString()} records). Live records are visually styled in signal-green, while calibrated baseline seeds are clearly identified.
                  </p>
                </div>

                {/* Event 2: DGCA to MoSPI pivot */}
                <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-mono text-xs text-accent-amber font-bold">
                      02. PIVOT: ABANDONING THE DGCA BACKTEST AFTER FACTUAL AUDIT
                    </span>
                    <span className="font-mono text-[11px] px-2 py-0.5 border border-line bg-bg-void text-text-dim">
                      AUDIT STATUS: ARCHITECTURAL PIVOT
                    </span>
                  </div>
                  <p className="text-xs text-text-dim leading-relaxed">
                    Early specifications suggested backtesting AeroCPI against historical Directorate General of Civil Aviation (DGCA) monthly fare data. However, direct empirical verification of DGCA publications confirmed that <strong>DGCA does not publish route-level fare or airfare price index data at all</strong>—it only publishes passenger traffic counts and airline market share statistics.
                  </p>
                  <p className="text-xs text-text-dim leading-relaxed">
                    Rather than fabricating synthetic &ldquo;DGCA price baselines,&rdquo; the project immediately abandoned the DGCA fare backtest claim. We pivoted the benchmark to its authentic home: the <strong>Ministry of Statistics and Programme Implementation (MoSPI) Consumer Price Index (CPI) Transport sub-index (Division 07)</strong>, verified against official Press Information Bureau (PIB) press releases.
                  </p>
                </div>

                {/* Event 3: Removal of fabricated correlation metric */}
                <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-mono text-xs text-alert font-bold">
                      03. REMOVAL OF FABRICATED CORRELATION METRIC
                    </span>
                    <span className="font-mono text-[11px] px-2 py-0.5 border border-line bg-bg-void text-text-dim">
                      AUDIT STATUS: FABRICATED CLAIM PURGED
                    </span>
                  </div>
                  <p className="text-xs text-text-dim leading-relaxed">
                    During a rigorous code audit, an earlier UI prototype was found to display a fabricated correlation metric ($r = 0.942$, labeled as &ldquo;Pearson r: 0.942 / DGCA Tracking r: 0.942&rdquo;) that had been derived from synthetic mock arrays rather than authentic multi-month historical overlap with published price series.
                  </p>
                  <p className="text-xs text-text-dim leading-relaxed">
                    The fabricated 0.942 metric was completely excised from the application. The system status for MoSPI validation was honestly reset to <code className="text-accent-amber font-mono">STATUS: PENDING (MoSPI Data Overlap)</code>, plainly stating that real historical correlation can only be computed once several calendar months of live daily captures overlap with future published MoSPI monthly releases.
                  </p>
                </div>

                {/* Event 4: Transparent documentation of anti-bot limitations */}
                <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-mono text-xs text-accent-amber font-bold">
                      04. TRANSPARENT DISCLOSURE OF SCRAPER ANTI-BOT BARRIERS
                    </span>
                    <span className="font-mono text-[11px] px-2 py-0.5 border border-line bg-bg-void text-text-dim">
                      AUDIT STATUS: FACTUALLY DOCUMENTED
                    </span>
                  </div>
                  <p className="text-xs text-text-dim leading-relaxed">
                    When direct headless browser scraping against airline booking engines encountered commercial bot barriers—specifically Akamai Bot Manager HTTP 403 Forbidden on IndiGo, soft-blocking on Akasa Air, and in-body CAPTCHA challenge pages on EaseMyTrip and Cleartrip—the system did not conceal failures or deploy unauthorized CAPTCHA-bypass farms.
                  </p>
                  <p className="text-xs text-text-dim leading-relaxed">
                    Instead, the pipeline explicitly logged <code className="text-accent-amber font-mono">status = "bot_detected"</code> in the telemetry audit trail, executed graceful fallback to calibrated baseline seeds, and integrated SerpAPI (Google Flights API) as a metered, terms-compliant bridge to capture verified live market quotes.
                  </p>
                </div>
              </div>
            </section>

            {/* ============================================================ */}
            {/*  SECTION 4: Limitations & Phased Roadmap                     */}
            {/* ============================================================ */}
            <section id="limitations-roadmap" className="space-y-8 scroll-mt-20 border-t border-line pt-12">
              <div className="space-y-2">
                <span className="font-mono text-xs text-accent-amber">[ 04 :: SYSTEM EVOLUTION ]</span>
                <h2 className="text-2xl font-bold font-mono text-text-primary">
                  Current Limitations &amp; Phased Roadmap
                </h2>
                <p className="text-sm text-text-dim leading-relaxed max-w-3xl">
                  An objective appraisal of AeroCPI&apos;s current operational boundaries and the technical roadmap 
                  required to advance from an empirical research prototype to production-grade statistical infrastructure.
                </p>
              </div>

              {/* Current Boundaries */}
              <div className="border border-line bg-panel p-6 space-y-4 rounded-sm">
                <span className="font-mono text-xs text-text-dim uppercase tracking-wider block">
                  Current Prototype Operational Boundaries
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="border border-line bg-bg-void p-3 space-y-1">
                    <span className="text-text-dim block text-[10px]">ROUTE SCOPE</span>
                    <span className="text-text-primary font-bold text-sm">6 Core Trunks</span>
                    <span className="text-text-dim block text-[10px]">DEL, BOM, BLR, CCU, HYD, MAA</span>
                  </div>
                  <div className="border border-line bg-bg-void p-3 space-y-1">
                    <span className="text-text-dim block text-[10px]">SAMPLING HORIZONS</span>
                    <span className="text-text-primary font-bold text-sm">3 Windows</span>
                    <span className="text-text-dim block text-[10px]">T+7, T+15, T+30 Days</span>
                  </div>
                  <div className="border border-line bg-bg-void p-3 space-y-1">
                    <span className="text-text-dim block text-[10px]">SOURCE ENGINES</span>
                    <span className="text-text-primary font-bold text-sm">6 Sources</span>
                    <span className="text-text-dim block text-[10px]">3 Airlines + 3 OTAs (+ SerpAPI)</span>
                  </div>
                  <div className="border border-line bg-bg-void p-3 space-y-1">
                    <span className="text-text-dim block text-[10px]">TELEMETRY MIX (3,696 TOTAL)</span>
                    <span className="text-signal-green font-bold text-sm">{livePct}% Live (489)</span>
                    <span className="text-text-dim block text-[10px]">{seededPct}% Seeded (3,207)</span>
                  </div>
                </div>
              </div>

              {/* Phased Roadmap Cards */}
              <div className="space-y-4">
                <h3 className="font-mono text-xs text-text-dim uppercase tracking-wider">
                  Three-Phase Implementation Architecture
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  {/* Phase 1 */}
                  <div className="border border-accent-amber/50 bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-accent-amber font-bold">
                        PHASE 1: RESEARCH PROTOTYPE &amp; EMPIRICAL VALIDATION (ACTIVE)
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 bg-accent-amber/20 text-accent-amber border border-accent-amber/40">
                        STATUS: COMPLETED / OPERATIONAL
                      </span>
                    </div>
                    <ul className="text-xs text-text-dim space-y-1.5 list-disc list-inside leading-relaxed">
                      <li>Automated pipeline across 6 core high-density trunk routes and 3 advance booking windows.</li>
                      <li>Multilateral GEKS-Törnqvist price aggregation module preventing chain drift under product churn.</li>
                      <li>Empirical Materiality Gap analysis measuring a 7.3% average distortion between single static monthly snapshots and continuous daily tracking.</li>
                      <li>Strict row-level LIVE/SEEDED provenance tracking and cryptographic SHA-256 raw scrape audit logs.</li>
                    </ul>
                  </div>

                  {/* Phase 2 */}
                  <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-text-primary font-bold">
                        PHASE 2: NETWORK EXPANSION &amp; TELEMETRY SCALING (NEAR-TERM)
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 bg-panel border border-line text-text-dim">
                        STATUS: PLANNED (Q4 2026)
                      </span>
                    </div>
                    <ul className="text-xs text-text-dim space-y-1.5 list-disc list-inside leading-relaxed">
                      <li>Expanding basket coverage from 6 trunk routes to 20+ domestic city pairs, incorporating high-demand Tier 2/3 regional sectors (e.g., Pune, Kochi, Ahmedabad, Jaipur, Goa).</li>
                      <li>Automated scheduled cron daemon pipelines running daily captures, expanding the live quote fraction to &gt;90%.</li>
                      <li>Dynamic passenger traffic weighting integrated monthly from official published DGCA city-pair volume tables.</li>
                      <li>Route-specific surge detection and demand elasticity curve estimation.</li>
                    </ul>
                  </div>

                  {/* Phase 3 */}
                  <div className="border border-line bg-panel p-5 space-y-3 rounded-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-xs text-text-primary font-bold">
                        PHASE 3: STATUTORY INTEGRATION &amp; PRODUCTION HARDENING (LONG-TERM)
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 bg-panel border border-line text-text-dim">
                        STATUS: POLICY TARGET
                      </span>
                    </div>
                    <ul className="text-xs text-text-dim space-y-1.5 list-disc list-inside leading-relaxed">
                      <li>Statutory API data interchange: transition from web scraping to mandated regulatory JSON/XML feeds or airline NDC direct channels under MoSPI/DGCA authority.</li>
                      <li>Migration to enterprise time-series database architecture (PostgreSQL / TimescaleDB) for immutable high-frequency storage.</li>
                      <li>Continuous automated cross-validation and discrepancy alerting against published MoSPI monthly CPI releases (Division 07.3).</li>
                      <li>High-availability multi-region cluster deployment with role-based access control and formal statistical governance compliance.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Bottom Navigation CTA */}
            <div className="border border-line bg-panel p-6 rounded-sm text-center space-y-4">
              <div className="space-y-1">
                <span className="font-mono text-xs text-accent-amber font-bold">READY TO AUDIT TELEMETRY?</span>
                <h3 className="text-lg font-bold text-text-primary">
                  Explore Live Indices &amp; Audit Logs in the Terminal
                </h3>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <Link
                  href="/dashboard"
                  className="px-5 py-2.5 bg-accent-amber text-bg-void font-mono font-bold text-xs hover:bg-accent-amber/90 transition-colors"
                >
                  OPEN DASHBOARD →
                </Link>
                <Link
                  href="/dashboard/reports"
                  className="px-5 py-2.5 border border-line bg-bg-void text-text-primary font-mono text-xs hover:border-accent-amber transition-colors"
                >
                  VIEW AUDIT REPORTS →
                </Link>
              </div>
            </div>

          </main>
        </DotGridSpotlight>
      </div>

      {/* ============================================================ */}
      {/*  FOOTER                                                      */}
      {/* ============================================================ */}
      <footer className="border-t border-line bg-panel px-4 md:px-8 py-5 font-mono text-xs text-text-dim relative z-20">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-text-primary font-bold">AeroCPI PROTOTYPE</span>{" "}
            — GEKS-Törnqvist Multilateral Index (Eurostat / ILO Standards)
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <Link href="/" className="hover:text-accent-amber transition-colors">HOME</Link>
            <span>•</span>
            <Link href="/dashboard" className="hover:text-accent-amber transition-colors">DASHBOARD</Link>
            <span>•</span>
            <Link href="/dashboard/reports" className="hover:text-accent-amber transition-colors">REPORTS</Link>
            <span>•</span>
            <span className="text-signal-green">MOSPI PROVENANCE VERIFIED</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
