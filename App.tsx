import React, { useState } from 'react';
import Layout from './components/Layout';
import Home from './components/Home';
import Simulator from './components/Simulator';
import Stats from './components/Stats';
import Resources from './components/Resources';
import { AppView } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);

  const renderView = () => {
    switch (currentView) {
      case AppView.HOME:
        return <Home onChangeView={setCurrentView} />;
      case AppView.SIMULATOR:
        return <Simulator />;
      case AppView.DATA:
        return <Stats />;
      case AppView.RESOURCES:
        return <Resources />;
      default:
        return <Home onChangeView={setCurrentView} />;
    }
  };

  return (
    <Layout currentView={currentView} onChangeView={setCurrentView}>
      {renderView()}
    </Layout>
  );
};

export default App;