import { render, screen } from '@testing-library/react-native';

import { LogoStockeao, Logotipo } from '@/components/LogoStockeao';

describe('LogoStockeao', () => {
  it('dibuja tres cajas y tiene etiqueta accesible', () => {
    render(<LogoStockeao />);
    expect(screen.getByLabelText('Logo de Stockeao')).toBeTruthy();
    expect(screen.getAllByTestId('logo-caja')).toHaveLength(3);
  });

  it('escala el tamaño', () => {
    render(<LogoStockeao tamano={240} />);
    expect(screen.getByTestId('logo-stockeao').props.style).toMatchObject({
      width: 240,
      height: 240,
      borderRadius: 52,
    });
  });
});

describe('Logotipo', () => {
  it('muestra "stockeao" con etiqueta Stockeao', () => {
    render(<Logotipo />);
    const titulo = screen.getByLabelText('Stockeao');
    expect(titulo).toBeTruthy();
    expect(screen.getByText('ao')).toBeTruthy();
    expect(screen.getByText(/stocke/)).toBeTruthy();
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('cambia de color sobre fondo verde', () => {
    render(<Logotipo sobreVerde tamano={40} />);
    expect(screen.getByLabelText('Stockeao').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 40, color: '#FFFFFF' })]),
    );
  });
});
