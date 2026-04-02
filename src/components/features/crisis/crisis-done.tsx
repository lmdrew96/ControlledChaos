"use client";

import { useEffect } from "react";
import { Trophy } from "lucide-react";
import { fireTaskConfetti } from "@/lib/utils/confetti";

interface Props {
  taskName: string;
}

export function CrisisDone({ taskName }: Props) {
  useEffect(() => {
    // First detonation — immediate
    fireTaskConfetti();
    // Second wave for extra drama
    const t = setTimeout(() => fireTaskConfetti(), 850);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-card px-6 py-12 text-center">
      {/* ── Laser beams ── pure CSS, zero extra deps */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Horizontal */}
        <div className="laser laser-h" style={{ top: "18%",  animationDelay: "0ms"   }} />
        <div className="laser laser-h" style={{ top: "50%",  animationDelay: "130ms" }} />
        <div className="laser laser-h" style={{ top: "80%",  animationDelay: "65ms"  }} />
        {/* Vertical */}
        <div className="laser laser-v" style={{ left: "20%", animationDelay: "40ms"  }} />
        <div className="laser laser-v" style={{ left: "50%", animationDelay: "190ms" }} />
        <div className="laser laser-v" style={{ left: "80%", animationDelay: "95ms"  }} />
        {/* Diagonals */}
        <div className="laser laser-d1" style={{ animationDelay: "20ms"  }} />
        <div className="laser laser-d2" style={{ animationDelay: "160ms" }} />
      </div>

      <style>{`
        .laser {
          position: absolute;
          opacity: 0;
          animation: laser-h-flash 0.55s cubic-bezier(0.4,0,0.2,1) forwards;
        }
        /* Horizontal beams */
        .laser-h {
          left: -5%; right: -5%; height: 2px;
          background: linear-gradient(90deg, transparent 0%, #c77dff 30%, #4d96ff 60%, #6bcb77 80%, transparent 100%);
          box-shadow: 0 0 10px 3px #c77dff60;
          border-radius: 2px;
        }
        @keyframes laser-h-flash {
          0%   { opacity: 0; transform: scaleX(0); transform-origin: left; }
          25%  { opacity: 1; }
          75%  { opacity: 0.7; }
          100% { opacity: 0; transform: scaleX(1); }
        }
        /* Vertical beams */
        .laser-v {
          top: -5%; bottom: -5%; width: 2px;
          background: linear-gradient(180deg, transparent 0%, #ff6b6b 30%, #ffd93d 60%, #ff9f43 80%, transparent 100%);
          box-shadow: 0 0 10px 3px #ff6b6b60;
          border-radius: 2px;
          animation-name: laser-v-flash;
        }
        @keyframes laser-v-flash {
          0%   { opacity: 0; transform: scaleY(0); transform-origin: top; }
          25%  { opacity: 1; }
          75%  { opacity: 0.7; }
          100% { opacity: 0; transform: scaleY(1); }
        }
        /* Diagonal beams */
        .laser-d1, .laser-d2 {
          top: 50%; left: -20%; right: -20%; height: 2px;
          border-radius: 2px;
          animation-name: laser-d-flash;
        }
        .laser-d1 {
          background: linear-gradient(90deg, transparent, #4d96ff, #a29bfe, transparent);
          box-shadow: 0 0 10px 3px #4d96ff50;
          transform: rotate(25deg);
          transform-origin: center;
        }
        .laser-d2 {
          background: linear-gradient(90deg, transparent, #ffd93d, #fd79a8, transparent);
          box-shadow: 0 0 10px 3px #fd79a850;
          transform: rotate(-25deg);
          transform-origin: center;
        }
        @keyframes laser-d-flash {
          0%   { opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 0.6; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Content */}
      <div className="relative z-10 space-y-5">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20">
          <Trophy className="h-10 w-10 text-primary" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Crisis Averted 🎉
          </p>
          <h1 className="mt-2 text-3xl font-bold">{taskName}</h1>
          <p className="mt-3 text-muted-foreground">
            You made it. That was a lot. You handled it.
          </p>
        </div>
      </div>
    </div>
  );
}
