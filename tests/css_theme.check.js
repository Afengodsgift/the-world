// Guards for the glass theme (src/ui/theme.css) against index.html's landscape layout:
//  1. no CSS custom property is defined by BOTH files (a duplicate --g once silently broke every landscape button position)
//  2. theme.css never positions/sizes the touch controls outside the portrait/desktop @media block
//     (landscape phones are laid out by index.html; the theme must only skin them there)
//  3. braces balance
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const idx=fs.readFileSync(path.join(root,'index.html'),'utf8'),theme=fs.readFileSync(path.join(root,'src/ui/theme.css'),'utf8');
const inline=(idx.match(/<style>([\s\S]*?)<\/style>/)||[])[1]||'';
const defs=c=>new Set([...c.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map(m=>m[1]));
let bad=0;const fail=m=>{console.log('FAIL',m);bad++};
const a=defs(inline),b=defs(theme),clash=[...b].filter(x=>a.has(x));
if(clash.length)fail('custom properties defined in both index.html and theme.css: '+clash.join(', '));
if((theme.match(/{/g)||[]).length!==(theme.match(/}/g)||[]).length)fail('theme.css braces do not balance');
// walk top-level blocks; flag layout props on control ids when not inside a "not all and (orientation:landscape)" media block
const CONTROLS='jump|smack|boost|use|owfire|owgun|owrl|owshop|owview|emobtn|panbtn|stick|knob';
const LAYOUT=/(^|[;{\s])(left|right|top|bottom|width|height):/;
let depth=0,inPortrait=false;
for(const raw of theme.split('\n')){
  const line=raw.trim();
  if(line.startsWith('@media')){depth++;inPortrait=/^@media not all and \(orientation:landscape\)/.test(line);continue}
  if(line==='}'&&depth){depth--;inPortrait=false;continue}
  if(depth===0||!inPortrait){
    const m=line.match(new RegExp('^(html )?#('+CONTROLS+')\\b[^{]*\\{(.*)\\}'));
    if(m&&LAYOUT.test(m[3]))fail('layout property on #'+m[2]+' outside the portrait/desktop media block: '+line.slice(0,90));
  }
}
console.log(bad?bad+' problem(s)':'theme checks OK (no variable clashes, no layout leakage into landscape)');process.exit(bad?1:0);
