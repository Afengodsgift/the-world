// Every <script src> in index.html must at least parse (a duplicate `let` once took the whole combat layer down while node-only tests stayed green).
const fs=require('fs'),h=fs.readFileSync('index.html','utf8');let bad=0;
for(const m of h.matchAll(/<script src="(src\/[^"]+)"/g)){try{new Function(fs.readFileSync(m[1],'utf8'))}catch(e){console.log('FAIL',m[1],e.message);bad++}}
if(!bad)console.log('ok all scripts parse');process.exit(bad?1:0);
