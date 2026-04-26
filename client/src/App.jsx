import { useState, useCallback } from 'react';
import DashboardOverview from './components/DashboardOverview';
import IntroScreen from './components/IntroScreen';
import AuthScreen from './components/AuthScreen';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppContent() {
  const { user, loading } = useAuth();

  // Gates whether the dashboard is visible yet.
  // Starts false so the intro plays first; flips to true when the intro ends or is skipped.
  const [introComplete, setIntroComplete] = useState(false);

  // Stable callback passed down to IntroScreen.
  // useCallback prevents it from being recreated on every render,
  // which would reset the intro's useEffect timer unnecessarily.
  const handleIntroFinish = useCallback(() => {
    setIntroComplete(true);
  }, []);

  // While checking for an existing session, show nothing
  if (loading) return null;

  // Not authenticated — show login/register
  if (!user) return <AuthScreen />;

  return (
    <>
      {/* IntroScreen unmounts itself once introComplete is true, freeing all its timers and DOM nodes. */}
      {!introComplete && <IntroScreen onFinish={handleIntroFinish} />}

      {/* The dashboard is rendered in the background, chart and data begin loading during the intro too */}
      <main
        className={`dashboard ${introComplete ? 'dashboard--entering' : ''}`}
        style={introComplete ? undefined : { visibility: 'hidden' }}
      >
        <DashboardOverview />
      </main>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;