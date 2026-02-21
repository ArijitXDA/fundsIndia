'use client';

// components/AgentModal.tsx
// Draggable, resizable floating modal wrapper for the FundsAgent popout mode.
// Wraps any children — the multi-engine layout is composed inside AgentWidget.

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Minimize2 } from 'lucide-react';

interface AgentModalProps {
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const MIN_W = 420;
const MIN_H = 500;
const MAX_W_VW = 0.95;
const MAX_H_VH = 0.95;
const DEFAULT_W = 900;
const DEFAULT_H = 680;

export default function AgentModal({ onClose, title = 'FundsAgent', children }: AgentModalProps) {
  // Position (top-left corner of modal, in px)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: Math.max(0, (window.innerWidth  - DEFAULT_W) / 2),
    y: Math.max(0, (window.innerHeight - DEFAULT_H) / 2),
  }));

  // Size (in px)
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  // Drag state refs (avoid re-renders during drag)
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Resize state refs
  const resizing = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, w: DEFAULT_W, h: DEFAULT_H });

  // ── Drag ─────────────────────────────────────────────────────────────────────

  const onDragMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // don't drag when clicking buttons
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  }, [pos]);

  // ── Resize ────────────────────────────────────────────────────────────────────

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
  }, [size]);

  // ── Global mouse move / up ─────────────────────────────────────────────────

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        const maxX = window.innerWidth  - size.w;
        const maxY = window.innerHeight - size.h;
        setPos({
          x: Math.max(0, Math.min(dragStart.current.px + dx, maxX)),
          y: Math.max(0, Math.min(dragStart.current.py + dy, maxY)),
        });
      }

      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.mx;
        const dy = e.clientY - resizeStart.current.my;
        const maxW = Math.floor(window.innerWidth  * MAX_W_VW);
        const maxH = Math.floor(window.innerHeight * MAX_H_VH);
        setSize({
          w: Math.max(MIN_W, Math.min(resizeStart.current.w + dx, maxW)),
          h: Math.max(MIN_H, Math.min(resizeStart.current.h + dy, maxH)),
        });
      }
    };

    const handleMouseUp = () => {
      dragging.current = false;
      resizing.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup',   handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup',   handleMouseUp);
    };
  }, [size.w, size.h]);

  // ── Keep modal on-screen if window is resized ─────────────────────────────

  useEffect(() => {
    const onResize = () => {
      const maxX = window.innerWidth  - size.w;
      const maxY = window.innerHeight - size.h;
      setPos(p => ({
        x: Math.max(0, Math.min(p.x, maxX)),
        y: Math.max(0, Math.min(p.y, maxY)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [size.w, size.h]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    // Backdrop — semi-transparent click-through overlay (modal sits on top, backdrop captures clicks)
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      aria-modal="true"
      role="dialog"
    >
      {/* The modal box itself — pointer-events: auto so user can interact */}
      <div
        className="absolute flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden pointer-events-auto select-none"
        style={{
          left:   pos.x,
          top:    pos.y,
          width:  size.w,
          height: size.h,
          minWidth:  MIN_W,
          minHeight: MIN_H,
        }}
      >
        {/* ── Drag handle header ──────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-indigo-700 text-white shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onDragMouseDown}
        >
          <span className="text-sm font-semibold tracking-wide">{title}</span>

          <div className="flex items-center space-x-1" onMouseDown={e => e.stopPropagation()}>
            {/* Minimise → close popout, return to bubble */}
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              title="Return to bubble"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Content area (children) ────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col select-text">
          {children}
        </div>

        {/* ── Resize handle (bottom-right corner) ───────────────────────────── */}
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10"
          onMouseDown={onResizeMouseDown}
          title="Drag to resize"
          style={{ touchAction: 'none' }}
        >
          {/* Visual grip dots */}
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-gray-400 absolute bottom-1 right-1">
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="8"  cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="8"  r="1.5" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
}
