const VERSES = [
  "וַתֹּ֥אמֶר צִיּ֖וֹן עֲזָבַ֣נִי יְהֹוָ֑ה וַאדֹנָ֖י שְׁכֵחָֽנִי׃",
  "הֲתִשְׁכַּ֤ח אִשָּׁה֙ עוּלָ֔הּ מֵרַחֵ֖ם בֶּן־בִּטְנָ֑הּ גַּם־אֵ֣לֶּה תִשְׁכַּ֔חְנָה וְאָנֹכִ֖י לֹ֥א אֶשְׁכָּחֵֽךְ׃",
  "הֵ֥ן עַל־כַּפַּ֖יִם חַקֹּתִ֑יךְ חוֹמֹתַ֥יִךְ נֶגְדִּ֖י תָּמִֽיד׃",
  "מִהֲר֖וּ בָּנָ֑יִךְ מְהָֽרְסַ֥יִךְ וּמַחֲרִיבַ֖יִךְ מִמֵּ֥ךְ יֵצֵֽאוּ׃"
];

const passage = document.querySelector('#passage');
const status = document.querySelector('#status');
const tropeToggle = document.querySelector('#trope-toggle');
const audioToggle = document.querySelector('#audio-toggle');
const dialog = document.querySelector('#recorder-dialog');
const phraseNode = document.querySelector('#recorder-phrase');
const recordButton = document.querySelector('#record-button');
const recordMissingButton = document.querySelector('#record-missing-button');
const rerecordButton = document.querySelector('#rerecord-button');
const playButton = document.querySelector('#play-button');
const deleteButton = document.querySelector('#delete-recording-button');
const SUPABASE_URL = 'https://fgomaujsdblpzxhnnqrg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JOUqLZDnfGu_yCa6k6FVDQ_AYwpr72i';
const SUPABASE_STORAGE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb21hdWpzZGJscHp4aG5ucXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjM3MjYsImV4cCI6MjA5OTgzOTcyNn0.1iMPI_7F_8ioNVnuThxqAKfMfD7G4NbyXilXZEERScw';
const GROUP_TABLE = 'vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1';
const RECORDING_TABLE = 'vivienne_haftorah_isaiah_49_14_17_group_recordings_v1';
const RECORDING_BUCKET = 'vivienne-haftorah-isaiah-49-14-17-group-recordings-v1';
let groups = [];
const recordings = new Map();
let remoteReady = false;
let showTrope = true;
let audioEnabled = true;
let selectedGroup = null;
let recorder = null;
let recorderStream = null;
let chunks = [];
let stopRecordingTimer = null;
let activeAudio = null;
let hoveredGroupId = null;
let activeVersePlayback = null;
let verseAudioContext = null;
let rerecordMode = false;

function wordsFor(verse) { return VERSES[verse - 14].split(/\s+/); }
function phraseFor(group) { return wordsFor(group.verse).slice(group.start, group.end + 1).join(' '); }
function displayText(text) { return showTrope ? text : text.replace(/[\u0591-\u05AF]/g, ''); }
function groupAt(verse, word) { return groups.find(group => group.verse === verse && word >= group.start && word <= group.end); }
function apiHeaders(extra = {}) { return { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...extra }; }
function recordingUrl(recording) { return `${SUPABASE_URL}/storage/v1/object/public/${RECORDING_BUCKET}/${recording.object_path}?v=${encodeURIComponent(recording.updated_at || recording.byte_size)}`; }
function recordingExtension(mimeType) { if (mimeType.includes('ogg')) return 'ogg'; if (mimeType.includes('mp4')) return 'mp4'; return 'webm'; }
function preferredRecordingType() { const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']; return types.find(type => MediaRecorder.isTypeSupported(type)) || ''; }
function missingRecordingGroups() { return groups.filter(group => group.verse >= 14 && group.verse <= 17 && !recordings.has(group.id)); }
function updateRecordingRepairControl() {
  const missing = missingRecordingGroups();
  recordMissingButton.hidden = !missing.length;
  recordMissingButton.textContent = missing.length === 1 ? 'Record missing audio' : `Record missing audio (${missing.length})`;
}
function setRerecordMode(enabled) {
  rerecordMode = enabled;
  rerecordButton.classList.toggle('active', enabled);
  rerecordButton.textContent = enabled ? 'Select a phrase…' : 'Re-record phrase';
  passage.classList.toggle('rerecord-mode', enabled);
  status.textContent = enabled
    ? 'Select the highlighted phrase whose audio you want to replace.'
    : 'Hover over a highlighted phrase to hear it, or select a verse number.';
}

async function uploadRecording(groupId, blob) {
  const mimeType = blob.type.split(';')[0] || 'audio/webm';
  const objectPath = `groups/${groupId}.${recordingExtension(mimeType)}`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${RECORDING_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_STORAGE_ANON_KEY, Authorization: `Bearer ${SUPABASE_STORAGE_ANON_KEY}`, 'Content-Type': mimeType, 'x-upsert': 'true' },
    body: blob
  });
  if (!upload.ok) throw new Error('Audio upload failed');
  const metadata = await fetch(`${SUPABASE_URL}/rest/v1/${RECORDING_TABLE}?on_conflict=highlight_group_id`, {
    method: 'POST', headers: apiHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ highlight_group_id: groupId, object_path: objectPath, mime_type: mimeType, byte_size: blob.size, updated_at: new Date().toISOString() })
  });
  if (!metadata.ok) throw new Error('Recording metadata save failed');
  const [saved] = await metadata.json(); recordings.set(groupId, saved);
}

