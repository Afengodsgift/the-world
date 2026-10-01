// Temporary restore - load the last full working game.js from a known good commit
const s = document.createElement('script');
s.src = 'https://raw.githubusercontent.com/Afengodsgift/the-world/a6b8db1871506f7b0e075692937dedcbe7d8ac2a/src/game.js';
s.onerror = () => { document.getElementById('msg').textContent = 'Restore failed - please wait, fixing...'; };
document.head.appendChild(s);
console.log('Loading full previous working game...');
