// ==========================================================================
// J.A.R.V.I.S. Client-Side Application Logic
// ==========================================================================

// DOM Elements
const cpuBar = document.querySelector('.cpu-bar');
const ramBar = document.querySelector('.ram-bar');
const cpuValue = document.getElementById('cpu-value');
const ramValue = document.getElementById('ram-value');
const cpuFill = document.querySelector('.cpu-fill');
const ramDetails = document.getElementById('ram-details');
const platformValue = document.getElementById('platform-value');
const uptimeValue = document.getElementById('uptime-value');

const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');

const weatherTemp = document.getElementById('weather-temp');
const weatherDesc = document.getElementById('weather-desc');
const weatherHumidity = document.getElementById('weather-humidity');
const weatherWind = document.getElementById('weather-wind');
const weatherPressure = document.getElementById('weather-pressure');

const netUp = document.getElementById('net-up');
const netDown = document.getElementById('net-down');
const upFill = document.querySelector('.up-fill');
const downFill = document.querySelector('.down-fill');

const barGraph = document.getElementById('bar-graph');
const arcReactor = document.getElementById('arc-reactor');
const speechBtn = document.getElementById('speech-btn');
const voiceStatus = document.getElementById('voice-status');
const consoleLogs = document.getElementById('console-logs');
const consoleForm = document.getElementById('console-form');
const commandInput = document.getElementById('command-input');

// Audio Context & Analysis
let audioCtx = null;
let analyser = null;
let audioSource = null;
const canvas = document.getElementById('waveform-canvas');
const canvasCtx = canvas.getContext('2d');

// Configure canvas dimensions
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = 45;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialize Speech Recognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    speechBtn.classList.add('listening');
    speechBtn.querySelector('.btn-text').innerText = 'ESCUCHANDO...';
    arcReactor.className = 'reactor-listening';
    voiceStatus.innerText = 'MICRÓFONO ACTIVO';
    addConsoleLog('SISTEMA', 'Micrófono abierto. Hable ahora, señor.', 'system');
  };

  recognition.onend = () => {
    isListening = false;
    speechBtn.classList.remove('listening');
    speechBtn.querySelector('.btn-text').innerText = 'INICIAR COMANDO';
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    addConsoleLog('USUARIO', transcript, 'user');
    await sendCommandToJarvis(transcript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    addConsoleLog('ERROR', `Error de reconocimiento: ${event.error}`, 'error');
    setReactorState('idle');
  };
} else {
  speechBtn.style.display = 'none';
  addConsoleLog('SISTEMA', 'El reconocimiento de voz no está soportado en este navegador. Utilice la consola escrita.', 'error');
}

// Set Reactor Animation State
function setReactorState(state) {
  if (state === 'idle') {
    arcReactor.className = 'reactor-idle';
    voiceStatus.innerText = 'NÚCLEO EN ESPERA';
  } else if (state === 'listening') {
    arcReactor.className = 'reactor-listening';
    voiceStatus.innerText = 'MICRÓFONO ACTIVO';
  } else if (state === 'processing') {
    arcReactor.className = 'reactor-speaking'; // rotate fast
    voiceStatus.innerText = 'PROCESANDO DATOS';
  } else if (state === 'speaking') {
    arcReactor.className = 'reactor-speaking';
    voiceStatus.innerText = 'JARVIS HABLANDO';
  }
}

// Log message to terminal console
function addConsoleLog(sender, message, type = 'system') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  entry.innerText = `[${timestamp}] [${sender}] ${message}`;
  
  consoleLogs.appendChild(entry);
  consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// Poll System Stats
