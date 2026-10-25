// Textos de ayuda del móvil: en escritorio hablan de clic y de pasar el ratón; aquí, de tocar, y los botones
// ⤢ ⋮ − + ya están siempre a la vista. mobile/build.js carga este fichero justo después de i18n.js, y tr()
// devuelve la versión táctil (en el idioma elegido) de cada texto de escritorio de la lista.
(() => {
  const TOUCH = {
    'Click a card to mark it as owned.': [
      'Tap a card to mark it as owned.',
      'Toca una carta para marcarla como tuya.'],
    'Click a card to mark or unmark it. Hover over it and use ⤢ to view it larger, or ⋮ to change the quantity and more options.': [
      'Tap a card to mark or unmark it. Use ⤢ to view it larger, or ⋮ to change the quantity and more options.',
      'Toca una carta para marcarla o desmarcarla. Usa ⤢ para verla en grande, o ⋮ para cambiar la cantidad y más opciones.'],
    'Click a card to add it to the collection or remove it. Use ⋮ on the ones in it to set how many you own.': [
      'Tap a card to add it to the collection or remove it. Use ⋮ on the ones in it to set how many you own.',
      'Toca una carta para agregarla a la colección o quitarla. Usa ⋮ en las que ya están para indicar cuántas tienes.'],
    'Click a card to mark whether you own it. Use ⋮ to remove it from the collection.': [
      'Tap a card to mark whether you own it. Use ⋮ to remove it from the collection.',
      'Toca una carta para marcar si la tienes. Usa ⋮ para quitarla de la colección.'],
    'Click a card to add it to the wishlist or remove it.': [
      'Tap a card to add it to the wishlist or remove it.',
      'Toca una carta para agregarla a la wishlist o quitarla.'],
    'Click a card to mark it as owned once you get it. Use ⋮ to change the quantity or remove it from the wishlist. From any set or deck, ⋮ › Add to wishlist adds a card here.': [
      'Tap a card to mark it as owned once you get it. Use ⋮ to change the quantity or remove it from the wishlist. From any set or deck, ⋮ › Add to wishlist adds a card here.',
      'Toca una carta para marcarla como tuya cuando la consigas. Usa ⋮ para cambiar la cantidad o quitarla de la wishlist. Desde cualquier set o mazo, ⋮ › Agregar a la wishlist la añade aquí.'],
    'Click a card (or +) to add a copy, − to take one out. Your collection does not change.': [
      'Tap a card (or +) to add a copy, − to take one out. Your collection does not change.',
      'Toca una carta (o +) para agregar una copia, − para quitar una. Tu colección no cambia.'],
    'Click a card to mark whether you own it in this deck: your collection does not change. Hover over it and use − / + to change the copies, or ⋮ for the deck cover and more.': [
      'Tap a card to mark whether you own it in this deck: your collection does not change. Use − / + to change the copies, or ⋮ for the deck cover and more.',
      'Toca una carta para marcar si la tienes en este mazo: tu colección no cambia. Usa − / + para cambiar las copias, o ⋮ para la portada del mazo y más.'],
    'Click a card to make it the {slot}.': [
      'Tap a card to make it the {slot}.',
      'Toca una carta para elegirla como {slot}.'],
    'Click an art to mark it as owned. The highlighted one is this card.': [
      'Tap an art to mark it as owned. The highlighted one is this card.',
      'Toca un arte para marcarlo como tuyo. El resaltado es esta carta.'],
    'Counting: {kinds} (change it in Settings). Greyed out: Pokémon without any of those cards. Click a Pokémon to see its cards and mark the ones you own.': [
      'Counting: {kinds} (change it in Settings). Greyed out: Pokémon without any of those cards. Tap a Pokémon to see its cards and mark the ones you own.',
      'Cuentan: {kinds} (se cambia en Configuración). En gris: Pokémon sin ninguna de esas cartas. Toca un Pokémon para ver sus cartas y marcar las que tienes.'],
    'Mark the cards you own. The Pokédex will show the most expensive one you own. Hover over a card and use ⤢ to view it larger.': [
      'Mark the cards you own. The Pokédex will show the most expensive one you own. Use ⤢ on a card to view it larger.',
      'Marca las cartas que tienes. La Pokédex mostrará la más cara que tengas. Usa ⤢ en una carta para verla en grande.'],
  };
  const desktopTr = i18n.tr.bind(i18n);
  i18n.tr = (text, vars) => {
    const touch = TOUCH[text];
    if (!touch) return desktopTr(text, vars);
    const s = touch[i18n.lang === 'es' ? 1 : 0];
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
})();