async function loadRemoteState() {
  try {
    const [groupResponse, recordingResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/${GROUP_TABLE}?verse=gte.14&verse=lte.17&select=id,verse,start_word,end_word,color&order=id.asc`, { headers: apiHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/${RECORDING_TABLE}?select=highlight_group_id,object_path,mime_type,byte_size,updated_at`, { headers: apiHeaders() })
    ]);
    if (!groupResponse.ok || !recordingResponse.ok) throw new Error('Supabase load failed');
    groups = (await groupResponse.json()).map(item => ({ id: item.id, verse: item.verse, start: item.start_word, end: item.end_word, color: item.color }));
    recordings.clear(); (await recordingResponse.json()).forEach(item => recordings.set(item.highlight_group_id, item));
    remoteReady = true; render(); updateRecordingRepairControl();
    status.textContent = 'Hover over a highlighted phrase to hear it, or select a verse number.';
  } catch (error) {
    status.textContent = 'Saved phrases and recordings could not be loaded. Please refresh and try again.';
  }
}

function render() {
  passage.replaceChildren();
  VERSES.forEach((text, offset) => {
    const verse = offset + 14;
    const row = document.createElement('div'); row.className = 'verse-row'; row.dir = 'rtl';
    const number = document.createElement('button'); number.className = 'verse-number'; number.type = 'button'; number.textContent = verse; number.dataset.verse = verse; number.setAttribute('aria-label', `Play verse ${verse} phrase recordings`);
    const line = document.createElement('span'); line.className = 'verse-line'; line.lang = 'he'; line.dataset.verse = verse;
    wordsFor(verse).forEach((word, index) => {
      const group = groupAt(verse, index);
      const span = document.createElement('span'); span.className = 'word'; span.dataset.word = index; span.textContent = displayText(word);
      if (group) { span.classList.add(`highlight-${group.color}`); span.dataset.groupId = group.id; }
      line.append(span);
      if (index < wordsFor(verse).length - 1) {
        const space = document.createElement('span'); space.className = 'word-space'; space.textContent = ' ';
        if (group && group.end > index) { space.classList.add(`highlight-${group.color}`); space.dataset.groupId = group.id; }
        line.append(space);
      }
    });
    row.append(number, line); passage.append(row);
  });
}

passage.addEventListener('dblclick', event => event.preventDefault());

async function openGroup(id) {
  selectedGroup = groups.find(group => group.id === Number(id));
  if (!selectedGroup) return;
  phraseNode.textContent = displayText(phraseFor(selectedGroup));
  const exists = recordings.has(selectedGroup.id);
  playButton.disabled = !exists || !audioEnabled;
  deleteButton.disabled = !exists;
  recordButton.textContent = exists ? '● Record again' : '● Record';
  dialog.showModal();
}

