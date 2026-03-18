import { useState, useMemo, useRef, useEffect, useCallback } from "react";

const typeConfig = {
  text: {
    label: "Text",
    color: "96, 165, 250",
    bright: "147, 197, 253",
    icon: "✏️",
  },
  voice: {
    label: "Voice",
    color: "251, 191, 36",
    bright: "253, 216, 100",
    icon: "🎙️",
  },
  photo: {
    label: "Photo",
    color: "192, 132, 252",
    bright: "216, 180, 254",
    icon: "📸",
  },
};

function generateSampleData() {
  const typeWeights = [0.55, 0.3, 0.15];
  const dumpTitles = {
    text: [
      "need to finish bio lab report, also email prof about extension, buy groceries, call mom",
      "thesis outline thoughts — intro needs work, find 3 more sources, schedule writing center",
      "clean room, do laundry, meal prep for the week, refill prescription",
      "project meeting notes — assign tasks, set deadline, book room for presentation",
      "random shower thoughts about app features, voice memo follow-up, sketch UI ideas",
      "study group plans, reserve library room, print handouts, review ch 7-9",
      "budget check — rent due friday, return textbook, cancel subscription",
      "brain dump after class — review lecture notes, start problem set, office hours thursday",
      "weekend plans, finish reading, start essay draft, gym schedule",
      "app ideas — notification wording, onboarding flow, color palette thoughts",
      "internship application checklist, update resume, ask for rec letter",
      "finals prep — make study schedule, organize notes by class, form study group",
    ],
    voice: [
      "Walking to class ramble — remembered I need to submit that form and also pick up meds",
      "Late night idea dump about the recommendation engine and how it should weight deadlines",
      "Driving thoughts — semester goals, summer plans, need to book flight home",
      "Post-lecture brain dump — that cognitive load theory connects to my app design",
      "Morning voice note — today's priorities, feeling good about the project",
    ],
    photo: [
      "Whiteboard photo from group project brainstorm session",
      "Screenshot of assignment rubric from Canvas",
      "Photo of handwritten notes from office hours",
      "Sticky note wall — project timeline and dependencies",
    ],
  };

  const data = [];
  for (let i = 0; i < 65; i++) {
    const rand = Math.random();
    let type;
    if (rand < typeWeights[0]) type = "text";
    else if (rand < typeWeights[0] + typeWeights[1]) type = "voice";
    else type = "photo";

    const titles = dumpTitles[type];
    const title = titles[i % titles.length];
    const taskCount = Math.floor(Math.random() * 6) + 1;
    const ageFactor = 1 - i / 65;
    const completedCount = Math.random() < ageFactor
      ? taskCount
      : Math.floor(Math.random() * (taskCount + 1));

    data.push({
      id: i,
      type,
      title,
      taskCount,
      completedCount: Math.min(completedCount, taskCount),
      daysAgo: Math.floor((65 - i) * 1.5),
    });
  }
  return data;
}

// Organic layout: golden-angle spiral with collision resolution
function computeLayout(data, width, height) {
  const cx = width / 2;
  const cy = height / 2;

  const nodes = data.map((d, i) => {
    // Size based on task count: more tasks = bigger tile
    const sizeBase = 18 + (d.taskCount / 6) * 20;
    const w = sizeBase + Math.random() * 6;
    const h = sizeBase * (0.75 + Math.random() * 0.5);

    // Golden angle spiral
    const angle = i * 2.399963 + (Math.random() - 0.5) * 0.3;
    const dist = 10 + Math.sqrt(i) * (Math.min(width, height) * 0.06);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;

    return { ...d, x, y, w, h };
  });

  // Collision resolution - push apart overlapping rectangles
  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const gap = 5;

        const overlapX = (a.w / 2 + b.w / 2 + gap) - Math.abs(a.x - b.x);
        const overlapY = (a.h / 2 + b.h / 2 + gap) - Math.abs(a.y - b.y);

        if (overlapX > 0 && overlapY > 0) {
          // Push along the axis of least overlap
          if (overlapX < overlapY) {
            const push = overlapX / 2 * 0.4;
            const dir = a.x < b.x ? -1 : 1;
            a.x += dir * push;
            b.x -= dir * push;
          } else {
            const push = overlapY / 2 * 0.4;
            const dir = a.y < b.y ? -1 : 1;
            a.y += dir * push;
            b.y -= dir * push;
          }
        }
      }
    }
  }

  // Fit everything in bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  });

  const pad = 12;
  const lw = maxX - minX;
  const lh = maxY - minY;
  const scaleX = (width - pad * 2) / lw;
  const scaleY = (height - pad * 2) / lh;
  const scale = Math.min(scaleX, scaleY, 1.2);

  const offsetX = (width - lw * scale) / 2 - minX * scale;
  const offsetY = (height - lh * scale) / 2 - minY * scale;

  nodes.forEach(n => {
    n.x = n.x * scale + offsetX;
    n.y = n.y * scale + offsetY;
    n.w = n.w * scale;
    n.h = n.h * scale;
  });

  return nodes;
}