async function updateSystemStats() {
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();

    // 251.2 is the SVG circle length (2 * PI * r)
    // Update CPU Circular Progress
    const cpuDashOffset = 251.2 - (251.2 * data.cpu) / 100;
    cpuBar.style.strokeDashoffset = cpuDashOffset;
    cpuValue.innerText = `${data.cpu}%`;
    cpuFill.style.width = `${data.cpu}%`;

    // Update RAM Circular Progress
    const ramDashOffset = 251.2 - (251.2 * data.ram) / 100;
    ramBar.style.strokeDashoffset = ramDashOffset;
    ramValue.innerText = `${data.ram}%`;
    ramDetails.innerText = `${data.ramUsedGB} / ${data.ramTotalGB} GB`;

    // Update Platform and Uptime
    const pfName = data.platform === 'win32' ? 'WINDOWS OS' : data.platform.toUpperCase();
    platformValue.innerText = pfName;
    
    const hrs = Math.floor(data.uptime / 3600);
    const mins = Math.floor((data.uptime % 3600) / 60);
    uptimeValue.innerText = `${hrs}h ${mins}m`;

  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

// Clock updates
function updateClock() {
  const now = new Date();
  
  // Format Time
  const timeStr = now.toLocaleTimeString('es-ES', { hour12: false });
  clockTime.innerText = timeStr;

  // Format Date
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const months = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  
  const dayName = days[now.getDay()];
  const dayNum = now.getDate();
  const monthName = months[now.getMonth()];
  
  clockDate.innerText = `${dayName}, ${dayNum} DE ${monthName}`;
}

// Simulation of other telemetry
function updateTelemetry() {
  // Random network speeds
  const upSpeed = (Math.random() * 5 + 0.1).toFixed(1);
  const downSpeed = (Math.random() * 15 + 0.5).toFixed(1);
  
  netUp.innerText = `${upSpeed} MB/s`;
  netDown.innerText = `${downSpeed} MB/s`;

  // Scale lines
  upFill.style.width = `${Math.min((upSpeed / 10) * 100, 100)}%`;
  downFill.style.width = `${Math.min((downSpeed / 30) * 100, 100)}%`;

  // Randomize the frequency bars in left panel
  const bars = barGraph.querySelectorAll('.graph-bar');
  bars.forEach(bar => {
    const h = Math.floor(Math.random() * 70 + 20);
    bar.style.height = `${h}%`;
  });

  // Weather slight fluctuation
  const baseTemp = 30;
  const currentTemp = (baseTemp + (Math.random() * 0.4 - 0.2)).toFixed(1);
  weatherTemp.innerText = `${currentTemp}°C`;
}

// Audio context initializer
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Draw Loop for Waveform Canvas
function drawWaveform() {
  requestAnimationFrame(drawWaveform);
  
  const bufferLength = analyser ? analyser.frequencyBinCount : 128;
  const dataArray = new Uint8Array(bufferLength);
  
  if (analyser) {
    analyser.getByteTimeDomainData(dataArray);
  } else {
    // Generate simulated background noise wave
    for (let i = 0; i < bufferLength; i++) {
      dataArray[i] = 128 + (Math.sin(i * 0.15 + Date.now() * 0.015) * 5 * Math.random());
    }
  }

  canvasCtx.fillStyle = 'rgba(2, 9, 20, 0.4)';
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Set line color depending on JARVIS state
  const classState = arcReactor.className;
  if (classState.includes('reactor-listening')) {
    canvasCtx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
    canvasCtx.shadowColor = 'rgba(255, 60, 60, 0.5)';
  } else {
    canvasCtx.strokeStyle = 'rgba(0, 210, 255, 0.85)';
    canvasCtx.shadowColor = 'rgba(0, 210, 255, 0.5)';
  }
  
  canvasCtx.lineWidth = 2;
  canvasCtx.shadowBlur = 6;
  canvasCtx.beginPath();

  const sliceWidth = canvas.width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;

    if (i === 0) {
      canvasCtx.moveTo(x, y);
    } else {
      canvasCtx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  canvasCtx.lineTo(canvas.width, canvas.height / 2);
  canvasCtx.stroke();
  canvasCtx.shadowBlur = 0;
}

// Convert base64 voice feedback to AudioBuffer and play it
async function playVoiceResponse(base64Audio) {
  initAudio();
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  try {
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
    
    // Stop any current source if playing
    if (audioSource) {
      try { audioSource.stop(); } catch (e) {}
    }

    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    
    audioSource.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    setReactorState('speaking');
    audioSource.start(0);

    audioSource.onended = () => {
      setReactorState('idle');
    };
  } catch (e) {
    console.error('Error decoding audio response:', e);
    // Fallback if audio fails to decode
    speakWithBrowserSynthesis(lastReplyText);
  }
}

// Fallback: Browser Web Speech API Synthesis
let lastReplyText = '';
function speakWithBrowserSynthesis(text) {
  if ('speechSynthesis' in window) {
    // Stop speaking
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.pitch = 0.85; // Slightly deeper, robotic/intelligent
    utterance.rate = 1.05;

    // Connect simulated visualizer during speech
    setReactorState('speaking');
    
    // Simulate audio analyser values
    const simInterval = setInterval(() => {
      if (analyser) {
        // Just inject mock frequencies into visualizer if needed,
        // but drawWaveform draws active noise if no real analyser node is feeding data.
      }
    }, 100);

    utterance.onend = () => {
      clearInterval(simInterval);
      setReactorState('idle');
    };

    utterance.onerror = () => {
      clearInterval(simInterval);
      setReactorState('idle');
    };

    window.speechSynthesis.speak(utterance);
  } else {
    addConsoleLog('JARVIS', 'La síntesis de voz no está disponible.', 'error');
    setReactorState('idle');
  }
}

// Send user command to the Backend API
async function sendCommandToJarvis(commandText) {
  setReactorState('processing');
  addConsoleLog('SISTEMA', 'Transmitiendo comando a red neuronal...', 'system');

  try {
    const response = await fetch('/api/voice-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command: commandText })
    });

    if (!response.ok) throw new Error('Network error');
    
    const data = await response.json();
    lastReplyText = data.reply;
    
    addConsoleLog('JARVIS', data.reply, 'jarvis');

    if (data.action) {
      addConsoleLog('SISTEMA', `Acción ejecutada: [${data.action.type.toUpperCase()}] ${data.action.param || ''}`, 'success');
    }

    if (data.audio) {
      await playVoiceResponse(data.audio);
    } else {
      // Fallback synthesis if ElevenLabs generated no audio (or is disabled)
      speakWithBrowserSynthesis(data.reply);
    }

  } catch (err) {
    console.error('Error sending command:', err);
    addConsoleLog('ERROR', 'Error de red al conectar con J.A.R.V.I.S.', 'error');
    setReactorState('idle');
  }
}

// Event Listeners
speechBtn.addEventListener('click', () => {
  initAudio();
  if (isListening) {
    recognition.stop();
  } else {
    // Reset browser synthesis if it's currently speaking
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    recognition.start();
  }
});

arcReactor.addEventListener('click', () => {
  initAudio();
  if (SpeechRecognition) {
    if (isListening) {
      recognition.stop();
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      recognition.start();
    }
  }
});

// Text form submission
consoleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = commandInput.value.trim();
  if (!text) return;
  
  commandInput.value = '';
  addConsoleLog('USUARIO', text, 'user');
  
  // Stop speaking if talking
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (audioSource) {
    try { audioSource.stop(); } catch (err) {}
  }
  
  initAudio();
  await sendCommandToJarvis(text);
});

