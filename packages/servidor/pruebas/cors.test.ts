import { describe, expect, it } from 'vitest';
import { leerOrigenesExtra, origenPermitido } from '../src/cors.js';

describe('CORS', () => {
  it('permite peticiones sin cabecera Origin', () => {
    expect(origenPermitido(undefined)).toBe(true);
  });

  it('permite localhost en cualquier puerto', () => {
    expect(origenPermitido('http://localhost:5173')).toBe(true);
    expect(origenPermitido('http://127.0.0.1:4173')).toBe(true);
    expect(origenPermitido('http://[::1]:5173')).toBe(true);
  });

  it('permite subdominios de Render solo por HTTPS', () => {
    expect(origenPermitido('https://colonist-cliente.onrender.com')).toBe(true);
    expect(origenPermitido('http://colonist-cliente.onrender.com')).toBe(false);
  });

  it('rechaza otros dominios y dominios que imitan a Render', () => {
    expect(origenPermitido('https://ejemplo.com')).toBe(false);
    expect(origenPermitido('https://onrender.com.malicioso.com')).toBe(false);
    expect(origenPermitido('no es una url')).toBe(false);
  });

  it('permite los orígenes extra configurados', () => {
    const extras = leerOrigenesExtra(' https://catan.ejemplo.com/ , basura, ');
    expect([...extras]).toEqual(['https://catan.ejemplo.com']);
    expect(origenPermitido('https://catan.ejemplo.com', extras)).toBe(true);
  });
});
