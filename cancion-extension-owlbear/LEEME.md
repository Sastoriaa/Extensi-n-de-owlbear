# Canción de los Caídos — extensión para Owlbear Rodeo

Añade tu sistema a Owlbear: ficha de personaje, tirador de d6 con Interferencia
automática, seguimiento del grupo en tiempo real y bestiario.

## Qué hace cada pestaña

- **Ficha** — características con su tope por Rango, PV, Esencia, Grieta, estados,
  Aspecto, habilidades con su perfil de daño, y Defecto.
- **Tirar** — arma el pool, aplica Interferencia según el rival, tira, y lee el
  resultado con tus reglas (6 limpio / 4-5 con costo / 1-3 fallo / doble 6 crítico).
  Empujar y Esquivar descuentan Esencia y suben la Grieta solos.
- **Equipo** — arma equipada y las 7 Memorias, con el máximo de puntos calculado
  por Rango y Clase de origen, y aviso si te pasas.
- **Grupo** — PV, Esencia, Grieta y estados de todos, en vivo. El DM puede
  recargar la Esencia de todo el grupo de un botón.
- **Bestiario** — ficha de cualquier mob por Rango y Clase, y tirada de su ataque.

## Cómo publicarla (una sola vez)

Necesitas que los archivos vivan en una URL pública. Con Netlify es gratis y no
pide tarjeta:

1. Entra a **netlify.com** y crea una cuenta.
2. Busca **Netlify Drop** (la zona de "arrastra tu carpeta aquí").
3. Arrastra **la carpeta completa** de esta extensión.
4. Netlify te da una URL, por ejemplo `https://algo-random.netlify.app`.

Tu manifiesto queda en `https://TU-URL/manifest.json`. Esa es la dirección que
vas a usar en el paso siguiente.

## Cómo instalarla en Owlbear

1. En Owlbear Rodeo, entra a tu perfil y usa **Add Extension**.
2. Pega la URL de tu `manifest.json`.
3. Crea o abre una sala: aparecerá el icono de la extensión arriba a la izquierda.

Tus jugadores no tienen que instalar nada: al entrar a tu sala les aparece igual.

## Cómo funciona el guardado

- La **ficha completa** (Aspecto, Defecto, Memorias, arma) se guarda en el
  navegador de cada quien. No se comparte.
- El **estado vivo** (nombre, PV, Esencia, Grieta, estados) sí se sincroniza con
  la sala, para que la pestaña Grupo funcione. Son unos 1.2 kB con seis
  personajes, muy por debajo del tope de 16 kB que permite Owlbear.

Si un jugador limpia los datos de su navegador, pierde su ficha. Conviene que
cada uno tenga su PDF de respaldo.

## Archivos

- `manifest.json` — lo que Owlbear lee para cargar la extensión.
- `index.html` — la interfaz del panel.
- `main.js` — la lógica y la comunicación con Owlbear.
- `sistema.js` — las reglas y tablas del sistema. Si algún día ajustas un número
  del sistema, casi siempre es aquí.
- `icon.svg` — el icono.
