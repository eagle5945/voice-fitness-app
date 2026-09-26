const MIME_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function speechAvailable({ mediaDevices = globalThis.navigator?.mediaDevices, MediaRecorderClass = globalThis.MediaRecorder } = {}) {
  return Boolean(mediaDevices?.getUserMedia && MediaRecorderClass);
}

function chooseMimeType(MediaRecorderClass) {
  return MIME_TYPES.find(type => MediaRecorderClass.isTypeSupported?.(type)) ?? '';
}

function mediaError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return new Error('마이크 권한이 없습니다. iPhone Safari의 마이크 접근을 허용하고 다시 시도하세요.');
  }
  if (error?.name === 'NotFoundError' || error?.name === 'NotReadableError') {
    return new Error('마이크를 사용할 수 없습니다. 다른 앱이 마이크를 사용 중인지 확인하세요.');
  }
  return new Error('마이크를 시작하지 못했습니다. 권한을 확인하거나 직접 입력하세요.');
}

export function recordAndTranscribe({
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorderClass = globalThis.MediaRecorder,
  requestTranscription,
  onState = () => {},
  maxDurationMs = 10_000,
} = {}) {
  let stream;
  let recorder;
  let stopTimer;
  let uploadController;
  let settled = false;
  let stopRequested = false;
  let cancelled = false;
  const chunks = [];
  let rejectPromise;
  let resolvePromise;

  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  const releaseMicrophone = () => {
    clearTimeout(stopTimer);
    for (const track of stream?.getTracks?.() ?? []) track.stop();
    stream = undefined;
  };
  const fail = error => {
    if (settled) return;
    settled = true;
    releaseMicrophone();
    rejectPromise(error);
  };
  const stop = () => {
    stopRequested = true;
    if (recorder?.state === 'recording') {
      try { recorder.stop(); } catch { fail(new Error('녹음을 끝내지 못했습니다. 다시 시도하세요.')); }
    }
  };
  const abort = () => {
    if (settled) return;
    cancelled = true;
    settled = true;
    releaseMicrophone();
    uploadController?.abort();
    if (recorder?.state === 'recording') {
      try { recorder.stop(); } catch { /* the job is already cancelled */ }
    }
    rejectPromise(new Error('음성 녹음을 취소했습니다.'));
  };

  (async () => {
    if (!speechAvailable({ mediaDevices, MediaRecorderClass })) {
      fail(new Error('이 브라우저에서는 마이크 녹음을 사용할 수 없습니다. 직접 입력하세요.'));
      return;
    }
    if (typeof requestTranscription !== 'function') {
      fail(new Error('음성 전사 서비스가 준비되지 않았습니다. 직접 입력하세요.'));
      return;
    }
    try {
      stream = await mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (settled) { releaseMicrophone(); return; }
      const mimeType = chooseMimeType(MediaRecorderClass);
      recorder = mimeType ? new MediaRecorderClass(stream, { mimeType }) : new MediaRecorderClass(stream);
      recorder.ondataavailable = event => { if (event.data?.size > 0) chunks.push(event.data); };
      recorder.onerror = () => fail(new Error('녹음 중 오류가 발생했습니다. 다시 시도하거나 직접 입력하세요.'));
    recorder.onstop = async () => {
      releaseMicrophone();
      if (settled || cancelled) return;
      if (!chunks.length) { fail(new Error('녹음된 음성이 없습니다. 다시 시도하세요.')); return; }
      onState('uploading');
      uploadController = new AbortController();
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        const transcript = await requestTranscription(blob, uploadController.signal);
        if (settled) return;
        settled = true;
        resolvePromise(transcript);
      } catch (error) {
        if (settled) return;
        settled = true;
        rejectPromise(error);
      }
      };
      recorder.start();
      onState('recording');
      stopTimer = setTimeout(stop, maxDurationMs);
      if (stopRequested) stop();
    } catch (error) {
      fail(mediaError(error));
    }
  })();

  return { promise, stop, abort };
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const mimeType = blob.type || 'application/octet-stream';
  return { dataUrl: `data:${mimeType};base64,${btoa(binary)}`, mimeType };
}

async function responseJson(response) {
  try { return await response.json(); }
  catch { return {}; }
}

export async function transcribeAudio(blob, requestId, fetchImpl = fetch, signal) {
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  const audio = await blobToDataUrl(blob);
  const response = await fetchImpl('/api/stt/transcribe', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId, ...audio }),
  });
  const body = await responseJson(response);
  if (response.status === 415 && body.code === 'unsupported_audio') {
    throw new Error('녹음 형식 또는 크기가 지원 범위를 벗어났습니다. 짧게 다시 녹음하거나 직접 입력하세요.');
  }
  if (!response.ok) throw new Error(body.message || '음성을 처리하지 못했습니다. 직접 입력하거나 다시 시도하세요.');
  if (typeof body.text !== 'string' || !body.text.trim()) throw new Error('음성에서 말소리를 찾지 못했습니다. 다시 말하거나 직접 입력하세요.');
  const finishedAt = globalThis.performance?.now?.() ?? Date.now();
  return {
    text: body.text.trim(),
    serverElapsedMs: Number.isFinite(body.elapsedMs) ? body.elapsedMs : null,
    roundTripMs: Math.round(finishedAt - startedAt),
  };
}

export async function checkSttService(fetchImpl = fetch) {
  const response = await fetchImpl('/api/stt/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('음성 입력 연결 상태를 확인하지 못했습니다.');
  const body = await responseJson(response);
  return body.available === true;
}
