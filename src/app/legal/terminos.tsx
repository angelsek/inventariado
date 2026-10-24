import { PantallaLegal } from '@/features/legal/PantallaLegal';
import { TERMINOS } from '@/legal/textos';

export default function TerminosScreen() {
  return <PantallaLegal texto={TERMINOS} />;
}
