import { useEffect, useMemo, useRef, useState } from "react";
import gift from "@/assets/gift.png"; // 닫힌 선물
import gift2 from "@/assets/gift2.png"; // 열린 선물

type Ladder = boolean[][]; // [row][col] : col과 col+1 사이 가로줄이 있으면 true
type Point = { x: number; y: number };

const N = 14;
const ROWS = 12;

const W = 980;
const H = 560;

const PAD_X = 50;
const TOP_H = 90;
const BOT_H = 100;

// 14가지 색상
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

function buildPathPoints(
  ladder: Ladder,
  startCol: number,
  cols: number,
  rows: number,
  xStep: number,
  yTop: number,
  yBottom: number,
  yStep: number,
  padX: number,
): { points: Point[]; endCol: number } {
  const { endCol, colByRow } = traceColsByRow(ladder, startCol, cols);

  const pts: Point[] = [];
  pts.push({ x: padX + colByRow[0] * xStep, y: yTop });

  for (let r = 0; r < rows; r++) {
    const c1 = colByRow[r];
    const c2 = colByRow[r + 1];

    const yMid = yTop + (r + 0.5) * yStep;
    const yNext = yTop + (r + 1) * yStep;

    pts.push({ x: padX + c1 * xStep, y: yMid });
    if (c2 !== c1) pts.push({ x: padX + c2 * xStep, y: yMid });
    pts.push({ x: padX + c2 * xStep, y: yNext });
  }

  pts.push({ x: padX + endCol * xStep, y: yBottom });
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

  // 완전히 포함되는 점들
  for (let i = 1; i < points.length; i++) {
    if (cum[i] < target) out.push(points[i]);
    else break;
  }

  // 마지막 부분점
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
  startIdx: number; // 0~13 (친/구/..)
  color: string;
  pathPoints: Point[]; // 완성된 경로(풀)
  endCol: number; // 도착한 아래칸
};

