<p align="center">
  <img src="docs/logo.png" alt="TCG Companion" width="160" />
</p>

<h1 align="center">TCG Companion</h1>

<p align="center">
  App de escritorio para llevar el control de tus colecciones de cartas TCG.<br />
  Marca las cartas que tienes, mira cuánto te falta para completar cada colección y arma tu Pokédex de Full Arts.
</p>

<p align="center">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-sql.js-003B57?logo=sqlite&logoColor=white" />
  <img alt="Plataforma" src="https://img.shields.io/badge/plataforma-Windows-0078D6?logo=windows&logoColor=white" />
  <img alt="Licencia" src="https://img.shields.io/badge/licencia-MIT-green" />
</p>

---

![Pokédex](docs/screenshots/pokedex.webp)

## Funciones

| TCG | Estado |
|---|---|
| Pokémon | ✅ Disponible |
| Magic: The Gathering | ✅ Disponible |
| One Piece | ✅ Disponible |

### Menú principal

Un menú de franjas diagonales al estilo de los videojuegos de lucha, con una franja por TCG, otra para **Mis mazos** y otra para **Configuración**:

- La franja elegida se despliega con el arte de su TCG y, a la derecha, aparece una vista previa.
- Cada TCG muestra **cuántas cartas distintas tienes y en cuántos sets**.
- **Mis mazos** muestra en abanico las portadas de tus últimos mazos, con su TCG y formato.
- **Configuración** muestra una ficha con tus opciones actuales: sonido, idioma, TCG visibles y cartas descargadas.
- Se elige con el ratón o con las flechas **↑ ↓** y **Enter**.
- Sin conexión, las franjas se ven con el color de cada TCG y la vista previa usa el dorso de la carta.

### Pokémon

- **Pokédex de Full Arts.** Están los 1025 Pokémon de la Pokédex nacional.
  - Los que no tienen ninguna carta Full Art salen en gris.
  - Al entrar en un Pokémon ves todas sus cartas Full Art con su **precio de mercado**, ordenadas de más cara a más barata, y marcas las que tienes.
  - En la Pokédex, la imagen del Pokémon se cambia por **la carta más cara que tienes** de él.
  - Debajo de las Full Art hay una sección **Promos** con todas las promos de ese Pokémon. TCGdex no indica cuáles son Full Art, así que aparecen todas.
  - Tiene buscador por nombre o número y filtros *Todos / Conseguidos / Me faltan*.
- **Sets.** Por ahora está *30th Celebration - Pikachus*, con los 34 Pikachu del set 30th Celebration.
- **Progreso.** Cada colección muestra cuántas cartas tienes y el porcentaje completado.
- **Funciona sin conexión.** Las cartas se descargan una vez y quedan guardadas en tu equipo. El botón *Actualizar desde la API* vuelve a descargarlas cuando salen cartas nuevas, y **no borra lo que marcaste**.

### One Piece

- **Todos los sets.** Booster packs, extra boosters, premium boosters, starter decks y una colección con todas las promos, con sus variantes (Parallel, Alternate Art, Manga, SP…).
- **Buscador de cartas** en todos los sets y **colecciones custom**, igual que en Pokémon.
- El catálogo completo (unas 5.000 cartas) se descarga la primera vez que entras, en pocos segundos, así que el buscador funciona sin conexión.

### Magic: The Gathering

- **Todos los sets en papel** (sin los exclusivos de MTG Arena / MTGO), agrupados por tipo: expansiones, core sets, Masters, Commander, promos, tokens…
- Cada set se descarga al abrirlo por primera vez y queda guardado para usarlo sin conexión.
- **Versiones por acabado:** de cada carta se cuentan aparte las copias normales, foil y etched foil (desde el menú ⋮).
- Enlaces a **Scryfall**, **Moxfield** y **TCGplayer**, y *View all arts* con todas las impresiones de la carta.
- **Buscador de cartas** en todos los sets y **colecciones custom**, igual que en Pokémon y One Piece.

### Precios

Los precios no se muestran debajo de las cartas. En el menú ⋮ de cualquier carta, **View price** abre un diálogo con los precios actuales de cada versión:

- **Pokémon:** TCGplayer (Market, Low, Mid, High en USD) por versión (Normal, Holofoil, Reverse Holofoil…) y Cardmarket (en EUR) para la normal y la holo / reverse.
- **Magic:** TCGplayer (USD) y Cardmarket (EUR) de cada acabado: Non-foil, Foil y Etched foil.
- **One Piece:** TCGplayer (precio de mercado y listado más barato, en USD) de todas las versiones de la carta (normal, Parallel, arte alternativo, promos…).

### Filtros avanzados

En los sets, las colecciones custom y los buscadores de cartas, el botón **Filters** abre un diálogo para filtrar por:

- **Colección:** las que tienes, las que te faltan o las ocultas. Mientras no haya otros filtros, en los sets se eligen directamente con los chips *All / Owned / Not owned*.
- **Copias mínimas:** solo las cartas de las que tienes al menos esa cantidad de copias (por ejemplo, 5 muestra las que tienes 5 o más veces).
- **Tipo de carta:** Pokémon / Trainer / Energy, o Leader / Character / Event / Stage en One Piece.
- **Rareza**, **color** (tipo de energía en Pokémon) y **set**.
- **Pokémon:** subtipo de entrenador o energía (Item, Supporter, Stadium, Tool…), fase (Basic, Stage 1, Stage 2…) y mecánica (ex, V, VMAX, GX…).
- **One Piece:** rareza con su nombre completo (Common, Super Rare, Secret Rare…), atributo (Slash, Strike…) y versión (normal o arte alternativo).
- **Magic:** tipo (Creature, Instant, Land… las cartas con varios tipos salen en todos), supertipo (Legendary, Basic, Snow), color (con *Multicolor* y *Colorless*) y marco / arte (Borderless, Showcase, Extended art, Full art, marco antiguo, promo).

Los filtros aplicados aparecen como etiquetas que se pueden quitar una a una sin volver a abrir el diálogo.

### Configuración

Desde **Settings**, en el menú principal:

- **Efectos de sonido:** activarlos o desactivarlos.
- **Idioma:** inglés o español. Cambia todos los textos de la app; los nombres y datos de las cartas (tipos, rarezas, versiones) se muestran tal como los da cada API.
- **TCG visibles:** ocultar del menú principal los TCG que no coleccionas (por defecto se ven los tres). Sus cartas y mazos no se borran, y siempre queda al menos uno visible.

## Capturas

| Menú principal | Colecciones de Pokémon |
|---|---|
| ![Menú principal](docs/screenshots/home.webp) | ![Colecciones de Pokémon](docs/screenshots/pokemon-menu.webp) |

| Cartas Full Art de un Pokémon | Set 30th Celebration - Pikachus |
|---|---|
| ![Gengar](docs/screenshots/pokemon.webp) | ![Set](docs/screenshots/set.webp) |

## Instalación