recordButton.addEventListener('click', async () => {
  if (recorder?.state === 'recording') {
    recordButton.disabled = true;
    recordButton.textContent = 'Finishing…';
    status.textContent = 'Finishing the recording without clipping the final syllable…';
    stopRecordingTimer = setTimeout(() => {
      stopRecordingTimer = null;
      if (recorder?.state === 'recording') recorder.stop();
    }, 400);
    return;
  }
  try {
    const recordingGroup = selectedGroup;
    try {
      recorderStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
    } catch (error) {
      recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    chunks = [];
    const mimeType = preferredRecordingType();
    recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType, audioBitsPerSecond: 256000 } : undefined);
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      recorderStream.getTracks().forEach(track => track.stop());
      recordButton.disabled = true;
      const group = recordingGroup;
      try {
        await uploadRecording(group.id, new Blob(chunks, { type:recorder.mimeType || mimeType || 'audio/webm' }));
        updateRecordingRepairControl();
        recordButton.textContent = '● Record again'; playButton.disabled = !audioEnabled; deleteButton.disabled = false;
        status.textContent = `Recording saved to Supabase for verse ${group.verse}.`;
      } catch (error) { status.textContent = 'The recording could not be saved. Please record it again.'; }
      finally { recordButton.disabled = false; recordButton.classList.remove('recording'); }
    };
    recorder.start(1000); recordButton.classList.add('recording'); recordButton.textContent = '■ Stop';
    status.textContent = 'Recording in high quality with automatic voice processing disabled.';
  } catch { status.textContent = 'Microphone permission is needed to record.'; }
});

async function playGroup(group, mark = true, stillRelevant = () => true) {
  if (!audioEnabled) return false;
  const recording = recordings.get(group.id); if (!recording) return false;
  if (!stillRelevant()) return false;
  stopAudio();
  const url = recordingUrl(recording); activeAudio = new Audio(url);
  if (mark) passage.querySelectorAll(`[data-group-id="${group.id}"]`).forEach(node => node.classList.add('audio-active'));
  const playingAudio = activeAudio;
  await new Promise(resolve => { playingAudio.onended = resolve; playingAudio.onerror = resolve; playingAudio.play().catch(resolve); });
  if (activeAudio === playingAudio) {
    passage.querySelectorAll('.audio-active').forEach(node => node.classList.remove('audio-active'));
    activeAudio = null;
  }
  return true;
}
function stopVersePlayback(message = '') {
  if (!activeVersePlayback) return;
  activeVersePlayback.sources.forEach(source => { try { source.stop(); } catch {} });
  activeVersePlayback.timers.forEach(clearTimeout);
  activeVersePlayback.button.classList.remove('playing');
  activeVersePlayback.button.textContent = activeVersePlayback.verse;
  activeVersePlayback = null;
  if (message) status.textContent = message;
}

function stopAudio() {
  if (activeAudio) { activeAudio.pause(); activeAudio = null; }
  stopVersePlayback();
  passage.querySelectorAll('.audio-active').forEach(node => node.classList.remove('audio-active'));
}

function speechBounds(buffer) {
  const windowSize = Math.max(1, Math.floor(buffer.sampleRate * .01));
  const levels = [];
  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(start + windowSize, buffer.length);
    let sumSquares = 0, count = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      for (let index = start; index < end; index += 1) { sumSquares += samples[index] ** 2; count += 1; }
    }
    levels.push(Math.sqrt(sumSquares / Math.max(1, count)));
  }
  const threshold = Math.max(.003, Math.max(...levels) * .035);
  const first = levels.findIndex(level => level >= threshold);
  let last = levels.length - 1;
  while (last >= 0 && levels[last] < threshold) last -= 1;
  if (first < 0 || last < first) return { start: 0, duration: buffer.duration };
  const start = Math.max(0, first * windowSize / buffer.sampleRate - .01);
  const end = Math.min(buffer.duration, (last + 1) * windowSize / buffer.sampleRate + .02);
  return { start, duration: Math.max(.08, end - start) };
}

async function prepareVerseClip(group, context) {
  const response = await fetch(recordingUrl(recordings.get(group.id)));
  if (!response.ok) throw new Error('Recording download failed');
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  return { group, buffer, ...speechBounds(buffer) };
}

