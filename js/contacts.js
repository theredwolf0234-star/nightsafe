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

function renderContacts(contacts) {
  const container = document.getElementById('contactsList');
  if (!container) return;

  if (!contacts.length) {
    container.innerHTML = '<p class="text-slate-500 text-sm">No trusted contacts added yet.</p>';
    return;
  }

  container.innerHTML = contacts.map(c => `
    <div class="card" style="padding: 1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
      <div>
        <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(c.name)} ${c.isPrimary ? '<span style="font-size: 10px; background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">PRIMARY</span>' : ''}</div>
        <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 2px;">
          ${escapeHtml(c.phone)} • ${escapeHtml(c.rel || 'Contact')}
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <a href="tel:${encodeURIComponent(c.phone)}" class="card" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; font-weight: 600; text-decoration: none; color: #38bdf8;">📞 Call</a>
        <a href="sms:${encodeURIComponent(c.phone)}?body=Emergency!%20I%20am%20sharing%20my%20location%20via%20SafeRoute.AI" class="card" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; font-weight: 600; text-decoration: none; color: #34d399;">💬 SMS</a>
        <button onclick="deleteContact('${c.id || c.phone}')" style="background: transparent; border: none; color: #f87171; cursor: pointer; padding: 0.45rem 0.6rem; font-size: 0.8rem;">Delete</button>
      </div>
    </div>
  `).join('');
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

  // 1. Try Backend
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      await fetch(`${window.riskClient.apiBase}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact)
      });
    } catch {}
  }

  // 2. Always update local storage
  const contacts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  contacts.push(newContact);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(contacts));

  e.target.reset();
  loadContacts();
  showToast('Trusted contact saved successfully');
}

async function deleteContact(id) {
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      await fetch(`${window.riskClient.apiBase}/api/contacts/${id}`, { method: 'DELETE' });
    } catch {}
  }

  let contacts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  contacts = contacts.filter(c => (c.id !== id && c.phone !== id));
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(contacts));
  loadContacts();
  showToast('Contact removed');
}
