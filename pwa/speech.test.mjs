import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAndTranscribe, transcribeAudio, checkSttService } from './speech.mjs';

function recorderMocks() {
  const stoppedTracks = [];
  const stream = { getTracks: () => [{ stop() { stoppedTracks.push(true); } }] };
  const calls = { requested: null, uploaded: [], states: [] };
  class FakeRecorder {
    static isTypeSupported(type) { return type === 'audio/mp4'; }
    constructor(_stream, options) { calls.requested = options; this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  const mediaDevices = { async getUserMedia() { return stream; } };
  return { FakeRecorder, mediaDevices, stoppedTracks, calls };
}

test('records one audio clip, releases the microphone, and uploads only after stop', async () => {
  const { FakeRecorder, mediaDevices, stoppedTracks, calls } = recorderMocks();
  const job = recordAndTranscribe({
    mediaDevices, MediaRecorderClass: FakeRecorder,
    async requestTranscription(blob) { calls.uploaded.push(blob); return '여덟 개'; },
    onState: state => calls.states.push(state),
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.uploaded.length, 0);
  job.stop();
  assert.equal(await job.promise, '여덟 개');
  assert.equal(calls.uploaded.length, 1);
  assert.equal(calls.uploaded[0].type, 'audio/mp4');
  assert.deepEqual(calls.requested, { mimeType: 'audio/mp4' });
  assert.deepEqual(calls.states, ['recording', 'uploading']);
  assert.equal(stoppedTracks.length, 1);
});

test('cancel releases the microphone without uploading audio', async () => {
  const { FakeRecorder, mediaDevices, stoppedTracks, calls } = recorderMocks();
  const job = recordAndTranscribe({
    mediaDevices, MediaRecorderClass: FakeRecorder,
    async requestTranscription(blob) { calls.uploaded.push(blob); return '8개'; },
  });
  await new Promise(resolve => setImmediate(resolve));
  job.abort();
  await assert.rejects(job.promise, /취소/);
  assert.equal(stoppedTracks.length, 1);
  assert.equal(calls.uploaded.length, 0);
});

test('cancel during upload aborts the request and does not produce a transcript', async () => {
  const { FakeRecorder, mediaDevices, calls } = recorderMocks();
  let uploadSignal;
  const job = recordAndTranscribe({
    mediaDevices, MediaRecorderClass: FakeRecorder,
    requestTranscription(_blob, signal) {
      uploadSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    },
    onState: state => calls.states.push(state),
  });
  await new Promise(resolve => setImmediate(resolve));
  job.stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.states.at(-1), 'uploading');
  job.abort();
  await assert.rejects(job.promise, /취소/);
  assert.equal(uploadSignal.aborted, true);
});

test('transcription sends the clip to the same-origin endpoint with the MIME type', async () => {
  let sent;
  const result = await transcribeAudio(new Blob(['audio'], { type: 'audio/mp4' }), 'request-1', async (url, options) => {
    sent = { url, options };
    return new Response(JSON.stringify({ requestId: 'request-1', text: '8개', elapsedMs: 0 }), { status: 200 });
  });
  assert.equal(result.text, '8개');
  assert.equal(result.serverElapsedMs, 0);
  assert.ok(result.roundTripMs >= result.serverElapsedMs);
  assert.equal(sent.url, '/api/stt/transcribe');
  assert.equal(sent.options.credentials, 'same-origin');
  assert.equal(JSON.parse(sent.options.body).mimeType, 'audio/mp4');
});

test('unsupported recording responses tell the user the audio format or size was rejected', async () => {
  await assert.rejects(
    transcribeAudio(new Blob(['audio'], { type: 'audio/mp4' }), 'request-unsupported', async () =>
      new Response(JSON.stringify({ code: 'unsupported_audio' }), { status: 415 })),
    /녹음 형식 또는 크기/,
  );
});

test('service availability check no longer prompts for device registration', async () => {
  let request;
  const available = await checkSttService(async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ available: true }), { status: 200 });
  });
  assert.equal(available, true);
  assert.equal(request.url, '/api/stt/status');
  assert.equal(request.options.credentials, 'same-origin');
});
