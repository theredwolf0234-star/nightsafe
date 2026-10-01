# SafeRoute.AI — Night Travel Guardian & AI Risk Engine

An AI-powered night travel safety platform that optimizes urban travel routes for safety, lumen lighting density, emergency safe havens, and crime avoidance, instead of just transit speed.

![SafeRoute.AI Banner](assets/images/night-bg.jpg)

---

## 🌟 Architecture & Directory Structure

All files have been organized into a production-grade full-stack architecture:

```
SafeRoute.AI/
├── index.html                   # Main web application entry point (instant preview & server compatible)
├── frontend/
│   └── index.html               # Frontend mirror for standalone static hosting
├── css/
│   ├── styles.css               # Design system: glassmorphism, animations, responsive layout
│   └── mapbox-gl.css            # Mapbox GL JS styling
├── js/
│   ├── app.js                   # Application state, route planning UI, tabs navigation
│   ├── map.js                   # Mapbox GL integration, custom pins, safety heatmaps
│   ├── ai-risk-client.js        # AI Risk client connecting to backend API with offline fallback
│   ├── live-guard.js            # Live GPS telemetry, route anomaly detection, simulated walk
│   ├── contacts.js              # Trusted guardians manager (CRUD with API + local storage)
│   ├── incidents.js             # Incident logging, safety hazard submission, JSON export
│   ├── sos.js                   # Emergency SOS countdown modal, Web Audio siren synthesizer
│   └── lib/
│       └── mapbox-gl.js         # Mapbox GL JavaScript library
├── assets/
│   ├── images/
│   │   └── night-bg.jpg         # High-resolution atmospheric night travel background
│   └── fonts/
│       └── inter.css            # Inter typography font definitions
├── backend/
│   ├── server.py                # High-performance Python multithreaded REST API server (ZERO pip deps)
│   ├── server.js                # Node.js Express equivalent server (for Node.js runtimes)
│   ├── ai_risk_engine/
│   │   ├── __init__.py
│   │   ├── risk_engine.py       # Core AI spatial-temporal risk engine in Python
│   │   └── risk_engine.js       # Core AI risk engine in JavaScript (for browser/Node)
│   ├── data/
│   │   ├── safe_havens.json     # 24/7 Police stations, trauma centers, 24/7 pharmacies, transit hubs
│   │   ├── incidents.json       # Historical incident & hazard reports with geo-coordinates
│   │   └── contacts.json        # Persistent trusted guardians database
│   └── tests/
│       ├── test_risk_engine.py  # Unit tests for AI risk scoring algorithms
│       └── test_server_api.py   # Full integration test suite for all REST API endpoints
├── package.json                 # Node.js project descriptor and scripts
├── start_server.bat             # One-click Windows server launcher
├── start_server.ps1             # PowerShell server launcher
└── README.md                    # Project documentation
```

---

## 🧠 The AI Risk Engine Explained

Unlike traditional navigation engines (which choose the shortest or fastest duration), **SafeRoute.AI** evaluates multiple safety dimensions:

### 1. Street Lighting Lumen Density ($L$)
- Evaluates roadway classification (Expressways & Primary Arterials receive high lumen baselines 90–96%, secondary streets 70–80%, interior alleys 30–50%).
- Adjusts for municipal power-saving schedules between 23:00 and 04:00.

### 2. Spatial Kernel Density of Incidents ($I$)
- Computes Gaussian decay kernel around historical incident coordinates (unlit roads, suspicious loitering, harassment, theft):
  $$K(d) = e^{-\frac{d^2}{2\sigma^2}}$$
- Where $d$ is distance from incident cluster ($\sigma = 2.0\text{ km}$).

### 3. Safe Haven Accessibility ($H$)
- Maps proximity to 24/7 verified safe havens within an 800m–1.5km buffer:
  - 24/7 Police stations & Highway Patrol Posts
  - All-night Hospital Emergency & Trauma Centers
  - 24-Hour Open Retail / Pharmacies
  - CISF-monitored Metro / Transit Hubs

### 4. Circadian Curfew Penalty ($T$)
- Piecewise nocturnal risk factor scaling with departure hour:
  - 19:00 – 22:00: Baseline Evening ($T = 0.95$)
  - 23:00 – 02:00: Deep Night ($T = 0.72$)
  - 02:00 – 04:30: Peak Nocturnal Vulnerability ($T = 0.60$)
  - 04:30 – 06:00: Pre-Dawn Recovery ($T = 0.82$)

### 5. Travel Mode Vulnerability Multiplier ($M$)
- `walking`: $1.30\times$ exposure factor
- `cycling`: $1.12\times$ exposure factor
- `driving`: $0.88\times$ exposure factor (enclosed cabin)

---

## 🚀 How to Run

### Method 1: One-Click Windows Launcher
Double-click `start_server.bat` in the root folder.
It automatically launches the Python 3.12 server on `http://localhost:5000` and opens the web application in your browser.

### Method 2: Python Command Line
```powershell
python backend/server.py 5000
```
Open `http://localhost:5000` in any browser.

### Method 3: Direct Browser Launch (Offline Mode)
Simply open `index.html` directly in Google Chrome, Edge, or Firefox.
The built-in client-side AI risk engine will run directly inside your browser!

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service status, runtime, and AI engine health |
| `POST` | `/api/risk/evaluate` | Evaluates routes for lighting, safety index, and comparison |
| `POST` | `/api/risk/point` | Real-time safety check for live GPS coordinate |
| `GET` | `/api/safe-havens` | List of 24/7 police, hospital, and transit safe havens |
| `GET` | `/api/incidents` | List of historical and community incident reports |
| `POST` | `/api/incidents` | Record a new road hazard or security incident |
| `GET` | `/api/contacts` | List trusted emergency guardians |
| `POST` | `/api/contacts` | Add a new trusted contact |
| `DELETE` | `/api/contacts/<id>` | Remove a trusted contact |
| `POST` | `/api/sos/trigger` | Emergency SOS broadcast and incident creation |
| `GET` | `/api/heatmap` | GeoJSON feature collection for Mapbox safety heatmap |

---

## 🧪 Running Unit & Integration Tests

```powershell
# Run AI Risk Engine unit tests
python backend/tests/test_risk_engine.py

# Run Full-Stack Server REST API integration tests
python backend/tests/test_server_api.py
```
