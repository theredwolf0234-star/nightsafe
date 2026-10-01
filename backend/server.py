"""
SafeRoute.AI - Backend REST API Server
Built with Python standard library (http.server, urllib, json, threading) - ZERO pip dependencies needed!
Serves the full-stack SafeRoute.AI web application and AI Risk Engine endpoints.
"""

import http.server
import socketserver
import json
import os
import sys
import urllib.parse
from datetime import datetime

# Add ai_risk_engine to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_risk_engine.risk_engine import AIRiskEngine

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(BASE_DIR, 'data')

# Initialize AI Risk Engine singleton
risk_engine = AIRiskEngine(data_dir=DATA_DIR)

def read_json_file(filename, default):
    filepath = os.path.join(DATA_DIR, filename)
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[ERROR] Reading {filename}: {e}")
    return default

def write_json_file(filename, data):
    filepath = os.path.join(DATA_DIR, filename)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[ERROR] Writing {filename}: {e}")
        return False

class SafeRouteAPIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_ROOT, **kwargs)

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def _send_json_response(self, data, status_code=200):
        self.send_response(status_code)
        self._send_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _parse_post_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                return json.loads(body)
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # API Endpoints
        if path == '/api/health':
            self._send_json_response({
                "status": "healthy",
                "service": "SafeRoute.AI Backend & Risk Engine",
                "version": "2.1.0",
                "timestamp": datetime.now().isoformat(),
                "ai_engine_active": True
            })
            return

        if path == '/api/config':
            self._send_json_response({
                "mapboxToken": os.environ.get("MAPBOX_ACCESS_TOKEN", "")
            })
            return

        elif path == '/api/safe-havens':
            havens = read_json_file('safe_havens.json', [])
            self._send_json_response({
                "success": True,
                "count": len(havens),
                "safe_havens": havens
            })
            return

        elif path == '/api/incidents':
            incidents = read_json_file('incidents.json', [])
            self._send_json_response({
                "success": True,
                "count": len(incidents),
                "incidents": incidents
            })
            return

        elif path == '/api/contacts':
            contacts = read_json_file('contacts.json', [])
            self._send_json_response({
                "success": True,
                "count": len(contacts),
                "contacts": contacts
            })
            return

        elif path == '/api/heatmap':
            # Returns GeoJSON feature collection for safety/incident heatmap layer
            incidents = read_json_file('incidents.json', [])
            features = []
            for inc in incidents:
                if inc.get('lat') and inc.get('lng'):
                    features.append({
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [inc['lng'], inc['lat']]
                        },
                        "properties": {
                            "id": inc.get('id'),
                            "type": inc.get('type'),
                            "weight": inc.get('weight', 0.7),
                            "severity": inc.get('severity', 'medium')
                        }
                    })
            self._send_json_response({
                "type": "FeatureCollection",
                "features": features
            })
            return

        # Fallback to static file serving
        return super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        body = self._parse_post_body()

        # 1. AI Risk Engine Route Evaluation
        if path == '/api/risk/evaluate':
            routes = body.get('routes', [])
            departure_time = body.get('departure_time', '23:00')
            mode = body.get('mode', 'driving')

            if not routes:
                self._send_json_response({"error": "No routes provided in request body"}, 400)
                return

            evaluated_routes = []
            for idx, r in enumerate(routes):
                eval_res = risk_engine.evaluate_route(
                    route_data=r,
                    route_index=idx,
                    departure_time=departure_time,
                    mode=mode
                )
                evaluated_routes.append(eval_res)

            comparison = risk_engine.compare_routes_analysis(evaluated_routes)

            self._send_json_response({
                "success": True,
                "evaluated_routes": evaluated_routes,
                "comparison": comparison,
                "evaluated_at": datetime.now().isoformat()
            })
            return

        # 2. Live GPS Point Anomaly / Safety Check
        elif path == '/api/risk/point':
            lat = body.get('lat')
            lng = body.get('lng')
            if lat is None or lng is None:
                self._send_json_response({"error": "lat and lng required"}, 400)
                return

            havens = risk_engine.find_nearby_safe_havens(lat, lng, radius_km=1.5)
            incident_penalty = risk_engine.calculate_incident_density(lat, lng)
            
            # Real-time point safety score
            now_time = datetime.now().strftime("%H:%M")
            time_factor = risk_engine.get_time_factor(now_time)
            point_safety = max(20.0, min(98.0, (88.0 - incident_penalty * 0.6 + (len(havens) * 4.0)) * time_factor))

            self._send_json_response({
                "success": True,
                "point": {"lat": lat, "lng": lng},
                "safety_score": round(point_safety, 1),
                "danger_zone": incident_penalty > 35.0,
                "incident_penalty": round(incident_penalty, 1),
                "nearest_havens": havens[:3]
            })
            return

        # 3. Add or Update Trusted Contact
        elif path == '/api/contacts':
            name = body.get('name', '').strip()
            phone = body.get('phone', '').strip()
            rel = body.get('rel', 'Family').strip()

            if not name or not phone:
                self._send_json_response({"error": "Name and phone required"}, 400)
                return

            contacts = read_json_file('contacts.json', [])
            new_contact = {
                "id": "c-" + str(int(datetime.now().timestamp() * 1000))[-6:],
                "name": name,
                "phone": phone,
                "rel": rel,
                "isPrimary": len(contacts) == 0
            }
            contacts.append(new_contact)
            write_json_file('contacts.json', contacts)

            self._send_json_response({
                "success": True,
                "message": "Trusted contact added successfully",
                "contact": new_contact,
                "contacts": contacts
            }, 201)
            return

        # 4. Log SOS / Incident Report
        elif path == '/api/incidents' or path == '/api/sos/trigger':
            rep_type = body.get('type', 'Panic / SOS Triggered')
            notes = body.get('notes', 'Emergency SOS button activated.')
            lat = body.get('lat')
            lng = body.get('lng')
            loc_str = body.get('location', '')

            if not loc_str and lat and lng:
                loc_str = f"{lat:.5f}, {lng:.5f}"

            incidents = read_json_file('incidents.json', [])
            report_id = "SOS-" if "SOS" in rep_type else "INC-"
            report_id += str(int(datetime.now().timestamp() * 1000))[-6:]

            new_rep = {
                "id": report_id,
                "type": rep_type,
                "severity": "high" if "SOS" in rep_type or "Harass" in rep_type else "medium",
                "weight": 0.95 if "SOS" in rep_type else 0.70,
                "lat": lat or 28.6139,
                "lng": lng or 77.2090,
                "location": loc_str or "28.6139, 77.2090",
                "timestamp": datetime.now().isoformat(),
                "notes": notes
            }

            incidents.insert(0, new_rep)
            write_json_file('incidents.json', incidents)

            # Reload incident cache in risk engine
            risk_engine.incidents = incidents

            self._send_json_response({
                "success": True,
                "message": "Emergency SOS / Incident logged into security grid",
                "report": new_rep,
                "dispatch_alert": {
                    "alert_level": "CRITICAL" if "SOS" in rep_type else "STANDARD",
                    "notified_contacts": len(read_json_file('contacts.json', []))
                }
            }, 201)
            return

        self._send_json_response({"error": "Endpoint not found"}, 404)

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith('/api/contacts/'):
            contact_id = path.replace('/api/contacts/', '').strip()
            contacts = read_json_file('contacts.json', [])
            original_len = len(contacts)
            contacts = [c for c in contacts if c.get('id') != contact_id]

            if len(contacts) < original_len:
                write_json_file('contacts.json', contacts)
                self._send_json_response({"success": True, "message": "Contact deleted", "contacts": contacts})
            else:
                self._send_json_response({"error": "Contact not found"}, 404)
            return

        elif path.startswith('/api/incidents/'):
            report_id = path.replace('/api/incidents/', '').strip()
            incidents = read_json_file('incidents.json', [])
            original_len = len(incidents)
            incidents = [i for i in incidents if i.get('id') != report_id]

            if len(incidents) < original_len:
                write_json_file('incidents.json', incidents)
                risk_engine.incidents = incidents
                self._send_json_response({"success": True, "message": "Report deleted", "incidents": incidents})
            else:
                self._send_json_response({"error": "Report not found"}, 404)
            return

        self._send_json_response({"error": "Endpoint not found"}, 404)

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def run_server(port=5000):
    server_address = ('', port)
    httpd = ThreadedHTTPServer(server_address, SafeRouteAPIHandler)
    print(f"""
============================================================
  SafeRoute.AI - Night Travel Guardian Server
  Full-Stack & AI Risk Engine Server Active
============================================================
  Local Web App URL:  http://localhost:{port}
  Health Check:       http://localhost:{port}/api/health
  Risk API Endpoint:  http://localhost:{port}/api/risk/evaluate
  Safe Havens API:    http://localhost:{port}/api/safe-havens
  Incidents API:      http://localhost:{port}/api/incidents
  Contacts API:       http://localhost:{port}/api/contacts
============================================================
    """)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[SafeRoute.AI] Server stopped gracefully.")
        httpd.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 5000))
    run_server(port)
