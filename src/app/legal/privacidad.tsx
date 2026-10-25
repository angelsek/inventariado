import { PantallaLegal } from '@/features/legal/PantallaLegal';
import { PRIVACIDAD } from '@/legal/textos';

export default function PrivacidadScreen() {
  return <PantallaLegal texto={PRIVACIDAD} />;
}
