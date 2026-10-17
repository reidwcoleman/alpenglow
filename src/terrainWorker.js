import { buildChunkArrays } from './chunkbuild.js';
self.onmessage = (e) => {
  const { id, cx, cz, segs, size } = e.data;
  const a = buildChunkArrays(cx, cz, segs, size);
  self.postMessage({ id, ...a }, [a.pos.buffer, a.nrm.buffer, a.pst.buffer, a.ice.buffer, a.idx.buffer]);
};
