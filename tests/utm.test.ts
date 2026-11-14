import { describe, expect, it } from 'vitest';
import { deUtm, paraUtm } from '../src/nucleo/utm.ts';

describe('UTM 24S', () => {
  it('ida e volta fica a menos de 1e-8 grau', () => {
    const [lon, lat] = deUtm(paraUtm(-39.5, -3.7));
    expect(Math.abs(lon - -39.5)).toBeLessThan(1e-8);
    expect(Math.abs(lat - -3.7)).toBeLessThan(1e-8);
  });

  it('o meridiano central no equador dá 500000, 10000000', () => {
    const [e, n] = paraUtm(-39, 0);
    expect(e).toBeCloseTo(500000, 6);
    expect(n).toBeCloseTo(10000000, 6);
  });
});
