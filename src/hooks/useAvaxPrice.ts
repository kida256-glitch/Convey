import { useState, useEffect } from 'react';

export const useAvaxPrice = () => {
  const [price, setPrice] = useState<number>(25.50);

  useEffect(() => {
    // Simulate live price updates
    const interval = setInterval(() => {
      setPrice(prev => prev + (Math.random() - 0.5) * 0.1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return price;
};
