import { createBrowserRouter } from 'react-router-dom';
import { RouteFallback } from './ui/RouteFallback';

export const router = createBrowserRouter([
  {
    path: '/',
    HydrateFallback: RouteFallback,
    lazy: async () => ({ Component: (await import('./signsteps/SignStepsApp')).default }),
  },
]);
