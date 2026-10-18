// The graphics setting, known before anything loads (so the phone setting can fetch the
// half-size textures from the start).
const params = new URLSearchParams(location.search);
let saved = null;
try { saved = localStorage.getItem('alpenglow.quality'); } catch { /* private mode */ }
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export let QUALITY_NAME = params.get('q') ?? saved ?? (coarse ? 'low' : 'high');
if (!['low', 'high', 'ultra'].includes(QUALITY_NAME)) QUALITY_NAME = 'high';
// textures from the lo/ folders
export const LO = QUALITY_NAME === 'low';
