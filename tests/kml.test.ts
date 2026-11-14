import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { lerKml } from '../src/nucleo/kml.ts';
import { paraUtm } from '../src/nucleo/utm.ts';

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document><name>Raiz</name>
 <Folder><name>Pasta A</name>
  <Folder><name>Sub &amp; B</name>
   <Placemark><name>Açude &amp; Cia &#65;</name>
    <ExtendedData><SchemaData schemaUrl="#s"><SimpleData name="COD">12</SimpleData></SchemaData>
     <Data name="tipo"><value>APP</value></Data></ExtendedData>
    <MultiGeometry>
     <Point><coordinates>-38.5,-3.7,0</coordinates></Point>
     <Polygon>
      <outerBoundaryIs><LinearRing><coordinates>-38.5,-3.7 -38.4,-3.7 -38.4,-3.6 -38.5,-3.6 -38.5,-3.7</coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>-38.48,-3.68 -38.46,-3.68 -38.46,-3.66 -38.48,-3.66 -38.48,-3.68</coordinates></LinearRing></innerBoundaryIs>
     </Polygon>
    </MultiGeometry>
   </Placemark>
  </Folder>
  <Placemark><name>Linha</name><LineString><coordinates>-38.5,-3.7 -38.51,-3.71</coordinates></LineString></Placemark>
 </Folder>
</Document></kml>`;

describe('lerKml', () => {
  it('lê pastas aninhadas, MultiGeometry, buraco, SimpleData, Data e entidades', () => {
    const f = lerKml(strToU8(KML));
    expect(f).toHaveLength(2);
    expect(f[0].pasta).toEqual(['Raiz', 'Pasta A', 'Sub & B']);
    expect(f[0].nome).toBe('Açude & Cia A');
    expect(f[0].atributos).toEqual({ COD: '12', tipo: 'APP' });
    expect(f[0].geometrias).toHaveLength(2);
    const [pt, pol] = f[0].geometrias;
    expect(pt).toEqual({ t: 'ponto', p: paraUtm(-38.5, -3.7) });
    expect(pol.t === 'poligono' && pol.aneis.length).toBe(2);
    expect(f[1].pasta).toEqual(['Raiz', 'Pasta A']);
    expect(f[1].geometrias[0].t).toBe('linha');
  });

  it('lê KMZ com doc.kml', () => {
    expect(lerKml(zipSync({ 'doc.kml': strToU8(KML) }))).toHaveLength(2);
  });

  it('lê KMZ sem doc.kml, pelo primeiro .kml', () => {
    expect(lerKml(zipSync({ 'outro/arquivo.kml': strToU8(KML), 'x.png': strToU8('p') }))).toHaveLength(2);
  });

  it('bytes que não são KML dão o erro exato', () => {
    const erro = 'Este arquivo não é um KML nem um KMZ';
    expect(() => lerKml(strToU8('isto nao e xml'))).toThrow(erro);
    expect(() => lerKml(strToU8('<html><body/></html>'))).toThrow(erro);
    expect(() => lerKml(zipSync({ 'a.txt': strToU8('x') }))).toThrow(erro);
  });
});
