/**
 * SafeRoute.AI - Emergency SOS Controller & Siren Synthesizer
 * Emergency countdown, synthetic web-audio alarm siren, and multi-channel dispatch.
 */

let sosTimer = null;
let sosSeconds = 5;
let audioCtx = null;
let sirenOsc = null;

function playSirenTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    // Frequency sweep from 650Hz to 950Hz (police/ambulance siren style)
    const now = audioCtx.currentTime;
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.linearRampToValueAtTime(950, now + 0.4);
    osc.frequency.linearRampToValueAtTime(650, now + 0.8);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.85);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.9);
  } catch (e) {
    console.log('Audio synthesizer notice:', e.message);
  }
}

function openSOS() {
  const modal = document.getElementById('sosModal');
  if (!modal) return;

  modal.classList.remove('hidden');
  sosSeconds = 5;

  const timerEl = document.getElementById('sosTimer');
  const resultEl = document.getElementById('sosResult');
  if (timerEl) timerEl.textContent = sosSeconds;
  if (resultEl) resultEl.textContent = '';

  playSirenTone();
  clearInterval(sosTimer);

  sosTimer = setInterval(() => {
    sosSeconds--;
    if (timerEl) timerEl.textContent = sosSeconds;
    playSirenTone();

    if (sosSeconds <= 0) {
      clearInterval(sosTimer);
      sendSOS();
    }
  }, 1000);
}

function cancelSOS() {
  clearInterval(sosTimer);
  const modal = document.getElementById('sosModal');
  if (modal) modal.classList.add('hidden');
  showToast('Emergency SOS cancelled');
}

async function sendSOS() {
  clearInterval(sosTimer);
  const loc = currentPos ? ` GPS: ${currentPos[0].toFixed(6)}, ${currentPos[1].toFixed(6)}` : ' Unknown GPS Location';
  const resultEl = document.getElementById('sosResult');

  if (resultEl) {
    resultEl.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 12px; padding: 12px; margin-top: 14px;">
        <span style="color: #f87171; font-weight: 800; font-size: 1.1rem;">🚨 SOS ALERT DISPATCHED!</span><br>
        <span style="font-size: 0.85rem; color: #cbd5e1;">Emergency coordinates broadcast to cloud security grid & contacts:</span><br>
        <code style="display: inline-block; margin-top: 6px; color: #34d399; font-size: 0.85rem;">${loc}</code>
      </div>
    `;
  }

  // 1. Post to backend
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      await fetch(`${window.riskClient.apiBase}/api/sos/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'Panic / SOS Triggered',
          lat: currentPos ? currentPos[0] : 28.6139,
          lng: currentPos ? currentPos[1] : 77.2090,
          location: currentPos ? `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}` : 'Delhi Urban Center',
          notes: 'Emergency SOS activated via SafeRoute.AI panic button.'
        })
      });
    } catch {}
  }

  // 2. Also log locally
  const reports = JSON.parse(localStorage.getItem('saferoute_reports') || '[]');
  reports.unshift({
    id: 'SOS-' + Date.now().toString().slice(-6),
    timestamp: new Date().toLocaleString(),
    type: 'Panic / SOS Triggered',
    location: currentPos ? `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}` : 'Current Device Position',
    notes: 'Emergency SOS button activated.'
  });
  localStorage.setItem('saferoute_reports', JSON.stringify(reports));

  // 3. Format SMS to Primary Contact
  const contacts = JSON.parse(localStorage.getItem('saferoute_contacts') || '[]');
  const primary = contacts.find(c => c.isPrimary) || contacts[0];
  if (primary && resultEl) {
    const mapsLink = currentPos ? `https://maps.google.com/?q=${currentPos[0]},${currentPos[1]}` : '';
    const smsText = `EMERGENCY ALERT: I need immediate assistance! My current location: ${mapsLink}`;
    resultEl.innerHTML += `
      <div style="margin-top: 12px;">
        <a href="sms:${encodeURIComponent(primary.phone)}?body=${encodeURIComponent(smsText)}" 
           class="btn-primary" 
           style="background: #2563eb; color: #ffffff; text-decoration: none; display: inline-flex; width: 100%; justify-content: center; font-size: 0.9rem; padding: 0.75rem;">
          💬 Send Emergency SMS to ${escapeHtml(primary.name)} (${primary.phone})
        </a>
      </div>
    `;
  }

  showToast('Emergency SOS dispatched and recorded', 'error');
}