function computeConnections(nodes) {
  const conns = [];
  for (let i = 0; i < nodes.length; i++) {
    let nearest = null;
    let nearestDist = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j || nodes[j].type !== nodes[i].type) continue;
      if (Math.abs(nodes[j].id - nodes[i].id) > 10) continue;
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist && dist < 110) {
        nearestDist = dist;
        nearest = j;
      }
    }
    if (nearest !== null) {
      const aRatio = nodes[i].completedCount / nodes[i].taskCount;
      const bRatio = nodes[nearest].completedCount / nodes[nearest].taskCount;
      conns.push({
        x1: nodes[i].x, y1: nodes[i].y,
        x2: nodes[nearest].x, y2: nodes[nearest].y,
        type: nodes[i].type,
        strength: (aRatio + bRatio) / 2,
      });
    }
  }
  return conns;
}

function MosaicCanvas({ nodes, connections, selectedId, onSelect }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const timeRef = useRef(0);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 400, h: 420 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const w = Math.min(entries[0].contentRect.width, 480);
      setDims({ w, h: w * 1.05 });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = dims;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);

    timeRef.current += 0.008;
    const t = timeRef.current;

    ctx.clearRect(0, 0, w, h);

    // Connections — simple subtle arcs
    connections.forEach((conn) => {
      const alpha = 0.03 + conn.strength * 0.07;
      const cfg = typeConfig[conn.type];
      ctx.beginPath();
      const mx = (conn.x1 + conn.x2) / 2 + Math.sin(conn.x1 * 0.1) * 8;
      const my = (conn.y1 + conn.y2) / 2 + Math.cos(conn.y1 * 0.1) * 8;
      ctx.moveTo(conn.x1, conn.y1);
      ctx.quadraticCurveTo(mx, my, conn.x2, conn.y2);
      ctx.strokeStyle = `rgba(${cfg.color}, ${alpha})`;
      ctx.lineWidth = 0.8 + conn.strength * 0.6;
      ctx.stroke();
    });

    // Tiles
    nodes.forEach((node) => {
      const cfg = typeConfig[node.type];
      const ratio = node.completedCount / node.taskCount;
      const complete = ratio === 1;
      const isSelected = node.id === selectedId;

      const x = node.x - node.w / 2;
      const y = node.y - node.h / 2;
      const borderRadius = Math.min(node.w, node.h) * 0.22;

      // Glow behind completed tiles — like light through stained glass
      if (complete) {
        const glowAlpha = 0.08 + Math.sin(t * 0.8 + node.id * 0.5) * 0.025;
        const glowSpread = Math.max(node.w, node.h) * 0.6;
        ctx.shadowColor = `rgba(${cfg.bright}, ${glowAlpha * 3})`;
        ctx.shadowBlur = glowSpread;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw an invisible rect to cast the shadow
        ctx.fillStyle = `rgba(${cfg.bright}, ${glowAlpha})`;
        roundRect(ctx, x - 2, y - 2, node.w + 4, node.h + 4, borderRadius + 2);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }

      // The tile itself — flat fill
      const baseAlpha = 0.08 + ratio * 0.35;
      const fillAlpha = complete
        ? 0.45 + Math.sin(t * 0.8 + node.id * 0.5) * 0.04
        : baseAlpha;

      ctx.fillStyle = `rgba(${complete ? cfg.bright : cfg.color}, ${fillAlpha})`;
      roundRect(ctx, x, y, node.w, node.h, borderRadius);
      ctx.fill();

      // Subtle border
      const borderAlpha = complete ? 0.35 : 0.08 + ratio * 0.12;
      ctx.strokeStyle = `rgba(${cfg.color}, ${borderAlpha})`;
      ctx.lineWidth = isSelected ? 2 : 0.8;
      roundRect(ctx, x, y, node.w, node.h, borderRadius);
      ctx.stroke();

      // Selection indicator — dashed border
      if (isSelected) {
        ctx.strokeStyle = `rgba(${cfg.bright}, 0.6)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -t * 15;
        roundRect(ctx, x - 3, y - 3, node.w + 6, node.h + 6, borderRadius + 3);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Tiny completion dots at bottom of tile
      if (node.taskCount <= 6) {
        const dotSize = 2.5;
        const dotGap = 6;
        const totalDotsW = node.taskCount * dotGap - (dotGap - dotSize);
        const dotStartX = node.x - totalDotsW / 2;
        const dotY = y + node.h - 7;

        for (let d = 0; d < node.taskCount; d++) {
          const filled = d < node.completedCount;
          ctx.beginPath();
          ctx.arc(dotStartX + d * dotGap, dotY, dotSize, 0, Math.PI * 2);
          ctx.fillStyle = filled
            ? `rgba(${cfg.bright}, ${0.6 + (complete ? Math.sin(t + d) * 0.1 : 0)})`
            : `rgba(255, 255, 255, 0.08)`;
          ctx.fill();
        }
      }

      // Sparkle on fully complete tiles
      if (complete) {
        const sparkleAlpha = 0.3 + Math.sin(t * 1.5 + node.id * 2) * 0.2;
        ctx.fillStyle = `rgba(${cfg.bright}, ${sparkleAlpha})`;
        ctx.font = `${Math.min(node.w, node.h) * 0.28}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✦", node.x, node.y - node.h * 0.08);
      }
    });

    animRef.current = requestAnimationFrame(draw);
  }, [nodes, connections, selectedId, dims]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const handleClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let hit = null;
    // Check in reverse so top-rendered tiles get priority
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (mx >= n.x - n.w / 2 && mx <= n.x + n.w / 2 &&
          my >= n.y - n.h / 2 && my <= n.y + n.h / 2) {
        hit = n;
        break;
      }
    }
    onSelect(hit ? hit.id : null);
  };

  return (
    <div ref={containerRef} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ cursor: "pointer", borderRadius: "16px" }}
      />
    </div>
  );
}

