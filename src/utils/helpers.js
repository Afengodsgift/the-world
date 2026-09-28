// Small pure formatting helpers.
const fmt=ms=>{const s=ms/1000;return (s/60|0)+':'+('0'+(s%60).toFixed(1)).slice(-4)};
