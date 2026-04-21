import { useState, useEffect, useCallback, useRef } from 'react';
import content from '../content.json';

const { tutorial: T } = content;

const TOUR_STEPS = [
  { target: 'pair-selector',  position: 'bottom' },
  { target: 'interval',       position: 'bottom' },
  { target: 'chart',          position: 'top'    },
  { target: 'select-tool',    position: 'top'    },
  { target: 'checklist',      position: 'right'  },
  { target: 'setup-card',     position: 'bottom' },
  { target: 'journal-tab',    position: 'bottom' },
];

const STORAGE_KEY = 'graewatch_tutorial_seen';

/**
 * Spotlight tutorial overlay. Highlights UI elements one at a time with
 * a dark backdrop cutout and a tooltip bubble.
 *
 * Props:
 *   active   – boolean, whether the overlay is mounted
 *   onClose  – callback to dismiss the tutorial
 */
function TutorialOverlay({ active, onClose }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);

  // Locate the target element for the current step and measure its bounds.
  const measure = useCallback(() => {
    if (!active) return;
    const { target } = TOUR_STEPS[step];
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setRect(null);
    }
  }, [step, active]);

  // Lock ALL scrolling while the tutorial is open so the spotlight never drifts.
  // Must target both <html> and <body> — CSS class alone doesn't stop the root.
  useEffect(() => {
    if (active) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [active]);

  // Measure on mount/step change and on window resize.
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Re-measure after a short delay to let layout settle (e.g. after step change).
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(measure, 120);
    return () => clearTimeout(t);
  }, [active, step, measure]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    function onKey(e) {
      if (e.key === 'Escape') { handleSkip(); return; }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { handleNext(); return; }
      if (e.key === 'ArrowLeft') { handleBack(); return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function handleNext() {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSkip();
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function handleSkip() {
    localStorage.setItem(STORAGE_KEY, 'true');
    setStep(0);
    onClose();
  }

  if (!active) return null;

  const currentStep = T.steps[step];
  const { position } = TOUR_STEPS[step];
  const pad = 8; // padding around the spotlight cutout

  // Compute tooltip position relative to the spotlight rect.
  // All edges are clamped so the tooltip can never leave the viewport.
  function tooltipStyle() {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const tooltipWidth = 320;
    const tooltipHeight = 200; // conservative estimate
    const tooltipGap = 14;
    const margin = 12; // min distance from any viewport edge
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left, transform;

    if (position === 'bottom') {
      top = rect.top + rect.height + pad + tooltipGap;
      left = rect.left + rect.width / 2;
      transform = 'translateX(-50%)';
    } else if (position === 'top') {
      top = rect.top - pad - tooltipGap;
      left = rect.left + rect.width / 2;
      transform = 'translate(-50%, -100%)';
    } else if (position === 'right') {
      top = rect.top + rect.height / 2;
      left = rect.left + rect.width + pad + tooltipGap;
      transform = 'translateY(-50%)';
    } else {
      top = rect.top + rect.height / 2;
      left = rect.left - pad - tooltipGap;
      transform = 'translate(-100%, -50%)';
    }

    // Clamp horizontally
    const clampedLeft = Math.min(
      Math.max(left - tooltipWidth / 2, margin),
      vw - tooltipWidth - margin
    );
    if (clampedLeft !== left - tooltipWidth / 2) {
      left = clampedLeft;
      transform = transform
        .replace('translateX(-50%)', '')
        .replace('translate(-50%,', 'translate(0,')
        .replace('translate(-100%, -50%)', 'translateY(-50%)');
    }

    // Clamp vertically — if tooltip would go below viewport, flip it above the target
    if (position === 'bottom' && top + tooltipHeight > vh - margin) {
      top = rect.top - pad - tooltipGap - tooltipHeight;
    }
    // If tooltip would go above viewport, flip below
    if (position === 'top' && top - tooltipHeight < margin) {
      top = rect.top + rect.height + pad + tooltipGap;
    }
    // Final vertical clamp: never let it escape the screen edges
    top = Math.min(Math.max(top, margin), vh - tooltipHeight - margin);

    return { top, left, transform };
  }

  // SVG mask: full-screen dark overlay with a rectangular cutout for the spotlight
  function renderMask() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (!rect) {
      return (
        <div className="tutorial-overlay__mask" />
      );
    }

    const cx = rect.left - pad;
    const cy = rect.top - pad;
    const cw = rect.width + pad * 2;
    const ch = rect.height + pad * 2;
    const cr = 10; // border radius

    return (
      <svg className="tutorial-overlay__mask" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect x="0" y="0" width={w} height={h} fill="white" />
            <rect x={cx} y={cy} width={cw} height={ch} rx={cr} ry={cr} fill="black" />
          </mask>
        </defs>
        <rect
          x="0" y="0" width={w} height={h}
          fill="rgba(0,0,0,0.6)"
          mask="url(#tutorial-spotlight-mask)"
        />
        {/* Glow ring around the cutout */}
        <rect
          x={cx} y={cy} width={cw} height={ch}
          rx={cr} ry={cr}
          fill="none"
          stroke="var(--palette-peach)"
          strokeWidth="2"
          opacity="0.7"
        />
      </svg>
    );
  }

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label="Tutorial">
      {renderMask()}

      <div
        className={`tutorial-tooltip tutorial-tooltip--${position}`}
        style={tooltipStyle()}
        ref={tooltipRef}
      >
        <div className="tutorial-tooltip__header">
          <span className="tutorial-tooltip__counter">
            {T.stepLabel} {step + 1} {T.ofLabel} {TOUR_STEPS.length}
          </span>
        </div>

        <h3 className="tutorial-tooltip__title">{currentStep.title}</h3>
        <p className="tutorial-tooltip__body">{currentStep.body}</p>

        <div className="tutorial-tooltip__nav">
          {step > 0 && (
            <button className="tutorial-tooltip__btn tutorial-tooltip__btn--back" onClick={handleBack}>
              {T.backLabel}
            </button>
          )}
          <button className="tutorial-tooltip__btn tutorial-tooltip__btn--skip" onClick={handleSkip}>
            {T.skipLabel}
          </button>
          <button className="tutorial-tooltip__btn tutorial-tooltip__btn--next" onClick={handleNext}>
            {step < TOUR_STEPS.length - 1 ? T.nextLabel : T.finishLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { STORAGE_KEY };
export default TutorialOverlay;
