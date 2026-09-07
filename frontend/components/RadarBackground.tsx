"use client";

import React, { useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Flight label data — tactical ATC callsigns                        */
/* ------------------------------------------------------------------ */
const FLIGHT_LABELS = [
  "AI-505 380KT FL340",
  "6E-2134 420KT FL360",
  "QP-1102 360KT FL310",
  "SG-8169 390KT FL350",
  "UK-837 410KT FL380",
  "AI-680 370KT FL330",
  "6E-809 400KT FL370",
  "QP-1354 350KT FL290",
  "SG-445 415KT FL340",
  "AI-102 385KT FL320",
];

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const BASE_OPACITY = 0.25;
const SWEEP_PULSE_OPACITY = 0.9;
const PHOSPHOR_DECAY = 0.015; // per frame
const TRAIL_LENGTH = 10;

/* Login card exclusion zone (approx bounding box in viewport %) */
const CARD_PAD = 30; // extra px margin around the card

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Aircraft {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Current rendered opacity — animated by sweep phosphor */
  renderOpacity: number;
  label: string;
  trail: { x: number; y: number }[];
}

/* ------------------------------------------------------------------ */
/*  Utility: spawn an aircraft from a random viewport edge             */
/* ------------------------------------------------------------------ */
function spawnAircraft(w: number, h: number, index: number): Aircraft {
  const edge = Math.floor(Math.random() * 4);
  let x: number, y: number, vx: number, vy: number;

  const speed = 0.4 + Math.random() * 0.6;

  switch (edge) {
    case 0:
      x = Math.random() * w;
      y = -10;
      vx = (Math.random() - 0.5) * speed;
      vy = speed * (0.5 + Math.random() * 0.5);
      break;
    case 1:
      x = w + 10;
      y = Math.random() * h;
      vx = -speed * (0.5 + Math.random() * 0.5);
      vy = (Math.random() - 0.5) * speed;
      break;
    case 2:
      x = Math.random() * w;
      y = h + 10;
      vx = (Math.random() - 0.5) * speed;
      vy = -speed * (0.5 + Math.random() * 0.5);
      break;
    default:
      x = -10;
      y = Math.random() * h;
      vx = speed * (0.5 + Math.random() * 0.5);
      vy = (Math.random() - 0.5) * speed;
      break;
  }

  return {
    x,
    y,
    vx,
    vy,
    renderOpacity: BASE_OPACITY,
    label: FLIGHT_LABELS[index % FLIGHT_LABELS.length],
    trail: [],
  };
}

/* ------------------------------------------------------------------ */
/*  Draw airplane silhouette at (0, 0) pointing right (heading = 0)    */
/* ------------------------------------------------------------------ */
function drawAirplane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  opacity: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.globalAlpha = opacity;

  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-2, -5);
  ctx.lineTo(-1, -1.5);
  ctx.lineTo(-6, -3);
  ctx.lineTo(-7, -1);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-7, 1);
  ctx.lineTo(-6, 3);
  ctx.lineTo(-1, 1.5);
  ctx.lineTo(-2, 5);
  ctx.closePath();

  ctx.fillStyle = `rgba(201, 162, 39, ${opacity})`;
  ctx.fill();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Normalise angle to [0, 2π)                                         */