Necesitas [Node.js](https://nodejs.org/) 20 o superior.

```bash
git clone <url-del-repositorio>
cd TCGCompanion
npm install
npm start
```

### Uso

- **Clic** en una carta: la marca como conseguida. Otro clic la desmarca.
- **Doble clic** en una carta: la muestra en grande.
- La ruta de la base de datos aparece en el pie de la app. Si haces clic en ella, se abre la carpeta en el explorador.

### Crear el instalador de Windows

```bash
npm run dist
```

Genera un instalador `.exe` en `dist/`.

## Stack

| Parte | Tecnología |
|---|---|
| App de escritorio | [Electron](https://www.electronjs.org/) |
| Interfaz | HTML, CSS y JavaScript sin frameworks |
| Base de datos | SQLite mediante [sql.js](https://sql.js.org/) (WebAssembly, no hay que compilar nada) |
| Datos de cartas y precios | [TCGdex](https://tcgdex.dev) para Pokémon, [OPTCG API](https://optcgapi.com) para One Piece y [Scryfall](https://scryfall.com/docs/api) para Magic (gratuitas, sin API key) |
| Pokédex, nombres y sprites | [PokeAPI](https://pokeapi.co/) |
| Iconos | `sharp` + `png-to-ico` |
| Instalador | `electron-builder` |

## Estructura del proyecto

```
├── main.js                 Proceso principal de Electron (ventana + IPC)
├── preload.js              Puente seguro entre la interfaz y el proceso principal
├── renderer/               Interfaz (index.html, styles.css, app.js, sounds.js e i18n.js con los textos en español)
├── src/
│   ├── db.js               Esquema y consultas SQLite
│   ├── pokemon-api.js      Cliente de TCGdex y PokeAPI
│   ├── onepiece-api.js     Cliente de OPTCG API (One Piece)
│   ├── magic-api.js        Cliente de Scryfall (Magic: The Gathering)
│   └── pokedex-sync.js     Sincronización de la Pokédex y precios
├── assets/                 Icono de la app, dorso y logo de cada TCG
├── scripts/make-icons.js   Genera icon.png / icon.ico desde el logo
└── docs/                   Logo y capturas del README
```

## Datos

Todo se guarda en un fichero SQLite en `%APPDATA%\tcg-companion\tcg-companion.sqlite`. Puedes abrirlo con [DBeaver](https://dbeaver.io/) creando una conexión de tipo *SQLite*. Si vas a editar datos desde DBeaver, hazlo con la app cerrada, porque la app reescribe el fichero cada vez que marcas una carta.

| Tabla | Contenido |
|---|---|
| `collections` | Colecciones disponibles (TCG, set, filtro por nombre) |
| `cards` | Cartas de cada set descargadas de la API (incluye el JSON completo) |
| `owned_cards` | Cartas que tienes (`card_id`, `quantity`) |
| `pokedex` | Especies de la Pokédex nacional |
| `fullart_cards` | Cartas Full Art y promos de cada Pokémon (`dex_id`, `kind`) |
| `card_prices` | Precio de mercado (TCGplayer en USD, o Cardmarket en EUR si no hay) |

### Qué cuenta como "Full Art"

TCGdex no tiene una categoría "Full Art", así que se deduce por la rareza. La lista está en `FULL_ART_RARITIES` (`src/pokemon-api.js`) y es fácil de ajustar:

> Ultra Rare · Illustration rare · Special illustration rare · Hyper rare · Mega Hyper Rare · Secret Rare · Shiny Ultra Rare · Shiny rare V · Shiny rare VMAX · Black White Rare

Las cartas de TCG Pocket, de entrenadores y de energías no se incluyen. Los precios se descargan al abrir un Pokémon y se refrescan cada 7 días.

### Añadir colecciones

Para añadir otro set de Pokémon basta con una entrada en `SEED_COLLECTIONS` (`src/db.js`), con el id del set en TCGdex y, si quieres, un filtro por nombre:

```js
{ id: 'pkm-30th-pikachus', tcg: 'pokemon', name: '30th Celebration - Pikachus', set_id: '30th', name_filter: 'Pikachu', sort_order: 1 }
```

## Limitaciones conocidas

- Las cartas muy nuevas pueden tardar unas semanas en llegar a TCGdex. Por ejemplo, la promo MEP 101 Nidorina todavía no está.
- Algunas promos no tienen imagen en la API. Aparecen como un recuadro con el texto "Sin imagen" y se pueden marcar igualmente.
- Las imágenes de One Piece que da OPTCG API llevan la marca de agua "SAMPLE".
- Si una carta no tiene precio en TCGplayer se usa el de Cardmarket. En ese caso, comparar cuál es la más cara es aproximado, porque mezcla USD y EUR.

## Roadmap

- [x] Magic: The Gathering
- [x] One Piece Card Game
- [ ] Más sets de Pokémon
- [ ] Añadir a mano cartas que todavía no están en la API

## Créditos

Los datos de cartas provienen de [TCGdex](https://tcgdex.dev) (Pokémon) y [OPTCG API](https://optcgapi.com) (One Piece) y [Scryfall](https://scryfall.com) (Magic), y los de la Pokédex de [PokeAPI](https://pokeapi.co/).
Pokémon y sus nombres son marcas de Nintendo, Creatures Inc. y GAME FREAK inc. Magic: The Gathering es marca de Wizards of the Coast. One Piece es marca de Eiichiro Oda / Shueisha / Bandai. Este proyecto no está afiliado a ninguno de ellos.

## Licencia

[MIT](LICENSE)
