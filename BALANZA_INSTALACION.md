# Balanza SYSTEL Clipse → PC (Windows)

Guía para el día que llega el cable. La PC del mostrador es Windows.

---

## 1. Qué comprar

La balanza tiene un conector **DE-9 (DB9) hembra** en el lateral.
La PC y la balanza son las dos "DTE" (en ambas: pin 2 = RXD, pin 3 = TXD),
así que hace falta **cruzar** las líneas.

### Lista exacta — dos ítems

**1) Adaptador USB → RS-232, conector DB9 MACHO**

Lo que importa es el chipset. En orden de preferencia:

| Chipset | Windows 11 | Comentario |
|---|---|---|
| **FTDI FT232RL** | Driver nativo | La mejor opción. Buscar: `adaptador usb rs232 ftdi ft232` |
| **CH340 / CH341** | Driver firmado, se instala solo | Alternativa válida, más barata y común acá |
| Prolific PL2303 | **Evitar** | Los que se venden acá son clones; Windows 11 no les instala driver |

Antes de comprar, leer la descripción del aviso: si dice PL2303, o no aclara el
chipset, preguntarle al vendedor. Si no contesta, pasar al siguiente.

Referencia de precio: Casa Schettini vende uno declarado compatible con Systel
Clipse a $32.000 ($22.400 con transferencia), pero su ficha lista hasta
Windows 10 — conviene confirmar Windows 11 antes de comprarlo.

**2) Adaptador null-modem DB9 macho/hembra** (cruzador 2↔3, 3↔2, 5↔5)

Buscar como `adaptador null modem db9 macho hembra` o `cambiador cruzado db9`.
Es una pieza chica y barata, de cualquier casa de electrónica. El lado hembra
recibe la ficha del adaptador USB; el lado macho entra en la balanza.

**Comprá los dos aunque pienses probar directo primero.** El cruce es la causa
de falla más probable, y no querés volver al negocio dos veces por una pieza de
pocos pesos.

### Alternativa sin pensar

"Kit para conexión balanza Systel a PC" de Casa Schettini: cable serial 1,2 m +
adaptador USB-serial, específico para Croma y Clipse. $75.200 ($52.640 con
transferencia). Más caro, pero viene resuelto.

### Orden de prueba en el negocio

1. Enchufar **directo** (adaptador USB → balanza) y probar en `/admin/pos/balanza`.
2. Si el log de tramas queda vacío, intercalar el **null-modem** y volver a probar.

Uno de los dos anda. El diagnóstico te dice cuál en 30 segundos.

## 2. Preparar la PC Windows

1. Enchufar el adaptador USB-serie **antes** de instalar nada.
2. Abrir el **Administrador de dispositivos** → sección **Puertos (COM y LPT)**.
   - Aparece "USB Serial Port (COM3)" o similar → listo.
   - Aparece con triángulo amarillo → driver mal. Si es Prolific, es clon:
     cambiar el adaptador por uno FTDI.
   - No aparece nada → el cable no hace contacto o está muerto.
3. El navegador tiene que ser **Chrome o Edge de escritorio**. Web Serial no
   existe en Firefox, Safari ni en el celular.
4. La página tiene que abrirse por **HTTPS** o por **localhost**. Por IP local
   sin certificado (`http://192.168.x.x`) el navegador bloquea el puerto serie.

---

## 3. Conectar y probar

1. Enchufar: balanza → null-modem → adaptador USB → PC.
2. Encender la balanza y esperar a que llegue a cero.
3. Abrir el sistema y entrar a **/admin/pos/balanza** (botón "Diagnóstico" en
   la barra del POS).
4. Clic en **Conectar balanza** → elegir el puerto COM del adaptador en el
   diálogo de Chrome.
5. Poner algo en el plato.

Qué debería pasar: el estado pasa a "Abierta", el protocolo detectado muestra
**Systel nativo**, y el peso aparece en verde.

La primera vez hay que autorizar el puerto a mano. Después de eso el sistema
se reconecta solo cada vez que se abre el POS.

---

## 4. Si no lee

| Síntoma | Causa más probable | Qué hacer |
|---|---|---|
| El diálogo de Chrome no lista ningún puerto | Windows no reconoce el adaptador | Administrador de dispositivos; si es Prolific clonado, cambiar a FTDI |
| Conecta pero el log de tramas queda vacío | Falta el cruce null-modem | Agregar el adaptador cruzador |
| Llegan tramas pero el peso sale mal | El formato de esta unidad difiere | Copiar el log desde la pantalla de diagnóstico y ajustar el parseo |
| Llegan `<FF>`, `<00>`, basura | Velocidad distinta | La Clipse debe estar en 9600 8N1; revisar el menú de la balanza |
| Dice "estabilizando…" y no avanza | La balanza responde DC1 | Es normal mientras el plato se mueve; si no para, revisar que esté nivelada |
| El puerto abre una sola vez | Otro programa tomó el COM | Cerrar software viejo de balanza, PuTTY, monitores serie |

En la pantalla de diagnóstico se puede **forzar un protocolo** (Systel, Torrey,
CAS, Continuo) en vez de autodetectar. Si la autodetección falla, probar uno
por uno.

---

## 5. Detalle técnico

- Puerto: **9600 baudios, 8 datos, sin paridad, 1 stop** (9600 8N1).
- La Clipse **no transmite sola**: funciona por pregunta/respuesta.
  - Systel nativo: PC manda `ENQ` (0x05) → balanza responde `STX` + peso ASCII + `ETX` + XOR.
  - Si el peso está inestable responde `DC1` (0x11) y no manda peso.
  - Modo Torrey: PC manda `P` → `CR` + peso.
  - Modo CAS: PC manda `W` → `STX` + peso + `CR`.
- El sistema pide el peso cada 250 ms y autodetecta cuál de los cuatro modos
  responde.
- Rango de la balanza: Máx 31 kg, Mín 0,1 kg. División: 5 g hasta 15 kg, 10 g
  de 15 a 31 kg.

Código: `lib/pos/scale.ts` · diagnóstico: `app/admin/pos/balanza/page.tsx`
· tests: `npm run test:balanza`