// Initialization
function init() {
  updateClock();
  updateSystemStats();
  updateTelemetry();
  
  // Start loops
  setInterval(updateClock, 1000);
  setInterval(updateSystemStats, 2000);
  setInterval(updateTelemetry, 1000);
  
  drawWaveform();
  
  addConsoleLog('SISTEMA', 'Sistemas cargados completamente. Bienvenidos.', 'success');
  addConsoleLog('SISTEMA', 'Haga clic en la pantalla para activar la escucha de fondo y el detector de aplausos.', 'system');
}

// Background listening and double clap detection
let lastClapTime = 0;
let micStream = null;

async function startBackgroundListening() {
  try {
    initAudio();
    if (micStream) return; // already listening
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream = stream;
    
    // Create a separate stream source and analyser for background audio analysis
    const source = audioCtx.createMediaStreamSource(stream);
    const bgAnalyser = audioCtx.createAnalyser();
    bgAnalyser.fftSize = 256;
    source.connect(bgAnalyser);
    
    const bufferLength = bgAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    addConsoleLog('SISTEMA', 'Escucha de fondo activada. Listo para recibir comandos y doble aplauso.', 'success');
    
    // Check volume peaks every 20ms
    setInterval(() => {
      bgAnalyser.getByteTimeDomainData(dataArray);
      let maxVal = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = Math.abs(dataArray[i] - 128);
        if (val > maxVal) maxVal = val;
      }
      const volume = maxVal / 128;
      
      const isSpeakingState = arcReactor.className.includes('reactor-speaking');
      const now = Date.now();
      
      // Spike threshold of 0.45, with a 180ms-800ms double clap window
      if (volume > 0.45 && !isSpeakingState && (now - lastClapTime) > 180) {
        const elapsed = now - lastClapTime;
        if (elapsed < 800) {
          triggerDoubleClap();
        }
        lastClapTime = now;
      }
    }, 20);
    
  } catch (err) {
    console.warn('Microphone access denied or error:', err);
    addConsoleLog('SISTEMA', 'Acceso al micrófono denegado para escucha de fondo.', 'error');
  }
}

async function triggerDoubleClap() {
  addConsoleLog('SISTEMA', 'Doble aplauso detectado. Solicitando pantalla completa...', 'success');
  
  // Try frontend fullscreen
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      console.log('Fullscreen rejected by browser. Relying on backend OS script.');
    });
  } else {
    document.exitFullscreen().catch(() => {});
  }
  
  // Call backend to trigger PowerShell OS F11 keypress bypass
  try {
    await fetch('/api/double-clap', { method: 'POST' });
  } catch (err) {
    console.error('Failed to notify backend:', err);
  }
}

// Start background listening on first interaction
document.body.addEventListener('click', () => {
  startBackgroundListening();
}, { once: true });

window.onload = init;
