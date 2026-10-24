// Read-only upstream adapter. Never retry auth errors or use stale/empty data.
const TRANSIENT = new Set([502, 503, 504]);
async function readDiary(url, key, options = {}) {
  if (!key) throw new Error('INTERNAL_KEY not set');
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchImpl(url, {
        headers: { 'x-internal-key': key },
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) {
        const e = new Error('diary http ' + r.status);
        e.retryable = TRANSIENT.has(r.status);
        if (r.body && r.body.cancel) await r.body.cancel().catch(() => {});
        throw e;
      }
      const data = await r.json();
      if (!data || !Array.isArray(data.sites) || !Array.isArray(data.days)) {
        const e = new Error('diary invalid response');
        e.retryable = false;
        throw e;
      }
      return data;
    } catch (e) {
      last = e;
      const network = ['TypeError', 'TimeoutError', 'AbortError'].includes(e.name);
      if (attempt || !(e.retryable === true || (e.retryable === undefined && network))) throw e;
      await sleep(5000);
    }
  }
  throw last;
}
module.exports = { readDiary };
