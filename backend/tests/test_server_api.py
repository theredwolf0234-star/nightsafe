import sys
import os
import threading
import time
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import ThreadedHTTPServer, SafeRouteAPIHandler

TEST_PORT = 5099
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"

def run_tests():
    print(f"[*] Starting test server on {BASE_URL}...")
    server = ThreadedHTTPServer(('127.0.0.1', TEST_PORT), SafeRouteAPIHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    try:
        # 1. Health check
        print("[*] Testing GET /api/health...")
        req = urllib.request.urlopen(f"{BASE_URL}/api/health")
        assert req.status == 200
        health = json.loads(req.read().decode('utf-8'))
        print(f"    - Health response: {health['status']}, service: {health['service']}")
        assert health['status'] == 'healthy'

        # 2. Safe Havens
        print("[*] Testing GET /api/safe-havens...")
        req = urllib.request.urlopen(f"{BASE_URL}/api/safe-havens")
        assert req.status == 200
        havens = json.loads(req.read().decode('utf-8'))
        print(f"    - Safe havens count: {havens['count']}")
        assert havens['count'] > 0

        # 3. Incidents
        print("[*] Testing GET /api/incidents...")
        req = urllib.request.urlopen(f"{BASE_URL}/api/incidents")
        assert req.status == 200
        incidents = json.loads(req.read().decode('utf-8'))
        print(f"    - Incidents count: {incidents['count']}")

        # 4. Contacts
        print("[*] Testing GET /api/contacts...")
        req = urllib.request.urlopen(f"{BASE_URL}/api/contacts")
        assert req.status == 200
        contacts = json.loads(req.read().decode('utf-8'))
        print(f"    - Contacts count: {contacts['count']}")

        # 5. AI Risk Route Evaluation (POST)
        print("[*] Testing POST /api/risk/evaluate...")
        sample_payload = {
            "departure_time": "23:45",
            "mode": "driving",
            "routes": [
                {
                    "distance": 22400.0,
                    "duration": 1900.0,
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [77.2090, 28.6139],
                            [77.2150, 28.5800],
                            [77.2200, 28.5500],
                            [77.2135, 28.5283]
                        ]
                    }
                },
                {
                    "distance": 21800.0,
                    "duration": 1850.0,
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [77.2090, 28.6139],
                            [77.1800, 28.5900],
                            [77.1600, 28.5400],
                            [77.2135, 28.5283]
                        ]
                    }
                }
            ]
        }

        data_bytes = json.dumps(sample_payload).encode('utf-8')
        post_req = urllib.request.Request(
            f"{BASE_URL}/api/risk/evaluate",
            data=data_bytes,
            headers={'Content-Type': 'application/json'}
        )
        resp = urllib.request.urlopen(post_req)
        assert resp.status == 200
        eval_result = json.loads(resp.read().decode('utf-8'))
        print(f"    - Routes evaluated: {len(eval_result['evaluated_routes'])}")
        primary_eval = eval_result['evaluated_routes'][0]
        print(f"    - Primary route lighting: {primary_eval['lighting_percentage']}%")
        print(f"    - Primary route safety: {primary_eval['safety_score']}% ({primary_eval['risk_level']})")
        print(f"    - Safe havens along corridor: {primary_eval['safe_havens_count']}")
        print(f"    - Comparison verdict: {eval_result['comparison']['verdict']}")
        assert primary_eval['safety_score'] > 0

        # 6. Test Point Risk Check
        print("[*] Testing POST /api/risk/point...")
        point_payload = json.dumps({"lat": 28.6139, "lng": 77.2090}).encode('utf-8')
        point_req = urllib.request.Request(
            f"{BASE_URL}/api/risk/point",
            data=point_payload,
            headers={'Content-Type': 'application/json'}
        )
        resp_point = urllib.request.urlopen(point_req)
        assert resp_point.status == 200
        point_data = json.loads(resp_point.read().decode('utf-8'))
        print(f"    - Point safety score: {point_data['safety_score']}%, Danger zone: {point_data['danger_zone']}")

        # 7. Static File Serving check
        print("[*] Testing Static File Serving GET /index.html...")
        html_req = urllib.request.urlopen(f"{BASE_URL}/index.html")
        assert html_req.status == 200
        content = html_req.read().decode('utf-8')
        assert "SafeRoute.AI" in content
        print(f"    - Static HTML served ({len(content)} bytes)")

        print("\n[ALL SERVER TESTS PASSED 100% SUCCESSFULLY]")

    finally:
        server.shutdown()
        server.server_close()
        print("[*] Test server stopped.")

if __name__ == '__main__':
    run_tests()
