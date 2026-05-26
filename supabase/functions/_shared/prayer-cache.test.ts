import { fetchPrayerYear, type EnvelopeResult } from './prayer-cache';

function fakeFetcher(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return ((url: RequestInfo | URL) =>
    Promise.resolve(handler(typeof url === 'string' ? url : url.toString()))) as unknown as typeof fetch;
}

describe('fetchPrayerYear', () => {
  const completeEntry = {
    date: '2026-05-04',
    times: {
      imsak: '03:30',
      gunes: '05:05',
      ogle: '12:58',
      ikindi: '16:50',
      aksam: '20:30',
      yatsi: '22:00',
    },
  };

  it('hits the yearly endpoint with the given districtId', async () => {
    let captured = '';
    const fetcher = fakeFetcher((url) => {
      captured = url;
      return new Response(JSON.stringify({ success: true, data: [completeEntry] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(captured).toBe('https://ezanvakti.imsakiyem.com/api/prayer-times/9541/yearly');
    expect(r.ok).toBe(true);
  });

  it('returns ok:true with the entry array on a well-formed envelope', async () => {
    const entries = [completeEntry];
    const fetcher = fakeFetcher(() =>
      new Response(JSON.stringify({ success: true, data: entries }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: true, data: entries });
  });

  it('returns ok:false upstream-502 on a 502 response', async () => {
    const fetcher = fakeFetcher(
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'upstream-502' });
  });

  it('returns ok:false invalid-json when response body is not JSON', async () => {
    const fetcher = fakeFetcher(
      () =>
        new Response('<html>OK</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'invalid-json' });
  });

  it('returns ok:false success-false on {success:false}', async () => {
    const fetcher = fakeFetcher(
      () =>
        new Response(JSON.stringify({ success: false, message: 'denied' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'success-false' });
  });

  it('returns ok:false data-not-array when data is missing or wrong type', async () => {
    const fetcher = fakeFetcher(
      () =>
        new Response(JSON.stringify({ success: true, data: { not: 'an array' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'data-not-array' });
  });

  it('returns ok:false empty-data when data is an empty array', async () => {
    const fetcher = fakeFetcher(
      () =>
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'empty-data' });
  });

  it('returns ok:false bad-prayer-entry when a prayer time key is missing', async () => {
    const fetcher = fakeFetcher(
      () =>
        new Response(
          JSON.stringify({
            success: true,
            data: [{ date: '2026-05-04', times: { imsak: '03:30' } }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'bad-prayer-entry' });
  });

  it('returns ok:false bad-envelope when the response is a JSON null', async () => {
    const fetcher = fakeFetcher(
      () =>
        new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'bad-envelope' });
  });

  it('returns ok:false network-error when the fetcher throws', async () => {
    const fetcher = (() => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    const r = await fetchPrayerYear(fetcher, '9541');
    expect(r).toEqual<EnvelopeResult>({ ok: false, reason: 'network-error' });
  });
});