/* ------------------------------------------------------------------ */
function normaliseAngle(a: number): number {
  return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/* ------------------------------------------------------------------ */
/*  Check if point is inside exclusion rectangle                       */
/* ------------------------------------------------------------------ */
function isInsideCard(
  x: number,
  y: number,
  cardRect: { l: number; t: number; r: number; b: number },
): boolean {
  return (
    x >= cardRect.l - CARD_PAD &&
    x <= cardRect.r + CARD_PAD &&
    y >= cardRect.t - CARD_PAD &&
    y <= cardRect.b + CARD_PAD
  );
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export const RadarBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -999, y: -999 });
  const aircraftRef = useRef<Aircraft[]>([]);
  const sweepAngleRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const cardRectRef = useRef<{ l: number; t: number; r: number; b: number }>({
    l: 0,
    t: 0,
    r: 0,
    b: 0,
  });

  /* ------ initialise aircraft pool ------ */
  const initAircraft = useCallback((w: number, h: number) => {
    const count = 8;
    const planes: Aircraft[] = [];
    for (let i = 0; i < count; i++) {
      const a = spawnAircraft(w, h, i);
      a.x = Math.random() * w;
      a.y = Math.random() * h;
      planes.push(a);
    }
    aircraftRef.current = planes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      reducedMotionRef.current = true;
    }

    const ctx = canvas.getContext("2d")!;
    let w = window.innerWidth;
    let h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateCardRect();
    }

    /* ------ Compute login card bounding box ------ */
    function updateCardRect() {
      // The login card is the <form> element inside main
      const form = document.querySelector("main form");
      if (form) {
        const r = form.getBoundingClientRect();
        cardRectRef.current = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      } else {
        // Fallback: centre of viewport, ~450×500
        cardRectRef.current = {
          l: w / 2 - 225,
          t: h / 2 - 250,
          r: w / 2 + 225,
          b: h / 2 + 250,
        };
      }
    }

    resize();
    initAircraft(w, h);

    window.addEventListener("resize", resize);

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("mousemove", onMouseMove);

    // Periodically re-measure card rect (in case of layout shift)
    const cardInterval = setInterval(updateCardRect, 2000);

    /* ------ render loop ------ */
    function draw() {
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(cx, cy);

      // ========== 1. RADAR GRID ==========

      // Crosshair axes
      ctx.strokeStyle = "rgba(201, 162, 39, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // Concentric range rings
      const ringCount = 6;
      for (let i = 1; i <= ringCount; i++) {
        const r = (maxR / ringCount) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(201, 162, 39, ${0.14 + (i % 2 === 0 ? 0.04 : 0)})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Diagonal crosshairs
      ctx.strokeStyle = "rgba(201, 162, 39, 0.08)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy - maxR);
      ctx.lineTo(cx + maxR, cy + maxR);
      ctx.moveTo(cx + maxR, cy - maxR);
      ctx.lineTo(cx - maxR, cy + maxR);
      ctx.stroke();

      // ========== 2. RADAR SWEEP ==========
      let sweepAngle = sweepAngleRef.current;
      if (!reducedMotionRef.current) {
        sweepAngleRef.current += 0.005;
        sweepAngle = sweepAngleRef.current;
        const sweepLen = maxR;

        // Trailing gradient wedge
        const gradient = ctx.createConicGradient(sweepAngle - 0.3, cx, cy);
        gradient.addColorStop(0, "rgba(201, 162, 39, 0)");
        gradient.addColorStop(0.04, "rgba(201, 162, 39, 0.04)");
        gradient.addColorStop(0.05, "rgba(201, 162, 39, 0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, sweepLen, sweepAngle - 0.3, sweepAngle);
        ctx.closePath();
        ctx.fill();

        // Sweep line
        ctx.strokeStyle = "rgba(201, 162, 39, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          cx + Math.cos(sweepAngle) * sweepLen,
          cy + Math.sin(sweepAngle) * sweepLen,
        );
        ctx.stroke();
      }

      // ========== 3. AIRCRAFT ==========
      const planes = aircraftRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const card = cardRectRef.current;

      for (let i = 0; i < planes.length; i++) {
        const a = planes[i];

        if (!reducedMotionRef.current) {
          // Mouse repulsion
          const dx = a.x - mx;
          const dy = a.y - my;
          const dist = Math.hypot(dx, dy);
          if (dist < 80 && dist > 0) {
            const force = ((80 - dist) / 80) * 0.08;
            a.vx += (dx / dist) * force;
            a.vy += (dy / dist) * force;
          }

          // Clamp speed
          const spd = Math.hypot(a.vx, a.vy);
          const maxSpd = 1.2;
          const minSpd = 0.3;
          if (spd > maxSpd) {
            a.vx = (a.vx / spd) * maxSpd;
            a.vy = (a.vy / spd) * maxSpd;
          } else if (spd < minSpd) {
            a.vx = (a.vx / (spd || 1)) * minSpd;
            a.vy = (a.vy / (spd || 1)) * minSpd;
          }

          a.x += a.vx;
          a.y += a.vy;
        }

        // ---- Phosphor sweep illumination ----
        // Compute the aircraft's angular position relative to radar centre
        const planeAngle = normaliseAngle(Math.atan2(a.y - cy, a.x - cx));
        const normSweep = normaliseAngle(sweepAngle);
        let angleDelta = Math.abs(planeAngle - normSweep);
        if (angleDelta > Math.PI) angleDelta = Math.PI * 2 - angleDelta;

        // If the sweep just passed over (within ~5° wedge), pulse opacity up
        if (angleDelta < 0.09) {
          a.renderOpacity = SWEEP_PULSE_OPACITY;
        } else {
          // Phosphor decay back towards base
          a.renderOpacity = Math.max(
            BASE_OPACITY,
            a.renderOpacity - PHOSPHOR_DECAY,
          );
        }

        // ---- Center exclusion zone ----
        const inCard = isInsideCard(a.x, a.y, card);
        const effectiveOpacity = inCard
          ? a.renderOpacity * Math.max(0, 1 - 0.06 * 5) * 0 // fade to 0 inside card
          : a.renderOpacity;
        // Smoother: compute distance-based fade near card edges
        let cardFade = 1;
        if (inCard) {
          cardFade = 0;
        } else {
          // Fade within CARD_PAD*2 of the card edges
          const dLeft = a.x - (card.l - CARD_PAD);
          const dRight = card.r + CARD_PAD - a.x;
          const dTop = a.y - (card.t - CARD_PAD);
          const dBottom = card.b + CARD_PAD - a.y;
          const closestEdgeDist = Math.min(
            dLeft < 0 ? Infinity : dLeft,
            dRight < 0 ? Infinity : dRight,
            dTop < 0 ? Infinity : dTop,
            dBottom < 0 ? Infinity : dBottom,
          );
          if (closestEdgeDist < CARD_PAD) {
            cardFade = closestEdgeDist / CARD_PAD;
          }
        }

        const finalOpacity = a.renderOpacity * cardFade;

        // ---- Trail (10 points, tapering opacity + radius) ----
        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > TRAIL_LENGTH) a.trail.shift();

        for (let t = 0; t < a.trail.length - 1; t++) {
          const tp = a.trail[t];
          const progress = t / a.trail.length; // 0 = oldest, ~1 = newest
          const trailAlpha = progress * finalOpacity * 0.4;
          const trailRadius = 0.5 + progress * 1.0; // taper from 0.5 to 1.5
          ctx.fillStyle = `rgba(201, 162, 39, ${trailAlpha})`;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, trailRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // ---- Draw airplane ----
        const heading = Math.atan2(a.vy, a.vx);
        drawAirplane(ctx, a.x, a.y, heading, finalOpacity);

        // ---- Leader line + label ----
        if (finalOpacity > 0.02) {
          ctx.save();
          ctx.globalAlpha = finalOpacity * 0.45;

          // Angled leader line: plane → short horizontal → down-angled tag
          const lx1 = a.x + 10; // start of leader (right of plane)
          const ly1 = a.y - 4;
          const lx2 = lx1 + 6; // elbow
          const ly2 = ly1 - 8; // go up-right

          ctx.strokeStyle = `rgba(201, 162, 39, ${finalOpacity * 0.35})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x + 6, a.y - 2);
          ctx.lineTo(lx1, ly1);
          ctx.lineTo(lx2, ly2);
          ctx.stroke();

          // Label text at end of leader
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillStyle = `rgba(201, 162, 39, ${finalOpacity * 0.45})`;
          ctx.fillText(a.label, lx2 + 3, ly2 + 3);

          ctx.restore();
        }

        // Respawn if off-screen
        const margin = 60;
        if (
          a.x < -margin ||
          a.x > w + margin ||
          a.y < -margin ||
          a.y > h + margin
        ) {
          planes[i] = spawnAircraft(w, h, i);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(cardInterval);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [initAircraft]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
};
