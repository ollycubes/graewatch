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

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // Re-measure after a short delay to let layout settle (e.g. after intro exit)
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

  // Compute tooltip position relative to the spotlight rect
  function tooltipStyle() {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const style = {};
    const tooltipWidth = 320;
    const tooltipGap = 14;

    if (position === 'bottom') {
      style.top = rect.top + rect.height + pad + tooltipGap;
      style.left = rect.left + rect.width / 2;
      style.transform = 'translateX(-50%)';
    } else if (position === 'top') {
      style.top = rect.top - pad - tooltipGap;
      style.left = rect.left + rect.width / 2;
      style.transform = 'translate(-50%, -100%)';
    } else if (position === 'right') {
      style.top = rect.top + rect.height / 2;
      style.left = rect.left + rect.width + pad + tooltipGap;
      style.transform = 'translateY(-50%)';
    } else {
      style.top = rect.top + rect.height / 2;
      style.left = rect.left - pad - tooltipGap;
      style.transform = 'translate(-100%, -50%)';
    }

    // Clamp to viewport
    if (style.left - tooltipWidth / 2 < 16) {
      style.left = 16;
      style.transform = style.transform.replace('translateX(-50%)', '').replace('translate(-50%,', 'translate(0,');
    }

    return style;
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
