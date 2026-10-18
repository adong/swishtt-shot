/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: "SwishTT Shot",
  keys: [
    ["shoot: hold, then let go", "Space"],
    ["aim", "← →"],
    ["power", "hold Space longer"],
    ["call your brother to rebound", "T"],
    ["pick your shooter (title)", "← →"],
    ["easy or normal (title)", "E"],
    ["start · play again", "Enter"],
    ["pause", "P or Esc"],
    ["sound on / off", "M"],
  ],
  touch: "Swipe up to shoot: sideways aims, and a longer swipe shoots harder. Tap your brother's face (bottom right) to call him.",
});
