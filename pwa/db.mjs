import { emptyData, validateBackup } from './domain.mjs';

const DATABASE = 'voice-fitness-pwa';
const STORE = 'app';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('저장소를 열지 못했습니다.'));
  });
}

function transaction(mode, callback) {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = callback(tx.objectStore(STORE));
    let value;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => { database.close(); resolve(value); };
    tx.onerror = () => { database.close(); reject(tx.error ?? new Error('기록 저장에 실패했습니다.')); };
    tx.onabort = () => { database.close(); reject(tx.error ?? new Error('기록 저장이 중단됐습니다.')); };
  }));
}

export async function loadData() {
  const stored = await transaction('readonly', store => store.get('main'));
  return stored === undefined ? emptyData() : validateBackup(stored);
}

export async function saveData(data) {
  const valid = validateBackup(data);
  await transaction('readwrite', store => store.put(valid, 'main'));
}
