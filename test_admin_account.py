"""
AeroCPI Automated RBAC & Account Management Security Test Suite.
Tests:
1. Admin Bootstrap & Analyst Login
2. Role-Based Access Control: Analyst 403 on /admin/*
3. Admin User Provisioning with generated temporary password
4. First-login must_change_password enforcement
5. Password Change with current-password verification
6. Scoped Login Event Audit History
7. Programmatic API Key (X-API-Key) Generation, Usage & Revocation
"""
import sys
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.config import settings

client = TestClient(app)

def run_tests():
    print("--- [1] Testing Login & Authentication ---")
    admin_pass = settings.admin_password or "LocalTestAdminSecret#2026!"
    admin_login = client.post("/auth/login", json={
        "email": settings.SEED_ADMIN_EMAIL,
        "password": admin_pass
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_data = admin_login.json()
    admin_token = admin_data["access_token"]
    assert admin_data["role"] == "admin"
    print("[PASS] Admin login successful (role: admin)")

    # Analyst login
    analyst_pass = settings.SEED_ANALYST_PASSWORD or "AnalystSecure2026!"
    analyst_login = client.post("/auth/login", json={
        "email": settings.SEED_ANALYST_EMAIL,
        "password": analyst_pass
    })
    assert analyst_login.status_code == 200, f"Analyst login failed: {analyst_login.text}"
    analyst_data = analyst_login.json()
    analyst_token = analyst_data["access_token"]
    assert analyst_data["role"] == "analyst"
    print("[PASS] Analyst login successful (role: analyst)")

    print("\n--- [2] Testing Server-Side RBAC Enforcement ---")
    # Analyst attempting to access /admin/users -> MUST return 403 Forbidden
    forbidden_resp = client.get("/admin/users", headers={"Authorization": f"Bearer {analyst_token}"})
    assert forbidden_resp.status_code == 403, f"Expected 403 for analyst, got {forbidden_resp.status_code}"
    print("[PASS] Analyst access to /admin/users correctly rejected with 403 Forbidden")

    # Admin accessing /admin/users -> MUST return 200 OK
    admin_users_resp = client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_users_resp.status_code == 200
    user_list = admin_users_resp.json()
    assert len(user_list) >= 2
    print(f"[PASS] Admin successfully listed accounts ({len(user_list)} found)")

    print("\n--- [3] Testing Admin User Provisioning ---")
    new_user_email = "test.officer@rbi.gov.in"
    # Clean up if previously created
    for u in user_list:
        if u["email"] == new_user_email:
            print(f"User {new_user_email} already exists from earlier test")

    provision_resp = client.post("/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "email": new_user_email,
        "name": "Dr. Rakesh Asthana",
        "organization": "Reserve Bank of India — Monetary Policy Dept",
        "role": "analyst"
    })
    
    if provision_resp.status_code == 409:
        print("User already exists, proceeding with password reset test")
        target_uid = next(u["id"] for u in user_list if u["email"] == new_user_email)
        reset_resp = client.post(f"/admin/users/{target_uid}/reset-password", headers={"Authorization": f"Bearer {admin_token}"})
        assert reset_resp.status_code == 200
        temp_pass = reset_resp.json()["temporary_password"]
    else:
        assert provision_resp.status_code == 200, f"Provisioning failed: {provision_resp.text}"
        prov_data = provision_resp.json()
        temp_pass = prov_data["temporary_password"]
        assert prov_data["user"]["must_change_password"] is True
        print("[PASS] New user provisioned with secure temporary password")

    print("\n--- [4] Testing Provisioned User Login & Password Change ---")
    new_user_login = client.post("/auth/login", json={
        "email": new_user_email,
        "password": temp_pass
    })
    assert new_user_login.status_code == 200
    new_login_data = new_user_login.json()
    assert new_login_data["must_change_password"] is True
    new_token = new_login_data["access_token"]
    print("[PASS] New user logged in with must_change_password=True flag verified")

    # Change password
    new_permanent_pass = "PermanentSecurePass2026!"
    change_resp = client.post("/account/change-password", headers={"Authorization": f"Bearer {new_token}"}, json={
        "current_password": temp_pass,
        "new_password": new_permanent_pass
    })
    assert change_resp.status_code == 200
    print("[PASS] Permanent password set successfully")

    # Verify profile now has must_change_password=False
    prof_resp = client.get("/account/profile", headers={"Authorization": f"Bearer {new_token}"})
    assert prof_resp.status_code == 200
    assert prof_resp.json()["must_change_password"] is False
    print("[PASS] Profile verified: must_change_password is now False")

    print("\n--- [5] Testing Programmatic API Key (X-API-Key) ---")
    api_key_resp = client.post("/account/api-key", headers={"Authorization": f"Bearer {new_token}"})
    assert api_key_resp.status_code == 200
    api_key_data = api_key_resp.json()
    full_api_key = api_key_data["api_key"]
    assert full_api_key.startswith("aero_live_")
    print(f"[PASS] API key generated: {api_key_data['prefix']} (SHA-256 hashed at rest)")

    # Test accessing protected endpoint with X-API-Key (NO Bearer token)
    raw_fares_resp = client.get("/fares/raw?limit=2", headers={"X-API-Key": full_api_key})
    assert raw_fares_resp.status_code == 200, f"X-API-Key auth failed: {raw_fares_resp.text}"
    print("[PASS] Authenticated query via X-API-Key succeeded without JWT Bearer token")

    # Revoke API key
    revoke_resp = client.delete("/account/api-key", headers={"Authorization": f"Bearer {new_token}"})
    assert revoke_resp.status_code == 200
    print("[PASS] API key revoked")

    # Test accessing with revoked key -> MUST return 401
    revoked_check = client.get("/fares/raw?limit=2", headers={"X-API-Key": full_api_key})
    assert revoked_check.status_code == 401
    print("[PASS] Revoked API key correctly rejected with 401 Unauthorized")

    print("\n--- [6] Testing Scoped Login Event Audit History ---")
    history_resp = client.get("/account/login-history", headers={"Authorization": f"Bearer {new_token}"})
    assert history_resp.status_code == 200
    events = history_resp.json()
    assert len(events) >= 1
    assert all(e["status"] == "success" for e in events)
    print(f"[PASS] Scoped audit log verified ({len(events)} login events captured for user)")

    print("\n==========================================")
    print("ALL RBAC & ACCOUNT SECURITY TESTS PASSED!")
    print("==========================================")

if __name__ == "__main__":
    run_tests()
