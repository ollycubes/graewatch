import { useEffect, useState } from 'react';

function IntroScreen({ onFinish }) {
  const [phase, setPhase] = useState('black');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('line'), 400),
      setTimeout(() => setPhase('title'), 1600),
      setTimeout(() => setPhase('tagline'), 3400),
      setTimeout(() => setPhase('glow'), 5200),
      setTimeout(() => setPhase('fadeout'), 8000),
      setTimeout(() => onFinish(), 10000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onFinish]);

  return (
    <div
      className={`intro ${phase === 'fadeout' ? 'intro--fadeout' : ''}`}
      onClick={onFinish}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onFinish();
      }}
    >
      <div className="intro__vignette" />

      <div className="intro__line-sweep" />

      <div className="intro__content">
        <h1 className={`intro__title ${phase !== 'black' && phase !== 'line' ? 'intro__title--visible' : ''}`}>
          <span className="intro__char" style={{ animationDelay: '0s' }}>G</span>
          <span className="intro__char" style={{ animationDelay: '0.08s' }}>r</span>
          <span className="intro__char" style={{ animationDelay: '0.16s' }}>a</span>
          <span className="intro__char" style={{ animationDelay: '0.24s' }}>e</span>
          <span className="intro__char" style={{ animationDelay: '0.32s' }}>w</span>
          <span className="intro__char" style={{ animationDelay: '0.4s' }}>a</span>
          <span className="intro__char" style={{ animationDelay: '0.48s' }}>t</span>
          <span className="intro__char" style={{ animationDelay: '0.56s' }}>c</span>
          <span className="intro__char" style={{ animationDelay: '0.64s' }}>h</span>
        </h1>

        <div className={`intro__divider ${phase === 'tagline' || phase === 'glow' || phase === 'fadeout' ? 'intro__divider--visible' : ''}`} />

        <p className={`intro__tagline ${phase === 'tagline' || phase === 'glow' || phase === 'fadeout' ? 'intro__tagline--visible' : ''}`}>
          Read the structure. Trade the intent.
        </p>
      </div>

      <div className={`intro__glow ${phase === 'glow' || phase === 'fadeout' ? 'intro__glow--visible' : ''}`} />

      <div className="intro__particles">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="intro__particle"
            style={{
              left: `${8 + (i * 7.5)}%`,
              animationDelay: `${1.5 + i * 0.3}s`,
              animationDuration: `${3 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      <p className="intro__skip">Click anywhere to skip</p>
    </div>
  );
}

export default IntroScreen;
