import { buildChunkArrays } from './chunkbuild.js';
self.onmessage = (e) => {
  const { id, cx, cz, segs, size, lod, coarsest } = e.data;
  const a = buildChunkArrays(cx, cz, segs, size, lod, coarsest);
  self.postMessage({ id, ...a }, [a.pos.buffer, a.nrm.buffer, a.pst.buffer, a.ice.buffer, a.idx.buffer, a.mor.buffer, a.wnd.buffer]);
};
