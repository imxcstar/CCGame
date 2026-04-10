(function (game) {
  function randomSeed() {
    return Math.floor(Math.random() * 9000000) + 1000000;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(randomBetween(min, max + 1));
  }

  function rollLoot(table) {
    const loot = {};
    Object.entries(table).forEach(([key, range]) => {
      const amount = randomInt(range[0], range[1]);
      if (amount > 0) loot[key] = amount;
    });
    return loot;
  }

  Object.assign(game, {
    randomSeed,
    randomBetween,
    randomInt,
    rollLoot
  });
})(window.TidalIsle);
