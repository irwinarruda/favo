import { Comb } from '@/modules/comb/screens/Comb';

export function App({ onQuit }: { onQuit(): void }) {
  return <Comb onQuit={onQuit} />;
}