// Canvas rounded rect helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function DetailPanel({ dump, onClose }) {
  if (!dump) return null;
  const cfg = typeConfig[dump.type];
  const ratio = dump.completedCount / dump.taskCount;
  const complete = ratio === 1;

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      zIndex: 100,
      padding: "0 16px 28px",
      animation: "slideUp 0.2s ease-out",
    }}>
      <div style={{
        maxWidth: "440px",
        margin: "0 auto",
        background: "rgba(16, 16, 26, 0.97)",
        border: `1px solid rgba(${cfg.color}, 0.2)`,
        borderRadius: "20px",
        padding: "20px 22px",
        backdropFilter: "blur(20px)",
        boxShadow: `0 -4px 40px rgba(0,0,0,0.5)`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "15px" }}>{cfg.icon}</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: `rgb(${cfg.color})`, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {cfg.label} Dump
            </span>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
              · {dump.daysAgo === 0 ? "today" : dump.daysAgo === 1 ? "yesterday" : `${dump.daysAgo}d ago`}
            </span>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.5)",
            cursor: "pointer", fontSize: "14px", width: "28px", height: "28px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.65)", lineHeight: 1.55, margin: "0 0 16px", fontStyle: "italic" }}>
          "{dump.title}"
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1, height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${ratio * 100}%`,
              borderRadius: "3px",
              background: complete
                ? `linear-gradient(90deg, rgb(${cfg.color}), rgb(${cfg.bright}))`
                : `rgba(${cfg.color}, 0.7)`,
              boxShadow: complete ? `0 0 10px rgba(${cfg.color}, 0.4)` : "none",
              transition: "width 0.4s ease",
            }} />
          </div>
          <span style={{
            fontSize: "13px", fontWeight: 600,
            color: complete ? `rgb(${cfg.bright})` : "rgba(255,255,255,0.5)",
            minWidth: "36px", textAlign: "right",
          }}>
            {dump.completedCount}/{dump.taskCount}
          </span>
        </div>

        {complete && (
          <div style={{ marginTop: "10px", fontSize: "12px", color: `rgba(${cfg.bright}, 0.7)`, textAlign: "center" }}>
            ✦ All tasks completed
          </div>
        )}
      </div>
    </div>
  );
}

function InsightCard({ data }) {
  const insight = useMemo(() => {
    const completedTasks = data.reduce((s, d) => s + d.completedCount, 0);
    const textDumps = data.filter((d) => d.type === "text").length;
    const voiceDumps = data.filter((d) => d.type === "voice").length;
    const fullyComplete = data.filter((d) => d.completedCount === d.taskCount).length;

    const insights = [
      { emoji: "🔥", text: `${completedTasks} tasks done from ${data.length} brain dumps. Your chaos is productive.` },
      {
        emoji: "💡",
        text: textDumps > voiceDumps
          ? `You think in text — ${textDumps} typed dumps vs ${voiceDumps} voice. Your fingers are fast.`
          : `You think out loud — ${voiceDumps} voice dumps vs ${textDumps} typed. Voice catches what typing misses.`,
      },
      { emoji: "✨", text: `${fullyComplete} brain dumps fully resolved. Every task, done.` },
    ];
    return insights[Math.floor(Math.random() * insights.length)];
  }, [data]);

  return (
    <div style={{
      padding: "14px 18px",
      background: "rgba(255,255,255,0.02)",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.04)",
      marginBottom: "16px",
      display: "flex", alignItems: "flex-start", gap: "10px",
    }}>
      <span style={{ fontSize: "15px", flexShrink: 0, marginTop: "1px" }}>{insight.emoji}</span>
      <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
        {insight.text}
      </p>
    </div>
  );
}

export default function ChaosMosaicV3() {
  const [data] = useState(generateSampleData);
  const [selectedId, setSelectedId] = useState(null);
  const canvasWidth = Math.min(440, typeof window !== "undefined" ? window.innerWidth - 40 : 400);

  const nodes = useMemo(() => computeLayout(data, canvasWidth, canvasWidth * 1.05), [data, canvasWidth]);
  const connections = useMemo(() => computeConnections(nodes), [nodes]);
  const selectedDump = data.find((d) => d.id === selectedId) || null;

  const stats = useMemo(() => {
    const total = data.length;
    const tasks = data.reduce((s, d) => s + d.completedCount, 0);
    const byType = { text: 0, voice: 0, photo: 0 };
    data.forEach((d) => byType[d.type]++);
    return { total, tasks, byType };
  }, [data]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "rgb(10, 10, 18)",
      color: "white",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "28px 20px 100px",
      maxWidth: "480px",
      margin: "0 auto",
    }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 4px", color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
          Your Chaos Mosaic
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Every tile is a brain dump. Brighter means closer to done. Tap to explore.
        </p>
      </div>

      <InsightCard data={data} />

      <div style={{ display: "flex", gap: "20px", marginBottom: "18px", paddingLeft: "4px" }}>
        <div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{stats.total}</div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dumps</div>
        </div>
        <div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{stats.tasks}</div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tasks Done</div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginLeft: "auto" }}>
          {Object.entries(stats.byType).map(([type, count]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{
                width: "10px", height: "10px", borderRadius: "3px",
                background: `rgba(${typeConfig[type].color}, 0.35)`,
                border: `1px solid rgba(${typeConfig[type].color}, 0.15)`,
              }} />
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <MosaicCanvas
        nodes={nodes}
        connections={connections}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "14px" }}>
        {Object.entries(typeConfig).map(([type, cfg]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "12px", height: "9px", borderRadius: "3px",
              background: `rgba(${cfg.color}, 0.35)`,
              border: `1px solid rgba(${cfg.color}, 0.2)`,
            }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Dim to bright hint */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", marginTop: "8px" }}>
        <div style={{ width: "12px", height: "9px", borderRadius: "3px", background: "rgba(150,180,220,0.08)", border: "1px solid rgba(150,180,220,0.05)" }} />
        <div style={{ width: "24px", height: "1px", background: "linear-gradient(90deg, rgba(150,180,220,0.06), rgba(150,180,220,0.3))" }} />
        <div style={{
          width: "12px", height: "9px", borderRadius: "3px",
          background: "rgba(150,180,220,0.4)",
          border: "1px solid rgba(150,180,220,0.25)",
          boxShadow: "0 0 6px rgba(150,180,220,0.2)",
        }} />
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", marginLeft: "3px" }}>completion</span>
      </div>

      <DetailPanel dump={selectedDump} onClose={() => setSelectedId(null)} />
    </div>
  );
}