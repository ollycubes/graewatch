import { useEffect, useState } from 'react';
import content from '../content.json';

const { intro } = content;

// Each phase has an id and a timestamp (ms from mount) at which it becomes active.
// The intro runs for 10 seconds total. Phases drive which scene is visible
// and when the title/tagline appear — all controlled by CSS transitions, not JS animation.
const PHASES = [
  { id: 'black', at: 0 }, // pure black screen on load
  { id: 'scene1', at: 500 }, // radar rings fade in
  { id: 'scene2', at: 2400 }, // candlesticks fade in (scene1 fades out via CSS)
  { id: 'scene3', at: 4000 }, // grid + breakout line fades in
  { id: 'title', at: 5600 }, // GRAEWATCH title fades up
  { id: 'tagline', at: 7000 }, // divider + tagline appear below the title
  { id: 'fadeout', at: 8400 }, // entire intro fades to black
];

// onFinish — callback fired when the intro ends naturally or the user skips it
function IntroScreen({ onFinish }) {
  const [phase, setPhase] = useState('black');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Schedule each phase transition. All timers are stored so they can be
    // cleared if the user skips early (via click or keyboard).
    const timers = PHASES.map(({ id, at }) => setTimeout(() => setPhase(id), at));

    // After 10 seconds the intro unmounts itself and hands control to the dashboard.
    const endTimer = setTimeout(() => {
      setDone(true);
      onFinish();
    }, 10000);

    // Cleanup: cancel all pending timers if the component unmounts before they fire
    // (e.g. user clicks skip before the intro finishes naturally).
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(endTimer);
    };
  }, [onFinish]);

  // Once the intro is truly done, render nothing — the dashboard takes over.
  if (done) return null;

  // Helper: true only when phase exactly matches the current phase.
  // Used to activate a specific scene's CSS class (which triggers its animations).
  const active = (id) => phase === id;

  // Helper: true when the current phase is equal to or later than the given id.
  // Used to keep the title/tagline mounted once they've appeared (they stay visible
  // through 'fadeout' so they're included in the final fade-to-black).
  const pastOrAt = (id) => {
    const order = ['black', 'scene1', 'scene2', 'scene3', 'title', 'tagline', 'fadeout'];
    return order.indexOf(phase) >= order.indexOf(id);
  };

  return (
    // The root div covers the full viewport (position: fixed in CSS).
    // Clicking or pressing Enter/Space anywhere calls onFinish immediately (skip).
    // intro--fadeout triggers the CSS fade-out animation in the final phase.
    <div
      className={['intro', phase === 'fadeout' ? 'intro--fadeout' : ''].join(' ')}
      onClick={onFinish}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onFinish();
      }}
      aria-label="Skip intro"
    >
      {/*
        All three scenes are always in the DOM, stacked on top of each other.
        Each is opacity: 0 by default. Adding intro__scene--active transitions
        it to opacity: 1 over 0.9s (defined in CSS), creating a smooth cross-fade.
        The SVG elements inside each scene have their own staggered CSS animations
        that only fire when the parent has intro__scene--active.
      */}

      {/* ── Scene 1 — radar targeting reticle ──
          Three concentric rings expand outward from a central glowing dot,
          like a system powering up and locking onto a target.
          Two dashed lock-lines and their endpoint circles appear last,
          suggesting the system has acquired its first data point. */}
      <div className={`intro__scene ${active('scene1') ? 'intro__scene--active' : ''}`}>
        <svg viewBox="0 0 800 400" className="intro__scene-svg" aria-hidden="true">
          {/* Rings scale up from the centre with staggered delays (CSS: ring--1/2/3) */}
          <circle
            cx="400"
            cy="200"
            r="30"
            fill="none"
            stroke="#967e76"
            strokeWidth="1"
            className="intro__ring intro__ring--1"
          />
          <circle
            cx="400"
            cy="200"
            r="80"
            fill="none"
            stroke="#967e76"
            strokeWidth="1"
            className="intro__ring intro__ring--2"
          />
          <circle
            cx="400"
            cy="200"
            r="140"
            fill="none"
            stroke="#967e76"
            strokeWidth="1"
            className="intro__ring intro__ring--3"
          />

          {/* Bright centre point — the focal anchor of the reticle */}
          <circle cx="400" cy="200" r="5" fill="#eee3cb" className="intro__ring-core" />

          {/* Faint crosshair lines behind the rings */}
          <line x1="400" y1="0" x2="400" y2="400" stroke="#2a2018" strokeWidth="1" />
          <line x1="0" y1="200" x2="800" y2="200" stroke="#2a2018" strokeWidth="1" />

          {/* Dashed lines that converge on the centre — lock-on indicator */}
          <line
            x1="260"
            y1="60"
            x2="400"
            y2="200"
            stroke="#d7c0ae"
            strokeWidth="1"
            strokeDasharray="3 5"
            opacity="0.5"
            className="intro__lock-line intro__lock-line--1"
          />
          <line
            x1="540"
            y1="60"
            x2="400"
            y2="200"
            stroke="#d7c0ae"
            strokeWidth="1"
            strokeDasharray="3 5"
            opacity="0.5"
            className="intro__lock-line intro__lock-line--2"
          />

          {/* Small hollow circles at the top of each lock-line — target markers */}
          <circle
            cx="260"
            cy="60"
            r="4"
            fill="none"
            stroke="#eee3cb"
            strokeWidth="1.5"
            opacity="0.7"
            className="intro__lock-dot"
          />
          <circle
            cx="540"
            cy="60"
            r="4"
            fill="none"
            stroke="#eee3cb"
            strokeWidth="1.5"
            opacity="0.7"
            className="intro__lock-dot"
          />
        </svg>
      </div>

      {/* ── Scene 2 — candlestick formation ──
          Three candles appear one by one, reading left to right:
          two bearish (dark bodies, price falling) followed by a large
          bullish engulfing candle (bright body) — a classic SMC reversal signal.
          Each candle fades up from slightly below via CSS (intro__candle--1/2/3). */}
      <div className={`intro__scene ${active('scene2') ? 'intro__scene--active' : ''}`}>
        <svg viewBox="0 0 800 400" className="intro__scene-svg" aria-hidden="true">
          {/* Candle 1 — bearish: dark fill, wick spanning y=90 to y=310 */}
          <g className="intro__candle intro__candle--1">
            <line x1="220" y1="90" x2="220" y2="310" stroke="#967e76" strokeWidth="1.5" />
            <rect
              x="193"
              y="130"
              width="54"
              height="140"
              fill="#18120e"
              stroke="#967e76"
              strokeWidth="1.5"
            />
          </g>

          {/* Candle 2 — bearish, smaller body: continuation of the downward move */}
          <g className="intro__candle intro__candle--2">
            <line x1="370" y1="145" x2="370" y2="300" stroke="#967e76" strokeWidth="1.5" />
            <rect
              x="343"
              y="165"
              width="54"
              height="100"
              fill="#18120e"
              stroke="#967e76"
              strokeWidth="1.5"
            />
          </g>

          {/* Candle 3 — bullish engulfing: tall bright body, larger than the two before it.
              The long wick (y=70 to y=315) signals a liquidity sweep before the reversal. */}
          <g className="intro__candle intro__candle--3">
            <line x1="520" y1="70" x2="520" y2="315" stroke="#eee3cb" strokeWidth="1.5" />
            <rect
              x="493"
              y="100"
              width="54"
              height="185"
              fill="#d7c0ae"
              stroke="#eee3cb"
              strokeWidth="1.5"
            />
          </g>
        </svg>
      </div>

      {/* ── Scene 3 — chart grid with breakout ──
          A dim price chart grid fades in, then a polyline draws itself
          from left to right showing price consolidating then breaking out sharply.
          A vertical dashed line marks the breakout candle (the BOS moment).
          The line-draw animation uses stroke-dashoffset in CSS. */}
      <div className={`intro__scene ${active('scene3') ? 'intro__scene--active' : ''}`}>
        <svg viewBox="0 0 800 400" className="intro__scene-svg" aria-hidden="true">
          {/* Horizontal grid lines — price levels */}
          {[80, 160, 240, 320].map((y) => (
            <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#2a2018" strokeWidth="1" />
          ))}

          {/* Vertical grid lines — time intervals */}
          {[100, 200, 300, 400, 500, 600, 700].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="400" stroke="#2a2018" strokeWidth="1" />
          ))}

          {/* Price line: flat consolidation, then a sharp breakout upward.
              stroke-dashoffset animation makes it appear to draw itself over ~1.2s. */}
          <polyline
            points="0,340 100,320 200,300 300,290 400,260 450,160 500,120 600,100 700,80 800,60"
            fill="none"
            stroke="#d7c0ae"
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="intro__breakout-line"
          />

          {/* Dashed vertical line marking x=450 — the BOS (break of structure) point */}
          <line
            x1="450"
            y1="0"
            x2="450"
            y2="400"
            stroke="#eee3cb"
            strokeWidth="1"
            strokeDasharray="4 6"
            opacity="0.5"
          />
        </svg>
      </div>

      {/* ── Title block ──
          Mounted once the phase reaches 'title' and stays mounted through 'fadeout'.
          CSS intro-title-in animates it upward from a slight offset with an opacity fade.
          The tagline is a nested conditional — it only renders at 'tagline' phase onward. */}
      {pastOrAt('title') && (
        <div className="intro__content">
          <h1 className="intro__title">{intro.title}</h1>
          {pastOrAt('tagline') && (
            <>
              <div className="intro__divider" />
              <p className="intro__tagline">{intro.tagline}</p>
            </>
          )}
        </div>
      )}

      {/* Persistent skip hint — fades in after 1.2s so it doesn't distract immediately */}
      <p className="intro__skip">{intro.skipHint}</p>
    </div>
  );
}

export default IntroScreen;
