import React, { useEffect, useMemo, useRef, useState } from "react";
import soundUrl from "@/assets/sound.mp3";
import confetti from "canvas-confetti";

type Ladder = boolean[][];
type Point = { x: number; y: number };

const ROWS = 12;

const H = 560;
const PAD_X = 40;
const TOP_H = 20;
const BOT_H = 20;

// ✅ TOP/BOTTOM 칸 사이 간격
const CELL_GAP = 10;

const COLORS_14 = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

const LADDER_STROKE = "rgba(148,163,184,.78)";
const LADDER_STROKE_W = 2.6;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildLadder(cols: number, rows: number): Ladder {
  const ladder: Ladder = Array.from({ length: rows }, () =>
    Array.from({ length: cols - 1 }, () => false),
  );

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols - 1) {
      const place = Math.random() < 0.35;
      const leftBlocked = c > 0 && ladder[r][c - 1];
      if (place && !leftBlocked) {
        ladder[r][c] = true;
        c += 2;
      } else {
        c += 1;
      }
    }
  }
  return ladder;
}

function traceColsByRow(ladder: Ladder, startCol: number, cols: number) {
  let col = startCol;
  const colByRow: number[] = [col];
  for (let r = 0; r < ladder.length; r++) {
    if (col > 0 && ladder[r][col - 1]) col -= 1;
    else if (col < cols - 1 && ladder[r][col]) col += 1;
    colByRow.push(col);
  }
  return { endCol: col, colByRow };
}

function buildPathPointsByCenters(
  ladder: Ladder,
  startCol: number,
  cols: number,
  rows: number,
  xCenters: number[],
  yTop: number,
  yBottom: number,
  yStep: number,
): { points: Point[]; endCol: number } {
  const { endCol, colByRow } = traceColsByRow(ladder, startCol, cols);

  const pts: Point[] = [];
  pts.push({ x: xCenters[colByRow[0]], y: yTop });

  for (let r = 0; r < rows; r++) {
    const c1 = colByRow[r];
    const c2 = colByRow[r + 1];

    const yMid = yTop + (r + 0.5) * yStep;
    const yNext = yTop + (r + 1) * yStep;

    pts.push({ x: xCenters[c1], y: yMid });
    if (c2 !== c1) pts.push({ x: xCenters[c2], y: yMid });
    pts.push({ x: xCenters[c2], y: yNext });
  }

  pts.push({ x: xCenters[endCol], y: yBottom });
  return { points: pts, endCol };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildCumulative(points: Point[]) {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distance(points[i], points[i + 1]);
    cum.push(total);
  }
  return { cum, total };
}

