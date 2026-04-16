import { useState, useEffect } from 'react';

export default function useStdoutDimensions(): [number, number] {
  const [dimensions, setDimensions] = useState<[number, number]>([
    process.stdout.columns || 80,
    process.stdout.rows || 24,
  ]);

  useEffect(() => {
    const handleResize = () => {
      setDimensions([
        process.stdout.columns || 80,
        process.stdout.rows || 24,
      ]);
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return dimensions;
}
