import {createReadStream} from 'node:fs';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Only browser chrome and fallback canvas colours. Document layouts, artwork,
// scripts and explicitly styled body colours remain owned by the report.
const prelude = Buffer.from(`<meta name="color-scheme" content="dark"><style data-app-chrome>
html{color-scheme:dark;background-color:#101115;color:#d3d0d9}
html,body,body *{scrollbar-color:#514c59 #111217!important;scrollbar-width:thin}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:#111217!important}
::-webkit-scrollbar-thumb{background:#514c59!important;border:2px solid #111217;border-radius:6px}
</style><script data-image-menu>
document.addEventListener('contextmenu',function(event){
  const image=event.target.closest?.('img');
  if(!image || window.parent===window) return;
  event.preventDefault();
  const rect=image.getBoundingClientRect();
  window.parent.postMessage({type:'bridge-image-menu',url:image.currentSrc||image.src,x:event.clientX||rect.left,y:event.clientY||rect.top},'*');
},true);
</script>`);

export function reportChromeStream() {
  let pending = Buffer.alloc(0), inserted = false;
  const emit = function () {
    const text = pending.toString('utf8');
    // Preserve doctype, charset declarations and original bytes, including BOM.
    const head = /<head(?:\s[^>]*)?>/i.exec(text);
    const fallback = /^\uFEFF?\s*<!doctype[^>]*>/i.exec(text);
    const position = head ? head.index + head[0].length : fallback ? fallback[0].length : text.startsWith('\uFEFF') ? 1 : 0;
    const offset = Buffer.byteLength(text.slice(0, position));
    this.push(pending.subarray(0, offset)); this.push(prelude); this.push(pending.subarray(offset));
    pending = null; inserted = true;
  };
  return new Transform({
    transform(chunk, encoding, callback) {
      if (inserted) this.push(chunk);
      else {
        pending = Buffer.concat([pending, chunk]);
        if (/<head(?:\s[^>]*)?>/i.test(pending.toString('utf8')) || pending.length >= 65536) emit.call(this);
      }
      callback();
    },
    flush(callback) { if (!inserted) emit.call(this); callback(); },
  });
}

export async function serveReport(request, response, file, info, headers) {
  response.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Content-Length':info.size + prelude.length, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', ...headers});
  if (request.method === 'HEAD') { response.end(); return; }
  await pipeline(createReadStream(file), reportChromeStream(), response).catch(error => {
    if (!request.destroyed && !response.destroyed) throw error;
  });
}
