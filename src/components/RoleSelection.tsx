import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { ShoppingBag, Store } from 'lucide-react';

export const RoleSelection = () => {
  const { setRole, setCurrentView } = useAppStore();

  const handleSelect = (role: 'buyer' | 'seller') => {
    setRole(role);
    setCurrentView(role === 'buyer' ? 'marketplace' : 'dashboard');
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center p-6 bg-avalanche-dark relative">
      <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[40%] bg-avalanche-red/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-bold mb-12 text-center"
      >
        Choose Your Role
      </motion.h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full relative z-10">
        <RoleCard
          title="I want to Buy"
          icon={<ShoppingBag className="w-16 h-16 mb-4 text-avalanche-red" />}
          desc="Browse listings, make offers, and secure deals."
          onClick={() => handleSelect('buyer')}
          delay={0.1}
        />
        <RoleCard
          title="I want to Sell"
          icon={<Store className="w-16 h-16 mb-4 text-avalanche-red" />}
          desc="List items, negotiate prices, and get paid in AVAX."
          onClick={() => handleSelect('seller')}
          delay={0.2}
        />
      </div>
    </div>
  );
};

const RoleCard = ({ title, icon, desc, onClick, delay }: any) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay }}
    whileHover={{ scale: 1.03, borderColor: '#E84142' }}
    onClick={onClick}
    className="bg-avalanche-dark-light border border-white/10 p-10 rounded-3xl flex flex-col items-center text-center group hover:shadow-2xl hover:shadow-avalanche-red/10 transition-all"
  >
    <div className="bg-white/5 p-6 rounded-full mb-6 group-hover:bg-avalanche-red/20 transition-colors">
      {icon}
    </div>
    <h3 className="text-2xl font-bold mb-3">{title}</h3>
    <p className="text-gray-400">{desc}</p>
  </motion.button>
);
