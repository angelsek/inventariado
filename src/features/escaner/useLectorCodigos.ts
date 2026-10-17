/**
 * Lectura con pistola USB. En el teléfono no hace nada: ahí se escanea con la cámara
 * (components/Escaner.tsx). En la web (PC), ver useLectorCodigos.web.ts.
 */
export function useLectorCodigos(_alCodigo: (codigo: string) => void, _activo = true) {}
