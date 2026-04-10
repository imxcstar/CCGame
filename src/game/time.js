(function (game) {
  const { state } = game;

  function getDaylight() {
    return (Math.sin(state.time * Math.PI * 2 - Math.PI * 0.5) + 1) * 0.5;
  }

  function isNight() {
    return getDaylight() < 0.22;
  }

  function getTimeLabel() {
    if (state.time < 0.2) return '黎明';
    if (state.time < 0.42) return '上午';
    if (state.time < 0.58) return '正午';
    if (state.time < 0.72) return '黄昏';
    return '深夜';
  }

  function getWeatherText() {
    const daylight = getDaylight();
    if (daylight > 0.75) return '阳光炽烈';
    if (daylight > 0.45) return '海风平稳';
    if (daylight > 0.18) return '潮水上升';
    return '暗潮来袭';
  }

  Object.assign(game, {
    getDaylight,
    isNight,
    getTimeLabel,
    getWeatherText
  });
})(window.TidalIsle);
