/**
 * Tests del parseo de tramas de la balanza SYSTEL Clipse.
 *
 * Correr con:  npm run test:balanza
 *
 * No necesita servidor ni balanza: arma tramas sintéticas idénticas a las que
 * manda la Clipse y verifica que salga el peso correcto. Sirve para no romper
 * el parseo cuando lo ajustemos a la trama real de la unidad del negocio.
 */

import { drainFrames, parseWeight } from '../lib/pos/scale.ts'

const A = (s: string) => [...s].map(c => c.charCodeAt(0))
const xor = (b: number[]) => b.reduce((a, c) => a ^ c, 0)

let pass = 0
let fail = 0

function t(nombre: string, obtuvo: unknown, esperado: unknown) {
  const g = JSON.stringify(obtuvo)
  const e = JSON.stringify(esperado)
  if (g === e) {
    pass++
    console.log('  ok   ' + nombre)
  } else {
    fail++
    console.log(`  FALLA ${nombre}\n        esperado ${e}\n        obtuvo   ${g}`)
  }
}

// ── Systel nativo: STX + peso + ETX + XOR ──
const cuerpo = A('0.710')
const trama = [0x02, ...cuerpo, 0x03, xor(cuerpo)]

let r = drainFrames(trama, 'systel')
t('systel 0.710 kg', r.frames.map(f => f.kg), [0.710])
t('systel no deja resto', r.rest, [])

const neg = A('-0.250')
r = drainFrames([0x02, ...neg, 0x03, xor(neg)], 'systel')
t('systel peso negativo (tara)', r.frames.map(f => f.kg), [-0.250])

// DC1: la balanza avisa que el peso todavía no se estabilizó
r = drainFrames([0x11], 'systel')
t('systel inestable', r.frames.map(f => f.unstable), [true])
t('systel inestable no trae peso', r.frames.map(f => f.kg), [null])

// Trama partida entre dos lecturas del puerto (pasa seguido en serie)
r = drainFrames([0x02, ...A('1.2')], 'systel')
t('trama incompleta no emite nada', r.frames.length, 0)
const r2 = drainFrames([...r.rest, ...A('50'), 0x03, 0x00], 'systel')
t('trama completada en el 2do chunk', r2.frames.map(f => f.kg), [1.250])

r = drainFrames([...trama, ...trama], 'systel')
t('dos tramas en un mismo chunk', r.frames.map(f => f.kg), [0.710, 0.710])

r = drainFrames([0xff, 0x00, ...trama], 'systel')
t('descarta ruido antes del STX', r.frames.map(f => f.kg), [0.710])

r = drainFrames(trama, 'systel')
t('trama cruda legible para diagnóstico', r.frames[0].raw.startsWith('<02>0.710<03>'), true)

// ── Otros modos ──
r = drainFrames(A('P 2.345\r'), 'torrey')
t('torrey 2.345 kg', r.frames.map(f => f.kg), [2.345])

r = drainFrames(A('ST,GS,  0,865 kg\r\n'), 'continuous')
t('continuo: coma decimal y prefijo de estado', r.frames.map(f => f.kg), [0.865])

// ── Rango de la Clipse (Máx 31 kg) ──
t('rechaza un peso fuera de rango', parseWeight('45.000'), null)
t('acepta el máximo de la balanza', parseWeight('31.000'), 31)
t('interpreta gramos sin punto decimal', parseWeight('1250'), 1.25)

console.log(`\n${pass} ok, ${fail} fallan`)
process.exit(fail ? 1 : 0)
