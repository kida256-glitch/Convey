import React, { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAppStore } from '../store/useAppStore';
import { Menu, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME } from '../wagmi';
import { ensureActiveChainInWallet } from '../lib/walletNetwork';

export const Navbar = () => {
  const { currentView, setCurrentView, role, setRole } = useAppStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID;

  const handleFixAndSwitch = async () => {
    try {
      await ensureActiveChainInWallet();
    } catch {
      // Ignore wallet_addEthereumChain errors and still attempt chain switch.
    }
    switchChain({ chainId: ACTIVE_CHAIN_ID });
  };

  if (currentView === 'landing') return null;

  return (
    <nav className="border-b border-white/5 bg-avalanche-dark/80 backdrop-blur-md sticky top-0 z-40">
      {/* Wrong network banner */}
      {isWrongChain && (
        <div className="bg-yellow-500/20 border-b border-yellow-500/30 px-4 py-2 flex items-center justify-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-yellow-300">Convey runs on <strong>{ACTIVE_CHAIN_NAME}</strong>. Your wallet is on the wrong network.</span>
          <button
            onClick={handleFixAndSwitch}
            className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-3 py-1 rounded-lg text-xs transition-colors"
          >
            Fix & Switch to Fuji
          </button>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setCurrentView('landing')}
        >
          <div className="w-8 h-8 bg-avalanche-red rounded-lg flex items-center justify-center">
            <span className="font-bold text-white">C</span>
          </div>
          <span className="text-xl font-bold tracking-tight hidden sm:block">CONVEY</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Desktop Role Switcher */}
          {role && (
            <div className="hidden md:flex items-center gap-1 bg-white/5 px-1 py-1 rounded-full">
              <button
                onClick={() => { setRole('buyer'); setCurrentView('marketplace'); }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${role === 'buyer' ? 'bg-avalanche-red text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Buyer
              </button>
              <button
                onClick={() => { setRole('seller'); setCurrentView('dashboard'); }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${role === 'seller' ? 'bg-avalanche-red text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Seller
              </button>
            </div>
          )}

          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />

          {/* Mobile Menu Toggle */}
          {role && (
            <button
              className="md:hidden p-2 text-gray-400 hover:text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && role && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden bg-avalanche-dark border-b border-white/10 overflow-hidden"
          >
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  setRole('buyer');
                  setCurrentView('marketplace');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full p-3 rounded-xl text-left font-medium transition-all ${role === 'buyer' ? 'bg-avalanche-red text-white' : 'bg-white/5 text-gray-400'}`}
              >
                Switch to Buyer View
              </button>
              <button
                onClick={() => {
                  setRole('seller');
                  setCurrentView('dashboard');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full p-3 rounded-xl text-left font-medium transition-all ${role === 'seller' ? 'bg-avalanche-red text-white' : 'bg-white/5 text-gray-400'}`}
              >
                Switch to Seller Dashboard
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
