import { useState, useCallback } from 'react';
import DashboardOverview from './components/DashboardOverview';
import IntroScreen from './components/IntroScreen';

function App() {
  const [introComplete, setIntroComplete] = useState(false);

  const handleIntroFinish = useCallback(() => {
    setIntroComplete(true);
  }, []);

  return (
    <>
      {!introComplete && <IntroScreen onFinish={handleIntroFinish} />}
      <main className={`dashboard ${introComplete ? 'dashboard--entering' : ''}`}
        style={introComplete ? undefined : { visibility: 'hidden' }}
      >
        <DashboardOverview />
      </main>
    </>
  );
}

export default App;
