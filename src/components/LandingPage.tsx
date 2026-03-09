import React from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { ArrowRight, ShieldCheck, Zap, Lock } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export const LandingPage = () => {
  const { setCurrentView } = useAppStore();
  const { isConnected } = useAccount();

  React.useEffect(() => {
    if (isConnected) {
      setCurrentView('role-selection');
    }
  }, [isConnected, setCurrentView]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-avalanche-red/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="z-10 text-center max-w-4xl px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-avalanche-red rounded-xl flex items-center justify-center shadow-lg shadow-avalanche-red/30">
              <span className="text-3xl md:text-4xl font-bold text-white">C</span>
            </div>
          </div>
          <h1 className="text-5xl md:text-8xl font-bold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            CONVEY
          </h1>
          <p className="text-lg md:text-2xl text-gray-400 mb-10 max-w-2xl mx-auto font-light">
            Negotiate. Secure. Transact. <br />
            The decentralized bargaining marketplace on Avalanche.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex justify-center"
        >
          <div className="p-1 rounded-full bg-gradient-to-r from-avalanche-red to-purple-600">
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
              }) => {
                const ready = mounted && authenticationStatus !== 'loading';
                const connected =
                  ready &&
                  account &&
                  chain &&
                  (!authenticationStatus ||
                    authenticationStatus === 'authenticated');

                return (
                  <div
                    {...(!ready && {
                      'aria-hidden': true,
                      'style': {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <div className="flex flex-col items-center gap-3">
                            <button onClick={openConnectModal} className="bg-avalanche-dark px-8 py-4 rounded-full text-xl font-semibold hover:bg-opacity-90 transition-all flex items-center gap-2">
                              Launch App <ArrowRight className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setCurrentView('role-selection')}
                              className="text-sm text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
                            >
                              Browse without wallet
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button onClick={() => setCurrentView('role-selection')} className="bg-avalanche-dark px-8 py-4 rounded-full text-xl font-semibold hover:bg-opacity-90 transition-all flex items-center gap-2">
                          Enter Marketplace <ArrowRight className="w-5 h-5" />
                        </button>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20"
        >
          <FeatureCard icon={<ShieldCheck className="w-8 h-8 text-avalanche-red" />} title="Escrow Secured" desc="Funds are locked in smart contracts until both parties agree." />
          <FeatureCard icon={<Zap className="w-8 h-8 text-avalanche-red" />} title="Instant Bargaining" desc="Real-time negotiation with on-chain settlement." />
          <FeatureCard icon={<Lock className="w-8 h-8 text-avalanche-red" />} title="Trustless" desc="No middlemen. Just code and Avalanche security." />
        </motion.div>
      </div>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl hover:bg-white/10 transition-colors text-left">
    <div className="mb-4">{icon}</div>
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-gray-400 text-sm">{desc}</p>
  </div>
);
