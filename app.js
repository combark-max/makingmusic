/**
 * HumTune - App Logic
 */

// 1. Constants & State
const NOTE_NAMES_KR = ["도", "도#", "레", "레#", "미", "파", "파#", "솔", "솔#", "라", "라#", "시"];
let audioContext = null;
let analyser = null;
let microphone = null;
let isRecording = false;
let recordedMelody = []; // Stores { note, frequency, time }
let animationId = null;

// 2. DOM Elements
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const clearBtn = document.getElementById('clear-btn');
const melodyList = document.getElementById('melody-list');
const currentNoteDisplay = document.getElementById('current-note');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

// 3. Setup Canvas
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// 4. Pitch Detection Logic
async function startRecording() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        microphone.connect(analyser);

        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.text').textContent = '녹음 중지';
        melodyList.innerHTML = ''; // Clear for new recording
        recordedMelody = [];
        
        updatePitch();
    } catch (err) {
        console.error('Microphone access denied:', err);
        alert('마이크 권한이 필요합니다.');
    }
}

function stopRecording() {
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.querySelector('.text').textContent = '녹음 시작';
    cancelAnimationFrame(animationId);
    
    if (microphone) {
        microphone.mediaStream.getTracks().forEach(track => track.stop());
    }

    if (recordedMelody.length > 0) {
        playBtn.disabled = false;
    }

    currentNoteDisplay.textContent = '-';
}

function updatePitch() {
    if (!isRecording) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    // Use pitchy to find pitch
    const [pitch, clarity] = Pitchy.findPitch(buffer, audioContext.sampleRate);

    // Clarity threshold to filter background noise
    if (clarity > 0.9 && pitch > 50 && pitch < 2000) {
        const noteData = getNoteFromFrequency(pitch);
        currentNoteDisplay.textContent = noteData.name;
        
        // Add to melody if it's a "new" note or significant change
        addNoteToMelody(noteData);
    } else {
        currentNoteDisplay.textContent = '-';
    }

    drawVisualizer(buffer);
    animationId = requestAnimationFrame(updatePitch);
}

// 5. Helper Functions
function getNoteFromFrequency(frequency) {
    const semiTone = 12 * (Math.log(frequency / 440) / Math.log(2));
    const noteIdx = Math.round(semiTone) + 69; // MIDI Note
    const name = NOTE_NAMES_KR[noteIdx % 12];
    const octave = Math.floor(noteIdx / 12) - 1;
    return { name, octave, frequency, midi: noteIdx };
}

function addNoteToMelody(noteData) {
    const lastNote = recordedMelody[recordedMelody.length - 1];
    
    // Simple debouncing: only add if the note is different from the last one
    // or if a certain time has passed (not implemented here for simplicity)
    if (!lastNote || lastNote.name !== noteData.name) {
        recordedMelody.push({
            ...noteData,
            time: audioContext.currentTime
        });
        
        const chip = document.createElement('div');
        chip.className = 'note-chip';
        chip.textContent = noteData.name;
        melodyList.appendChild(chip);
        
        // Auto-scroll melody list
        melodyList.scrollTop = melodyList.scrollHeight;
    }
}

function drawVisualizer(buffer) {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#ffca28';
    canvasCtx.beginPath();

    const sliceWidth = canvas.width / buffer.length;
    let x = 0;

    for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i] * 0.5;
        const y = (v + 1) * canvas.height / 2;

        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
        x += sliceWidth;
    }

    canvasCtx.stroke();
}

// 6. Playback Logic
function playMelody() {
    if (recordedMelody.length === 0) return;
    
    const now = audioContext.currentTime;
    recordedMelody.forEach((note, index) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.frequency, now + (index * 0.4));
        
        gain.gain.setValueAtTime(0.3, now + (index * 0.4));
        gain.gain.exponentialRampToValueAtTime(0.01, now + (index * 0.4) + 0.3);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start(now + (index * 0.4));
        osc.stop(now + (index * 0.4) + 0.3);
    });
}

// 7. Event Listeners
recordBtn.addEventListener('click', () => {
    if (isRecording) stopRecording();
    else startRecording();
});

playBtn.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    playMelody();
});

clearBtn.addEventListener('click', () => {
    recordedMelody = [];
    melodyList.innerHTML = '<p class="placeholder">허밍을 하면 여기에 계이름이 나타납니다.</p>';
    playBtn.disabled = true;
    currentNoteDisplay.textContent = '-';
});