function pointAt(
  points: Point[],
  cum: number[],
  total: number,
  t01: number,
): Point {
  const target = total * Math.min(1, Math.max(0, t01));
  let i = 0;
  while (i < cum.length - 1 && cum[i + 1] < target) i++;

  const a = points[i];
  const b = points[i + 1] ?? points[i];

  const segStart = cum[i];
  const segEnd = cum[i + 1] ?? cum[i];
  const segLen = Math.max(1e-6, segEnd - segStart);

  const u = (target - segStart) / segLen;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

function slicePolyline(
  points: Point[],
  cum: number[],
  total: number,
  t01: number,
): Point[] {
  const target = total * Math.min(1, Math.max(0, t01));
  const out: Point[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    if (cum[i] < target) out.push(points[i]);
    else break;
  }

  const k = out.length - 1;
  if (k < points.length - 1) {
    const segStart = cum[k];
    const segEnd = cum[k + 1];
    if (target > segStart) {
      const a = points[k];
      const b = points[k + 1];
      const segLen = Math.max(1e-6, segEnd - segStart);
      const u = (target - segStart) / segLen;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    }
  }
  return out;
}

type CompletedRun = {
  startIdx: number;
  color: string;
  pathPoints: Point[];
  endCol: number;
};

type SettingsDraft = { n: number; top: string[]; bottom: string[] };

export default function App() {
  // ✅ 인원 수: 2~10
  const [N, setN] = useState(6);

  // ✅ 위/아래 텍스트
  const [topCells, setTopCells] = useState<string[]>(
    Array.from({ length: 6 }, (_, i) => `이름${i + 1}`),
  );
  const [bottomCells, setBottomCells] = useState<string[]>(
    Array.from({ length: 6 }, (_, i) => `결과${i + 1}`),
  );

  // ✅ 설정 모달 state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(
    null,
  );

  // N 변경 시 배열 길이 맞추기
  useEffect(() => {
    setTopCells((prev) => {
      const next = prev.slice(0, N);
      while (next.length < N) next.push(`이름${next.length + 1}`);
      return next;
    });
    setBottomCells((prev) => {
      const next = prev.slice(0, N);
      while (next.length < N) next.push(`결과${next.length + 1}`);
      return next;
    });
  }, [N]);

  // ✅ "어떤 화면비에서도 스크롤 없이 딱 맞게" = 카드 전체 scale
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const recompute = () => {
      const baseW = el.offsetWidth;
      const baseH = el.offsetHeight;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const safePad = 56;
      const sx = (vw - safePad) / Math.max(1, baseW);
      const sy = (vh - safePad) / Math.max(1, baseH);

      setScale(Math.min(1, sx, sy));
    };

    const raf = requestAnimationFrame(recompute);

    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);

    window.addEventListener("resize", recompute);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, []);

  // ✅ ladder 폭은 laneBox 기준으로 계속 맞춤
  const ladderRef = useRef<HTMLDivElement | null>(null);
  const [ladderW, setLadderW] = useState(980);

  useEffect(() => {
    const el = ladderRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setLadderW(Math.max(320, Math.floor(w)));
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 사운드
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playSound = () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p) p.catch(() => {});
    } catch {
      // ignore
    }
  };

  const fireSuccessConfetti = (color: string) => {
    const defaults = {
      origin: { x: 0.5, y: 0.52 },
      zIndex: 10000,
      disableForReducedMotion: true,
    };

    confetti({
      ...defaults,
      particleCount: 110,
      spread: 360,
      startVelocity: 55,
      colors: [color, color, color, "#ffffff"],
      shapes: ["circle", "square"],
      scalar: 2.0,
      ticks: 120,
      gravity: 0.75,
      decay: 0.9,
    });
  };

  // ✅ 사다리
  const [ladder, setLadder] = useState<Ladder>(() => buildLadder(N, ROWS));
  useEffect(() => {
    setLadder(buildLadder(N, ROWS));
    // 진행 상태 초기화
    setPicked(null);
    setAnimT(0);
    setIsAnimating(false);
    setCompleted([]);
    setOpenedCols({});
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N]);

  const [picked, setPicked] = useState<number | null>(null);
  const [animT, setAnimT] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const [completed, setCompleted] = useState<CompletedRun[]>([]);
  const [openedCols, setOpenedCols] = useState<Record<number, boolean>>({});

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const yTop = TOP_H;
  const yBottom = H - BOT_H;
  const yStep = (yBottom - yTop) / ROWS;

  const xCenters = useMemo(() => {
    const innerW = ladderW - PAD_X * 2;
    const colW = (innerW - CELL_GAP * (N - 1)) / N;
    return Array.from({ length: N }, (_, i) => {
      const left = PAD_X + i * (colW + CELL_GAP);
      return left + colW / 2;
    });
  }, [ladderW, N]);

  const activeColor = picked == null ? "#111827" : COLORS_14[picked];

  const path = useMemo(() => {
    if (picked == null) return null;
    return buildPathPointsByCenters(
      ladder,
      picked,
      N,
      ROWS,
      xCenters,
      yTop,
      yBottom,
      yStep,
    );
  }, [ladder, picked, xCenters, yTop, yBottom, yStep, N]);

  const lengths = useMemo(() => {
    if (!path) return null;
    return buildCumulative(path.points);
  }, [path]);

  const tokenPos = useMemo(() => {
    if (!path || !lengths) return null;
    return pointAt(path.points, lengths.cum, lengths.total, animT);
  }, [path, lengths, animT]);

  const drawnPathPoints = useMemo(() => {
    if (!path || !lengths) return null;
    const t = Math.max(0.02, animT);
    return slicePolyline(path.points, lengths.cum, lengths.total, t);
  }, [path, lengths, animT]);

  const startAnimation = () => {
    if (!path || !lengths || picked == null) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    setIsAnimating(true);
    setAnimT(0);
    startRef.current = performance.now();

    const DURATION = 3600;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / DURATION);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      setAnimT(eased);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        const doneStart = picked;
        const doneColor = COLORS_14[doneStart];
        const donePath = path.points;
        const doneEnd = path.endCol;

        setCompleted((prev) => {
          const exists = prev.some((r) => r.startIdx === doneStart);
          if (exists) return prev;
          return [
            ...prev,
            {
              startIdx: doneStart,
              color: doneColor,
              pathPoints: donePath,
              endCol: doneEnd,
            },
          ];
        });

        setOpenedCols((prev) => ({ ...prev, [doneEnd]: true }));

        fireSuccessConfetti(doneColor);
        playSound();

        setIsAnimating(false);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (picked == null) return;
    startAnimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const onPick = (idx: number) => {
    if (isAnimating) return;
    if (completed.some((r) => r.startIdx === idx)) return;
    setPicked(idx);
  };

  const onNewGame = () => {
    if (isAnimating) return;
    setPicked(null);
    setAnimT(0);
    setIsAnimating(false);
    setCompleted([]);
    setOpenedCols({});
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLadder(buildLadder(N, ROWS));
  };

  // ✅ 설정 열기/닫기/적용
  const openSettings = () => {
    setSettingsDraft({ n: N, top: [...topCells], bottom: [...bottomCells] });
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    setSettingsDraft(null);
  };

  const applySettings = () => {
    if (!settingsDraft) return;

    const nextN = clamp(settingsDraft.n, 2, 10);

    const t = settingsDraft.top.slice(0, nextN);
    while (t.length < nextN) t.push(`이름${t.length + 1}`);

    const b = settingsDraft.bottom.slice(0, nextN);
    while (b.length < nextN) b.push(`결과${b.length + 1}`);

    setN(nextN);
    setTopCells(t);
    setBottomCells(b);

    setSettingsOpen(false);
    setSettingsDraft(null);
  };

  const setDraftN = (next: number) => {
    setSettingsDraft((prev) => {
      if (!prev) return prev;
      const nn = clamp(next, 2, 10);

      const top = prev.top.slice(0, nn);
      while (top.length < nn) top.push(`이름${top.length + 1}`);

      const bottom = prev.bottom.slice(0, nn);
      while (bottom.length < nn) bottom.push(`결과${bottom.length + 1}`);

      return { n: nn, top, bottom };
    });
  };

  const updateDraftTop = (i: number, val: string) => {
    setSettingsDraft((prev) => {
      if (!prev) return prev;
      const top = [...prev.top];
      top[i] = val;
      return { ...prev, top };
    });
  };

  const updateDraftBottom = (i: number, val: string) => {
    setSettingsDraft((prev) => {
      if (!prev) return prev;
      const bottom = [...prev.bottom];
      bottom[i] = val;
      return { ...prev, bottom };
    });
  };

  return (
    <div className="page">
      <audio ref={audioRef} src={soundUrl} preload="auto" />

      <style>{`
        .page{
          height:100dvh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:28px;
          overflow:hidden;
          background:
            radial-gradient(1200px 600px at 20% 10%, rgba(255, 205, 231, .55), transparent 60%),
            radial-gradient(900px 500px at 80% 20%, rgba(187, 255, 241, .55), transparent 60%),
            radial-gradient(900px 600px at 50% 90%, rgba(196, 211, 255, .55), transparent 60%),
            linear-gradient(180deg, #fbfbff 0%, #f7f7fb 55%, #faf7ff 100%);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          color:#1f2937;
          position:relative;
        }

        .blob{
          position:absolute;
          width:420px; height:420px;
          filter: blur(28px);
          opacity:.35;
          border-radius:999px;
          animation: floaty 7s ease-in-out infinite;
          pointer-events:none;
        }
        .b1{ left:-120px; top:-140px; background: #ffb6d5; }
        .b2{ right:-160px; top:-120px; background: #a7f3d0; animation-delay: -2.5s;}
        .b3{ left:20%; bottom:-220px; background: #b7c7ff; animation-delay: -4s;}
        @keyframes floaty{
          0%,100%{ transform: translate(0,0) scale(1); }
          50%{ transform: translate(0,-18px) scale(1.04); }
        }

        .fitWrap{ transform-origin:center; will-change: transform; }
        .card{
          width:min(1040px, 100%);
          background: rgba(255,255,255,.82);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,.7);
          border-radius: 22px;
          box-shadow: 0 18px 50px rgba(17,24,39,.12);
          padding: 18px;
          position:relative;
        }

        .laneBox{ width: 100%; max-width: 100%; margin: 0 auto; }

        .gridTop{
          display:grid;
          grid-template-columns: repeat(${N}, minmax(0, 1fr));
          gap: ${CELL_GAP}px;
          padding-left: ${PAD_X}px;
          padding-right: ${PAD_X}px;
          margin-top: 14px;
          margin-bottom: 12px;
        }
        .gridBottom{
          display:grid;
          grid-template-columns: repeat(${N}, minmax(0, 1fr));
          gap: ${CELL_GAP}px;
          padding-left: ${PAD_X}px;
          padding-right: ${PAD_X}px;
          margin-top:12px;
        }

        .cellBtn{
          width:100%;
          height: 50px;
          border-radius: 16px;
          border: 1px solid rgba(229,231,235,.95);
          background: rgba(255,255,255,.92);
          cursor:pointer;
          font-size:16px;
          font-weight:900;
          box-shadow: 0 8px 18px rgba(0,0,0,.06);
          transition: transform .12s ease, box-shadow .12s ease;
          padding: 0 10px;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .cellBtn:hover{ transform: translateY(-1px); box-shadow: 0 12px 26px rgba(0,0,0,.08); }
        .cellBtn:active{ transform: translateY(0px) scale(.98); }
        .cellBtn[disabled]{ cursor:not-allowed; opacity:.7; }

        .ladderWrap{ width: 100%; margin-top: 6px; }
        .svgBox{ display:block; width:100%; height:auto; background: transparent; }

        .resultCell{
          width:100%;
          height: 58px;
          border-radius: 16px;
          border: 1px solid rgba(229,231,235,.95);
          background: rgba(255,255,255,.92);
          display:flex;
          align-items:center;
          justify-content:center;
          padding: 6px 10px;
          box-shadow: 0 8px 18px rgba(0,0,0,.06);
          user-select:none;
          font-weight: 900;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .gearBtn{
          position:absolute;
          top: 12px;
          right: 12px;
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(229,231,235,.95);
          background: rgba(255,255,255,.9);
          box-shadow: 0 10px 22px rgba(0,0,0,.08);
          cursor:pointer;
          font-size: 18px;
          font-weight: 900;
        }

        .modalOverlay{
          position:fixed;
          inset:0;
          background: rgba(15,23,42,.35);
          display:flex;
          align-items:center;
          justify-content:center;
          padding: 18px;
          z-index: 20000;
        }
        .modal{
          width: min(720px, 100%);
          background: rgba(255,255,255,.92);
          border: 1px solid rgba(255,255,255,.7);
          backdrop-filter: blur(10px);
          border-radius: 22px;
          box-shadow: 0 22px 60px rgba(17,24,39,.22);
          padding: 16px;
        }
        .modalHeader{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .modalTitle{
          font-weight: 900;
          font-size: 18px;
        }
        .row{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
          padding: 10px;
          border-radius: 16px;
          border: 1px solid rgba(229,231,235,.9);
          background: rgba(255,255,255,.75);
          margin-bottom: 10px;
        }
        .rowLabel{
          font-weight: 900;
        }
        .stepper{
          display:flex;
          align-items:center;
          gap: 10px;
        }
        .iconBtn{
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(229,231,235,.95);
          background: rgba(255,255,255,.92);
          cursor:pointer;
          font-weight: 900;
          font-size: 18px;
        }
        .iconBtn:disabled{ cursor:not-allowed; opacity:.6; }

        .gridEdit{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        .field{
          border: 1px solid rgba(229,231,235,.95);
          background: rgba(255,255,255,.85);
          border-radius: 16px;
          padding: 10px;
        }
        .fieldTitle{
          font-weight: 900;
          margin-bottom: 8px;
          font-size: 14px;
        }
        .input{
          width:100%;
          height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(229,231,235,.95);
          padding: 0 10px;
          outline: none;
          font-weight: 800;
          background: rgba(255,255,255,.95);
          margin-bottom: 8px;
        }
        .actions{
          display:flex;
          justify-content:flex-end;
          gap: 8px;
          margin-top: 12px;
        }
        .btn{
          height: 38px;
          padding: 0 12px;
          border-radius: 14px;
          border: 1px solid rgba(229,231,235,.95);
          background: rgba(255,255,255,.9);
          font-weight: 900;
          cursor:pointer;
        }
        .btnPrimary{
          background: rgba(17,24,39,.92);
          color: white;
        }
        .btnDanger{
          background: rgba(239,68,68,.92);
          color: white;
          border-color: rgba(239,68,68,.92);
        }
      `}</style>

      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />

      <div className="fitWrap" style={{ transform: `scale(${scale})` }}>
        <div ref={cardRef} className="card">
          {/* ⚙️ 설정 */}
          <button
            className="gearBtn"
            onClick={openSettings}
            disabled={isAnimating}
            title="설정"
          >
            ⚙️
          </button>

          <div ref={ladderRef} className="laneBox">
            {/* TOP: 클릭하면 출발 */}
            <div className="gridTop">
              {Array.from({ length: N }, (_, i) => {
                const done = completed.some((r) => r.startIdx === i);
                const active = picked === i;
                const c = COLORS_14[i];

                const filled = done || active;
                const bg = filled ? c : "rgba(255,255,255,.92)";
                const border = filled
                  ? `2px solid ${c}`
                  : "1px solid rgba(229,231,235,.95)";
                const color = filled ? "#fff" : "#111827";

                return (
                  <button
                    key={i}
                    className="cellBtn"
                    onClick={() => onPick(i)}
                    disabled={isAnimating || done}
                    style={{ background: bg, border, color }}
                    title="클릭하면 사다리 출발"
                  >
                    {topCells[i] ?? `이름${i + 1}`}
                  </button>
                );
              })}
            </div>

            {/* LADDER */}
            <div className="ladderWrap">
              <svg
                className="svgBox"
                width={ladderW}
                height={H}
                viewBox={`0 0 ${ladderW} ${H}`}
                preserveAspectRatio="none"
              >
                {/* 세로줄 */}
                {xCenters.map((x, c) => (
                  <line
                    key={`v-${c}`}
                    x1={x}
                    y1={yTop}
                    x2={x}
                    y2={yBottom}
                    stroke={LADDER_STROKE}
                    strokeWidth={LADDER_STROKE_W}
                    strokeLinecap="round"
                  />
                ))}

                {/* 가로줄 */}
                {ladder.map((row, r) => {
                  const y = yTop + (r + 0.5) * yStep;
                  return row.map((has, c) => {
                    if (!has) return null;
                    const x1 = xCenters[c];
                    const x2 = xCenters[c + 1];
                    return (
                      <line
                        key={`h-${r}-${c}`}
                        x1={x1}
                        y1={y}
                        x2={x2}
                        y2={y}
                        stroke={LADDER_STROKE}
                        strokeWidth={LADDER_STROKE_W}
                        strokeLinecap="round"
                      />
                    );
                  });
                })}

                {/* 완료된 경로들 */}
                {completed.map((run) => (
                  <polyline
                    key={`done-${run.startIdx}`}
                    points={run.pathPoints
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill="none"
                    stroke={run.color}
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.92}
                  />
                ))}

                {/* 진행 중 경로 */}
                {drawnPathPoints && drawnPathPoints.length >= 2 && (
                  <polyline
                    points={drawnPathPoints
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill="none"
                    stroke={activeColor}
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                )}

                {/* 진행 중 토큰 */}
                {tokenPos && (
                  <g>
                    <circle
                      cx={tokenPos.x}
                      cy={tokenPos.y}
                      r={12}
                      fill={activeColor}
                      opacity={0.95}
                    />
                    <circle
                      cx={tokenPos.x}
                      cy={tokenPos.y}
                      r={22}
                      fill={activeColor}
                      opacity={0.12}
                    />
                    <circle
                      cx={tokenPos.x - 4}
                      cy={tokenPos.y - 2}
                      r={1.6}
                      fill="rgba(255,255,255,.95)"
                    />
                    <circle
                      cx={tokenPos.x + 4}
                      cy={tokenPos.y - 2}
                      r={1.6}
                      fill="rgba(255,255,255,.95)"
                    />
                    <path
                      d={`M ${tokenPos.x - 4} ${tokenPos.y + 4} Q ${tokenPos.x} ${tokenPos.y + 7} ${tokenPos.x + 4} ${tokenPos.y + 4}`}
                      stroke="rgba(255,255,255,.9)"
                      strokeWidth="1.6"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </g>
                )}
              </svg>
            </div>

            {/* ✅ BOTTOM: 이제 ??? 대신 입력값 그대로 보여주기 */}
            <div className="gridBottom">
              {Array.from({ length: N }, (_, i) => {
                const opened = !!openedCols[i];
                const lastRunToHere = [...completed]
                  .reverse()
                  .find((r) => r.endCol === i);

                const borderColor = opened
                  ? (lastRunToHere?.color ?? "#e5e7eb")
                  : "rgba(229,231,235,.95)";

                return (
                  <div
                    className="resultCell"
                    key={i}
                    style={{
                      border: opened
                        ? `2px solid ${borderColor}`
                        : `1px solid ${borderColor}`,
                      opacity: opened ? 1 : 0.9,
                    }}
                    title={opened ? "열림" : "미공개"}
                  >
                    {bottomCells[i] ?? `결과${i + 1}`}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 설정 모달 */}
          {settingsOpen && settingsDraft && (
            <div
              className="modalOverlay"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeSettings();
              }}
            >
              <div className="modal">
                <div className="modalHeader">
                  <div className="modalTitle">설정</div>
                  <button className="btn" onClick={closeSettings} type="button">
                    닫기
                  </button>
                </div>

                <div className="row">
                  <div className="rowLabel">인원 수</div>
                  <div className="stepper">
                    <button
                      className="iconBtn"
                      onClick={() => setDraftN((settingsDraft?.n ?? N) - 1)}
                      disabled={(settingsDraft?.n ?? N) <= 2}
                      type="button"
                    >
                      −
                    </button>
                    <div
                      style={{
                        minWidth: 64,
                        textAlign: "center",
                        fontWeight: 900,
                      }}
                    >
                      {settingsDraft?.n ?? N}명
                    </div>
                    <button
                      className="iconBtn"
                      onClick={() => setDraftN((settingsDraft?.n ?? N) + 1)}
                      disabled={(settingsDraft?.n ?? N) >= 10}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="gridEdit">
                  <div className="field">
                    <div className="fieldTitle">위(이름)</div>
                    {Array.from({ length: settingsDraft.n }, (_, i) => (
                      <input
                        key={`t-${i}`}
                        className="input"
                        value={settingsDraft.top[i] ?? ""}
                        onChange={(e) => updateDraftTop(i, e.target.value)}
                        placeholder={`이름${i + 1}`}
                      />
                    ))}
                  </div>

                  <div className="field">
                    <div className="fieldTitle">아래(결과)</div>
                    {Array.from({ length: settingsDraft.n }, (_, i) => (
                      <input
                        key={`b-${i}`}
                        className="input"
                        value={settingsDraft.bottom[i] ?? ""}
                        onChange={(e) => updateDraftBottom(i, e.target.value)}
                        placeholder={`결과${i + 1}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="actions">
                  <button
                    className="btn btnDanger"
                    onClick={() => {
                      onNewGame();
                      closeSettings();
                    }}
                    disabled={isAnimating}
                    type="button"
                  >
                    새 게임(사다리 재생성)
                  </button>
                  <button className="btn" onClick={closeSettings} type="button">
                    취소
                  </button>
                  <button
                    className="btn btnPrimary"
                    onClick={applySettings}
                    type="button"
                  >
                    적용
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
