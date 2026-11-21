// Local preview only. Applies the fixed manifest to the locally migrated D1 database.
import {Miniflare,Log,LogLevel} from 'miniflare';
import {build} from 'esbuild';
await build({entryPoints:['tests/api-entry.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],outfile:'.sites-runtime/seed-corpus.mjs'});
const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/seed-corpus.mjs',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'00000000-0000-4000-8000-000000000000'},d1Persist:'.wrangler/state/v3/d1',log:new Log(LogLevel.ERROR)});
try{const r=await mf.dispatchFetch('https://local.invalid/api/corpus-import',{method:'POST'});console.log(await r.text());if(!r.ok)process.exitCode=1}finally{await mf.dispose()}
