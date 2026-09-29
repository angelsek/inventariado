import { render, screen } from '@testing-library/react-native';

import { PantallaEnConstruccion } from '../PantallaEnConstruccion';

it('muestra el título y la descripción', async () => {
  await render(
    <PantallaEnConstruccion icono="cart-outline" titulo="Vender" descripcion="Próximamente" />,
  );

  expect(screen.getByText('Vender')).toBeTruthy();
  expect(screen.getByText('Próximamente')).toBeTruthy();
});