export default function App() {
  const topCells = useMemo(
    () => [
      "친",
      "구",
      "들",
      "아",
      "고",
      "마",
      "워",
      "미",
      "안",
      "해",
      "사",
      "랑",
      "해",
      "!",
    ],
    [],
  );

  // 사다리는 고정(클릭해도 안 바뀜)
  const [ladder, setLadder] = useState<Ladder>(() => buildLadder(N, ROWS));

  // 지금 애니메이션 중인 시작 인덱스
  const [picked, setPicked] = useState<number | null>(null);
  const [animT, setAnimT] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // 누적 결과(경로 유지)
  const [completed, setCompleted] = useState<CompletedRun[]>([]);
  // 아래 선물 열린 상태 유지 (도착 column 기준)
  const [openedCols, setOpenedCols] = useState<Record<number, boolean>>({});

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const xStep = (W - PAD_X * 2) / (N - 1);
  const yTop = TOP_H;
  const yBottom = H - BOT_H;
  const yStep = (yBottom - yTop) / ROWS;

  const activeColor = picked == null ? "#111" : COLORS_14[picked];

  const path = useMemo(() => {
    if (picked == null) return null;
    return buildPathPoints(
      ladder,
      picked,
      N,
      ROWS,
      xStep,
      yTop,
      yBottom,
      yStep,
      PAD_X,
    );
  }, [ladder, picked, xStep, yTop, yBottom, yStep]);

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
    return slicePolyline(path.points, lengths.cum, lengths.total, animT);
  }, [path, lengths, animT]);

  const startAnimation = () => {
    if (!path || !lengths || picked == null) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    setIsAnimating(true);
    setAnimT(0);
    startRef.current = performance.now();

    const DURATION = 3200; // ✅ 더 천천히

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / DURATION);

      // 부드러운 easeInOut
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setAnimT(eased);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // ✅ 완주: 경로/선물 상태를 "누적"으로 저장
        const doneStart = picked;
        const doneColor = COLORS_14[doneStart];
        const donePath = path.points;
        const doneEnd = path.endCol;

        setCompleted((prev) => {
          // 같은 시작(친/구/..)을 여러 번 누르면 중복 저장 원치 않으면 여기서 막기
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
    // 이미 완료한 글자면 그냥 무시(원하면 다시 애니메이션 허용도 가능)
    if (completed.some((r) => r.startIdx === idx)) return;
    setPicked(idx);
  };

  const onReset = () => {
    setPicked(null);
    setAnimT(0);
    setIsAnimating(false);
    setCompleted([]);
    setOpenedCols({});
  };

  const onRebuild = () => {
    if (isAnimating) return;
    onReset();
    setLadder(buildLadder(N, ROWS));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        color: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
      }}
    >
      <div
        style={{
          width: "min(1020px, 100%)",
          background: "white",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>사다리타기</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              누르면 해당 색 경로가 내려가며 그려지고, 도착한 선물이 열린 채로
              유지돼요.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onRebuild}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: isAnimating ? "not-allowed" : "pointer",
                opacity: isAnimating ? 0.6 : 1,
                fontWeight: 700,
              }}
            >
              사다리 다시뽑기
            </button>
            <button
              onClick={onReset}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              초기화
            </button>
          </div>
        </div>

        {/* TOP 14칸 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${N}, 1fr)`,
            gap: 8,
            marginTop: 14,
            marginBottom: 12,
          }}
        >
          {topCells.map((t, i) => {
            const done = completed.some((r) => r.startIdx === i);
            const active = picked === i;
            const c = COLORS_14[i];

            return (
              <button
                key={i}
                onClick={() => onPick(i)}
                disabled={isAnimating || done}
                style={{
                  height: 48,
                  borderRadius: 14,
                  border: done
                    ? `2px solid ${c}`
                    : active
                      ? `2px solid ${c}`
                      : "1px solid #e5e7eb",
                  background: done ? "#fff" : active ? c : "#fff",
                  color: active ? "#fff" : "#111",
                  cursor: isAnimating || done ? "not-allowed" : "pointer",
                  opacity: isAnimating ? 0.85 : done ? 0.7 : 1,
                  fontSize: 18,
                  fontWeight: 900,
                }}
                title={done ? "이미 완료됨" : "여기를 누르면 시작"}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* LADDER SVG */}
        <div style={{ width: "100%", overflowX: "auto" }}>
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            style={{
              display: "block",
              margin: "0 auto",
              borderRadius: 14,
              background: "#fbfbfc",
              border: "1px solid #eef0f3",
            }}
          >
            {/* ✅ 세로줄은 항상 회색(선택해도 색 안 바뀜) */}
            {Array.from({ length: N }, (_, c) => {
              const x = PAD_X + c * xStep;
              return (
                <line
                  key={`v-${c}`}
                  x1={x}
                  y1={yTop}
                  x2={x}
                  y2={yBottom}
                  stroke="#c9ced6"
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={0.9}
                />
              );
            })}

            {/* 가로줄 */}
            {ladder.map((row, r) => {
              const y = yTop + (r + 0.5) * yStep;
              return row.map((has, c) => {
                if (!has) return null;
                const x1 = PAD_X + c * xStep;
                const x2 = PAD_X + (c + 1) * xStep;
                return (
                  <line
                    key={`h-${r}-${c}`}
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y}
                    stroke="#9aa3af"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                );
              });
            })}

            {/* ✅ 완료된 경로들(유지) */}
            {completed.map((run) => (
              <polyline
                key={`done-${run.startIdx}`}
                points={run.pathPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={run.color}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            ))}

            {/* ✅ 진행 중인 경로(내려가는 만큼만) */}
            {drawnPathPoints && drawnPathPoints.length >= 2 && (
              <polyline
                points={drawnPathPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={activeColor}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            )}

            {/* ✅ 진행 중 토큰 */}
            {tokenPos && (
              <>
                <circle
                  cx={tokenPos.x}
                  cy={tokenPos.y}
                  r={9}
                  fill={activeColor}
                  opacity={0.95}
                />
                <circle
                  cx={tokenPos.x}
                  cy={tokenPos.y}
                  r={18}
                  fill={activeColor}
                  opacity={0.12}
                />
              </>
            )}

            {/* ✅ 완료된 시작점 토큰(아래에 남기기) */}
            {completed.map((run) => {
              const last = run.pathPoints[run.pathPoints.length - 1];
              return (
                <circle
                  key={`done-dot-${run.startIdx}`}
                  cx={last.x}
                  cy={last.y}
                  r={7}
                  fill={run.color}
                  opacity={0.9}
                />
              );
            })}
          </svg>
        </div>

        {/* BOTTOM 14칸 (도착한 칸은 gift2로 "열린 상태" 유지) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${N}, 1fr)`,
            gap: 8,
            marginTop: 12,
          }}
        >
          {Array.from({ length: N }, (_, i) => {
            const opened = !!openedCols[i];
            // 열린 칸의 테두리는 "마지막으로 내려온 색"이 아니라,
            // 그 칸에 도착했던 경로 색(여러 개면 마지막 것)으로 칠해주기
            const lastRunToHere = [...completed]
              .reverse()
              .find((r) => r.endCol === i);
            const borderColor = lastRunToHere?.color ?? "#e5e7eb";

            return (
              <div
                key={i}
                style={{
                  height: 56,
                  borderRadius: 14,
                  border: opened
                    ? `2px solid ${borderColor}`
                    : "1px solid #e5e7eb",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 6,
                }}
              >
                <img
                  src={opened ? gift2 : gift}
                  alt="gift"
                  style={{
                    width: 40,
                    height: 40,
                    objectFit: "contain",
                    filter: opened
                      ? "drop-shadow(0 0 10px rgba(0,0,0,0.25))"
                      : "none",
                    transform: opened ? "scale(1.05)" : "scale(1)",
                    transition: "transform 160ms ease",
                  }}
                />
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
          * 한 번 완료된 글자는 비활성화되고(중복 방지), 경로/선물 상태는 계속
          누적돼요.
        </div>
      </div>
    </div>
  );
}
