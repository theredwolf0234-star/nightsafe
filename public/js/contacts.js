/**
 * SafeRoute.AI - Trusted Contacts Manager
 * Syncs contacts with backend REST API while retaining local offline resilience.
 */

const LOCAL_STORAGE_KEY = 'saferoute_contacts';

async function loadContacts() {
  const container = document.getElementById('contactsList');
  if (!container) return;

  let contacts = [];

  // Try fetching from backend first
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      const resp = await fetch(`${window.riskClient.apiBase}/api/contacts`);
      if (resp.ok) {
        const data = await resp.json();
        contacts = data.contacts || [];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(contacts));
      }
    } catch (e) {
      console.warn('[Contacts] Backend sync failed, using local cache:', e);
    }
  }

  // Fallback to local storage
  if (!contacts.length) {
    contacts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }

  // If completely empty, provide defaults
  if (!contacts.length) {
    contacts = [
      { id: 'c-101', name: 'Tannu Gupta', phone: '8527252722', rel: 'Friend', isPrimary: true },
      { id: 'c-102', name: 'Home Emergency Guardian', phone: '9811002233', rel: 'Family', isPrimary: false }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(contacts));
  }

  renderContacts(contacts);
}

function getCleanPhoneNumber(phone) {
  return phone.replace(/[^\d+]/g, '');
}

function getWhatsAppNumber(phone) {
  let digits = phone.replace(/\D/g, '');
  // Default to India (+91) if a standard 10-digit mobile number is entered
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return digits;
}

function copyContactAlert(name, phone) {
  const loc = (typeof currentPos !== 'undefined' && currentPos)
    ? `https://maps.google.com/?q=${currentPos[0]},${currentPos[1]}`
    : 'Delhi Urban Grid (Live GPS)';
  const msg = `EMERGENCY ALERT via Women's Safety: I need assistance! My live location: ${loc}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast(`📍 Emergency alert for ${name} copied to clipboard!`);
    }).catch(() => {
      prompt('Copy emergency message:', msg);
    });
  } else {
    prompt('Copy emergency message:', msg);
  }
}

function renderContacts(contacts) {
  const container = document.getElementById('contactsList');
  if (!container) return;

  if (!contacts.length) {
    container.innerHTML = '<p class="text-slate-500 text-sm">No trusted contacts added yet.</p>';
    return;
  }

  const loc = (typeof currentPos !== 'undefined' && currentPos)
    ? `https://maps.google.com/?q=${currentPos[0]},${currentPos[1]}`
    : '';
  const defaultMsg = loc
    ? `Emergency! I am sharing my location via Women's Safety: ${loc}`
    : "Emergency! I am sharing my location via Women's Safety";

  container.innerHTML = contacts.map(c => {
    const cleanPhone = getCleanPhoneNumber(c.phone);
    const waNumber = getWhatsAppNumber(c.phone);
    const smsLink = `sms:${cleanPhone}?body=${encodeURIComponent(defaultMsg)}`;
    const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(defaultMsg)}`;

    return `
    <div class="card" style="padding: 1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.75rem;">
      <div>
        <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(c.name)} ${c.isPrimary ? '<span style="font-size: 10px; background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">PRIMARY</span>' : ''}</div>
        <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 2px;">
          ${escapeHtml(c.phone)} • ${escapeHtml(c.rel || 'Contact')}
        </div>
      </div>
      <div style="display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap;">
        <a href="tel:${cleanPhone}" class="card" title="Direct Phone Call" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; font-weight: 600; text-decoration: none; color: #38bdf8;">📞 Call</a>
        <a href="${smsLink}" class="card" title="Send SMS (Mobile / Phone Link)" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; font-weight: 600; text-decoration: none; color: #34d399;">💬 SMS</a>
        <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="card" title="Send via WhatsApp Web or Mobile" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; font-weight: 600; text-decoration: none; color: #22c55e;">🟢 WhatsApp</a>
        <button onclick="copyContactAlert('${escapeHtml(c.name)}', '${escapeHtml(c.phone)}')" class="card" title="Copy alert message to clipboard" style="padding: 0.4rem 0.65rem; font-size: 0.8rem; font-weight: 600; background: transparent; cursor: pointer; color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3);">📋 Copy</button>
        <button onclick="deleteContact('${c.id || c.phone}')" title="Delete contact" style="background: transparent; border: none; color: #f87171; cursor: pointer; padding: 0.4rem 0.5rem; font-size: 0.85rem;">🗑️</button>
      </div>
    </div>
  `;
  }).join('');
}

async function addContact(e) {
  e.preventDefault();
  const nameInput = document.getElementById('cName');
  const phoneInput = document.getElementById('cPhone');
  const relInput = document.getElementById('cRel');

  const newContact = {
    id: 'c-' + Date.now().toString().slice(-6),
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    rel: relInput.value
  };

  // 1. Try Backend (SQLite Relational DB)
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      const resp = await fetch(`${window.riskClient.apiBase}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.contacts) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.contacts));
          if (window.riskClient.checkBackendStatus) window.riskClient.checkBackendStatus();
          e.target.reset();
          loadContacts();
          showToast('Trusted guardian saved to SQLite database');
          return;
        }
      }
    } catch {}
  }

  // 2. Fallback to local storage
  const contacts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  contacts.push(newContact);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(contacts));

  e.target.reset();
  loadContacts();
  showToast('Trusted guardian saved locally');
}

async function deleteContact(id) {
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      const resp = await fetch(`${window.riskClient.apiBase}/api/contacts/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        const data = await resp.json();
        if (data.contacts) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.contacts));
          if (window.riskClient.checkBackendStatus) window.riskClient.checkBackendStatus();
          loadContacts();
          showToast('Contact removed from SQLite database');
          return;
        }
      }
    } catch {}
  }

  let contacts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  contacts = contacts.filter(c => (c.id !== id && c.phone !== id));
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(contacts));
  loadContacts();
  showToast('Contact removed');
}
