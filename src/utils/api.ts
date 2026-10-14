let sessionReady: Promise<void> | undefined;

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  init.signal?.throwIfAborted();
  // İlk eşzamanlı bileşen istekleri farklı çerez üretmesin: oturum açılışını paylaşıyoruz.
  // HttpOnly kimlik JavaScript'e okunmaz; tarayıcı çerezi aynı-origin proxy'ye taşır.
  if (!sessionReady) {
    sessionReady = fetch('/api/providers', { credentials: 'same-origin', signal: AbortSignal.timeout(10_000) }).then(response => {
      if (!response.ok) throw new Error('Oturum başlatılamadı.');
    }).catch(error => { sessionReady = undefined; throw error; });
  }
  await sessionReady;
  init.signal?.throwIfAborted();
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('X-TokenAI-Request', '1');
  return fetch(path, { ...init, headers, credentials: 'same-origin' });
}
