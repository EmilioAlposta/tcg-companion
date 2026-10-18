# TCG Companion

App de escritorio (Electron) para llevar el control de tus colecciones de cartas TCG.

- **Pokémon**:
  - **Pokédex**: los 1025 Pokémon. Los que no tienen ninguna carta Full Art salen en gris. Al entrar en uno
    ves sus Full Art (con precio de mercado) y marcas las que tienes; en la Pokédex se muestra la más cara.
    Debajo aparece una sección "Promos" con todas sus promos (TCGdex no indica cuáles son Full Art); las que
    marques también cuentan para la imagen de la Pokédex.
  - Set "30th Celebration - Pikachus" (34 cartas del set *30th Celebration*).
- **Magic** y **One Piece**: próximamente.

## Uso

```bash
npm install
npm start
```

Haz clic en una carta para marcarla como conseguida (otra vez para desmarcarla); doble clic para verla en grande.

## Datos

- Las cartas vienen de [TCGdex](https://tcgdex.dev) (API gratuita, sin API key). Se descargan la primera vez
  que abres la colección y se guardan en local; "Actualizar desde la API" las vuelve a descargar.
- Todo se guarda en un fichero SQLite: `%APPDATA%\tcg-companion\tcg-companion.sqlite`
  (la ruta aparece en el pie de la app; al hacer clic se abre en el explorador).
- Puedes abrir ese fichero con **DBeaver** (conexión tipo *SQLite*) para consultarlo. Si vas a editar
  datos desde DBeaver, hazlo con la app cerrada: la app reescribe el fichero cada vez que marcas una carta.

Tablas:

| Tabla          | Contenido                                                      |
|----------------|----------------------------------------------------------------|
| `collections`  | Colecciones disponibles (TCG, set, filtro por nombre)          |
| `cards`        | Cartas descargadas de la API (incluye el JSON completo)        |
| `owned_cards`  | Cartas que tienes (`card_id`, `quantity`)                      |
| `pokedex`      | Especies de la Pokédex nacional (PokeAPI)                      |
| `fullart_cards`| Cartas Full Art asociadas a cada Pokémon (`dex_id`)            |
| `card_prices`  | Precio de mercado (TCGplayer USD, o Cardmarket EUR si no hay)  |

Qué cuenta como "Full Art" se define en `FULL_ART_RARITIES` (`src/pokemon-api.js`): Ultra Rare, Illustration rare,
Special illustration rare, Hyper rare, Mega Hyper Rare, Secret Rare, Shiny Ultra Rare, Shiny rare V/VMAX y
Black White Rare. Los precios se descargan al abrir un Pokémon y se refrescan cada 7 días.

Para añadir otra colección de Pokémon basta con añadir una entrada en `SEED_COLLECTIONS` (`src/db.js`).

## Icono e instalador

- `npm run icons` regenera `assets/icon.png` / `assets/icon.ico` desde `assets/logo-source.webp`.
- `npm run dist` crea el instalador de Windows en `dist/`.
