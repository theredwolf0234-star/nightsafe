import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_risk_engine.risk_engine import AIRiskEngine

def run_tests():
    print("[*] Initializing AI Risk Engine...")
    engine = AIRiskEngine()
    
    # Check loaded data
    print(f"    - Safe havens loaded: {len(engine.safe_havens)}")
    print(f"    - Incidents loaded: {len(engine.incidents)}")
    assert len(engine.safe_havens) > 0, "Safe havens should be loaded"
    assert len(engine.incidents) > 0, "Incidents should be loaded"

    # Test time factor
    t_night = engine.get_time_factor("02:30")
    t_day = engine.get_time_factor("14:00")
    print(f"    - Time factor at 02:30 AM: {t_night:.2f} (curfew risk)")
    print(f"    - Time factor at 02:00 PM: {t_day:.2f} (daytime baseline)")
    assert t_night < t_day, "Night travel should have lower safety factor"

    # Test mode multiplier
    m_walk = engine.get_mode_multiplier("walking")
    m_drive = engine.get_mode_multiplier("driving")
    print(f"    - Mode multiplier walking: {m_walk:.2f}")
    print(f"    - Mode multiplier driving: {m_drive:.2f}")
    assert m_walk > m_drive, "Walking should have higher vulnerability exposure"

    # Test route evaluation with dummy route
    sample_route = {
        "distance": 18500.0,
        "duration": 1800.0,
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [77.2090, 28.6139],
                [77.2150, 28.6200],
                [77.2200, 28.6250],
                [77.2295, 28.6304]
            ]
        }
    }

    print("[*] Evaluating primary lit route...")
    eval_primary = engine.evaluate_route(sample_route, route_index=0, departure_time="23:30", mode="driving")
    print(f"    - Title: {eval_primary['title']}")
    print(f"    - Safety Score: {eval_primary['safety_score']}% ({eval_primary['risk_level']})")
    print(f"    - Lighting: {eval_primary['lighting_percentage']}%")
    print(f"    - Safe Havens along route: {eval_primary['safe_havens_count']}")

    print("[*] Evaluating alternative dark route...")
    eval_alt = engine.evaluate_route(sample_route, route_index=2, departure_time="23:30", mode="walking")
    print(f"    - Title: {eval_alt['title']}")
    print(f"    - Safety Score: {eval_alt['safety_score']}% ({eval_alt['risk_level']})")
    print(f"    - Lighting: {eval_alt['lighting_percentage']}%")

    assert eval_primary['safety_score'] > eval_alt['safety_score'], "Primary route should score safer"

    # Test route comparison
    comp = engine.compare_routes_analysis([eval_primary, eval_alt])
    print(f"    - Comparison generated: {comp['has_comparison']}")
    print(f"    - Verdict: {comp['verdict']}")

    print("\n[SUCCESS] All AI Risk Engine tests passed perfectly!")

if __name__ == "__main__":
    run_tests()
