function cookiePairs(response) {
  const headers = response.headers;
  const setCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean);
  return setCookies.map(value => value.split(';', 1)[0].trim()).filter(value => /^[^=]+=/.test(value));
}

export class HermesTranscriber {
  #baseUrl;
  #username;
  #password;
  #fetch;
  #cookies = [];
  #loginPromise = null;

  constructor({ baseUrl, username, password, fetchImpl = fetch }) {
    if (!baseUrl || !username || !password) throw new Error('Hermes URL and login credentials are required.');
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#username = username;
    this.#password = password;
    this.#fetch = fetchImpl;
  }

  async #login() {
    if (!this.#loginPromise) {
      this.#loginPromise = (async () => {
        const response = await this.#fetch(`${this.#baseUrl}/auth/password-login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'basic', username: this.#username, password: this.#password, next: '' }),
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error('Hermes login failed. Check the server-side Hermes account configuration.');
        this.#cookies = cookiePairs(response);
        if (this.#cookies.length === 0) throw new Error('Hermes login returned no session cookie.');
      })().finally(() => { this.#loginPromise = null; });
    }
    return this.#loginPromise;
  }

  async #sendTranscription({ dataUrl, mimeType }) {
    const response = await this.#fetch(`${this.#baseUrl}/api/audio/transcribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: this.#cookies.join('; '),
      },
      body: JSON.stringify({ data_url: dataUrl, mime_type: mimeType }),
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
    });
    return response;
  }

  async transcribe({ dataUrl, mimeType }) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:') || !dataUrl.includes(';base64,')) {
      throw new Error('Invalid audio data.');
    }
    if (typeof mimeType !== 'string' || !mimeType.toLowerCase().startsWith('audio/')) {
      throw new Error('Unsupported audio format.');
    }

    if (this.#cookies.length === 0) await this.#login();
    let response = await this.#sendTranscription({ dataUrl, mimeType });
    if (response.status === 401) {
      this.#cookies = [];
      await this.#login();
      response = await this.#sendTranscription({ dataUrl, mimeType });
    }

    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || body?.ok !== true) throw new Error('Hermes transcription failed.');
    return { transcript: typeof body.transcript === 'string' ? body.transcript.trim() : '' };
  }
}