async function playTrimmedVerse(queue, button, verse) {
  stopAudio();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!verseAudioContext) {
    try { verseAudioContext = new AudioContextClass({ sampleRate: 48000 }); }
    catch { verseAudioContext = new AudioContextClass(); }
  }
  await verseAudioContext.resume();
  const token = Symbol('verse-playback');
  activeVersePlayback = { token, button, verse, sources: [], timers: [] };
  button.classList.add('playing'); button.textContent = '■';
  status.textContent = `Preparing verse ${verse}…`;
  const clips = await Promise.all(queue.filter(group => recordings.has(group.id)).map(group => prepareVerseClip(group, verseAudioContext)));
  if (activeVersePlayback?.token !== token) return;
  if (!clips.length) { stopVersePlayback(`Verse ${verse} has no phrase recordings yet.`); return; }
  let startAt = verseAudioContext.currentTime + .06;
  const finished = new Promise(resolve => {
    clips.forEach((clip, index) => {
      const source = verseAudioContext.createBufferSource();
      source.buffer = clip.buffer; source.connect(verseAudioContext.destination);
      source.start(startAt, clip.start, clip.duration);
      activeVersePlayback.sources.push(source);
      const delay = Math.max(0, (startAt - verseAudioContext.currentTime) * 1000);
      activeVersePlayback.timers.push(setTimeout(() => {
        if (activeVersePlayback?.token !== token) return;
        passage.querySelectorAll('.audio-active').forEach(node => node.classList.remove('audio-active'));
        passage.querySelectorAll(`[data-group-id="${clip.group.id}"]`).forEach(node => node.classList.add('audio-active'));
        status.textContent = `Playing verse ${verse}: phrase ${index + 1} of ${clips.length}.`;
      }, delay));
      if (index === clips.length - 1) source.onended = resolve;
      startAt += clip.duration + .075;
    });
  });
  await finished;
  if (activeVersePlayback?.token === token) {
    stopVersePlayback(`Verse ${verse} complete.`);
    passage.querySelectorAll('.audio-active').forEach(node => node.classList.remove('audio-active'));
  }
}
playButton.addEventListener('click', () => selectedGroup && playGroup(selectedGroup));
recordMissingButton.addEventListener('click', () => {
  const [group] = missingRecordingGroups();
  if (group) openGroup(group.id);
});
rerecordButton.addEventListener('click', () => setRerecordMode(!rerecordMode));
passage.addEventListener('mouseover', async event => {
  const target = event.target.closest('[data-group-id]');
  if (!target || !audioEnabled || rerecordMode) return;
  const id = Number(target.dataset.groupId);
  if (hoveredGroupId === id) return;
  hoveredGroupId = id;
  const group = groups.find(item => item.id === id);
  if (!group) return;
  const recording = recordings.get(id);
  if (hoveredGroupId !== id) return;
  if (!recording) {
    status.textContent = `This phrase in verse ${group.verse} has no recording yet. Use Record missing audio to record it.`;
    return;
  }
  status.textContent = `Playing the saved phrase in verse ${group.verse}.`;
  playGroup(group, true, () => hoveredGroupId === id);
});

passage.addEventListener('mouseout', event => {
  const target = event.target.closest('[data-group-id]');
  if (!target || Number(target.dataset.groupId) !== hoveredGroupId) return;
  const next = event.relatedTarget?.closest?.('[data-group-id]');
  if (next && Number(next.dataset.groupId) === hoveredGroupId) return;
  hoveredGroupId = null;
  stopAudio();
});

passage.addEventListener('click', async event => {
  const phrase = event.target.closest('[data-group-id]');
  if (rerecordMode && phrase) {
    const groupId = Number(phrase.dataset.groupId);
    setRerecordMode(false);
    openGroup(groupId);
    event.preventDefault();
    return;
  }
  const button = event.target.closest('.verse-number'); if (!button || !audioEnabled) return;
  const verse = Number(button.dataset.verse);
  if (activeVersePlayback?.verse === verse) { stopVersePlayback(`Verse ${verse} playback stopped.`); return; }
  const queue = groups.filter(group => group.verse === verse).sort((a,b) => a.start - b.start);
  if (!queue.length) { status.textContent = `Verse ${verse} has no phrase recordings yet.`; return; }
  try { await playTrimmedVerse(queue, button, verse); }
  catch (error) { stopVersePlayback(`A recording in verse ${verse} could not be played.`); }
});

tropeToggle.addEventListener('click', () => { stopAudio(); showTrope = !showTrope; tropeToggle.classList.toggle('active', showTrope); tropeToggle.setAttribute('aria-pressed', String(showTrope)); render(); if (selectedGroup) phraseNode.textContent = displayText(phraseFor(selectedGroup)); });
audioToggle.addEventListener('change', () => {
  audioEnabled = audioToggle.checked;
  if (!audioEnabled) stopAudio();
  playButton.disabled = !audioEnabled || !selectedGroup || !recordings.has(selectedGroup.id);
});
dialog.addEventListener('close', () => {
  if (stopRecordingTimer) { clearTimeout(stopRecordingTimer); stopRecordingTimer = null; }
  if (recorder?.state === 'recording') recorder.stop();
  selectedGroup = null;
});
render();
loadRemoteState();
