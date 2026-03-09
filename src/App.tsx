/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WagmiProvider, useAccount } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmi';
import { LandingPage } from './components/LandingPage';
import { RoleSelection } from './components/RoleSelection';
import { SellerDashboard } from './components/SellerDashboard';
import { BuyerMarketplace } from './components/BuyerMarketplace';
import { Navbar } from './components/Navbar';
import { useAppStore } from './store/useAppStore';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

function AppContent() {
  const { currentView, setRole, setCurrentView } = useAppStore();
  const { address } = useAccount();
  const previousAddressRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const previous = previousAddressRef.current;
    if (previous && address && previous.toLowerCase() !== address.toLowerCase()) {
      // Wallet changed: force role re-selection to avoid wallet-scoped empty views.
      setRole(null);
      setCurrentView('role-selection');
    }
    previousAddressRef.current = address;
  }, [address, setRole, setCurrentView]);

  return (
    <div className="min-h-screen bg-avalanche-dark text-white font-sans selection:bg-avalanche-red selection:text-white">
      <Navbar />
      <main>
        {currentView === 'landing' && <LandingPage />}
        {currentView === 'role-selection' && <RoleSelection />}
        {currentView === 'dashboard' && <SellerDashboard />}
        {currentView === 'marketplace' && <BuyerMarketplace />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#E84142',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
          })}
        >
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
