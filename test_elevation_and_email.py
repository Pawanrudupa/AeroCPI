"""
AeroCPI Automated Elevation Request & Email Notification Test Suite.
Verifies:
1. VIEWER self-registration / role assignment
2. Submitting Analyst Elevation Request from /account/elevation-request
3. Notification email dispatch to ADMIN_NOTIFICATION_EMAIL from environment
   - Verifies subject line, requester name, organization, stated reason, and link to /admin/users
   - Verifies security invariant: NO approve/deny links in notification email
4. Duplicate pending request guard (409 Conflict)
5. Admin review and approval via /admin/elevation-requests/{id}/approve
   - User role elevation in DB to ANALYST
   - Confirmation notification email to requester
6. Admin review and rejection via /admin/elevation-requests/{id}/reject
   - User role remains unchanged
   - Rejection notification email to requester
7. Fail-Graceful handling:
   - Elevation creation & approval succeed without error when SMTP is unconfigured or misconfigured
8. RBAC protection: non-admins blocked with 403 Forbidden on /admin/elevation-requests/*
"""
import sys
import datetime as dt
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.config import settings
from backend.app.email_service import (
    SENT_EMAILS_LOG,
    send_elevation_request_notification,
    send_elevation_status_notification,
)

client = TestClient(app)


def test_elevation_and_email():
    print("=========================================================")
    print("AeroCPI Elevation Request & Email Notification Test Suite")
    print("=========================================================\n")

    # Clear email log for clean testing
    SENT_EMAILS_LOG.clear()

    # Step 1: Login as Admin
    print("--- [1] Authenticating Institutional Administrator ---")
    admin_pass = settings.admin_password or "LocalTestAdminSecret#2026!"
    admin_login = client.post("/auth/login", json={
        "email": settings.SEED_ADMIN_EMAIL,
        "password": admin_pass
    })
    assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
    admin_token = admin_login.json()["access_token"]
    print("[PASS] Admin authenticated successfully.")

    # Step 2: Register a new self-service VIEWER user
    print("\n--- [2] Registering Self-Service VIEWER User ---")
    timestamp = int(dt.datetime.now().timestamp())
    viewer_email = f"researcher_{timestamp}@nso.gov.in"
    viewer_pass = "ViewerSecurePass#2026!"
    register_resp = client.post("/auth/register", json={
        "email": viewer_email,
        "password": viewer_pass,
        "name": "Dr. Aris Thorne",
        "organization": "National Statistical Office (Transport Division)"
    })
    assert register_resp.status_code == 200, f"Viewer registration failed: {register_resp.text}"
    viewer_data = register_resp.json()
    viewer_token = viewer_data["access_token"]
    assert viewer_data["role"] == "viewer"
    print(f"[PASS] Self-service VIEWER registered: {viewer_email} (role: viewer)")

    # Step 3: Viewer submits Analyst Elevation Request
    print("\n--- [3] Submitting Analyst Elevation Request from /account ---")
    reason_text = "Conducting comparative CPI transportation index validation for Q3 2026 civil aviation basket."
    elevation_resp = client.post(
        "/account/elevation-request",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"reason": reason_text}
    )
    assert elevation_resp.status_code == 200, f"Elevation submission failed: {elevation_resp.text}"
    elev_data = elevation_resp.json()
    assert elev_data["status"] == "success"
    request_id = elev_data["request"]["id"]
    assert elev_data["request"]["status"] == "pending"
    assert elev_data["request"]["reason"] == reason_text
    print(f"[PASS] Elevation request #{request_id} created with status 'pending'")

    # Step 4: Verify Admin Notification Email was triggered
    print("\n--- [4] Verifying Admin Notification Email Trigger & Content ---")
    assert len(SENT_EMAILS_LOG) >= 1, "No email was recorded in SENT_EMAILS_LOG"
    admin_email_record = SENT_EMAILS_LOG[-1]

    expected_admin = settings.ADMIN_NOTIFICATION_EMAIL
    assert expected_admin is not None, "ADMIN_NOTIFICATION_EMAIL must be set in .env for this test"
    assert admin_email_record["to_email"] == expected_admin, (
        f"Expected to_email {expected_admin}, got {admin_email_record['to_email']}"
    )
    assert "[AeroCPI] Analyst Elevation Request:" in admin_email_record["subject"]
    assert "Dr. Aris Thorne" in admin_email_record["body_text"]
    assert viewer_email in admin_email_record["body_text"]
    assert "National Statistical Office (Transport Division)" in admin_email_record["body_text"]
    assert reason_text in admin_email_record["body_text"]
    assert f"{settings.APP_BASE_URL}/admin/users" in admin_email_record["body_text"]

    # CRITICAL SECURITY INVARIANT: No approve/deny action links in email
    assert "approve?token=" not in admin_email_record["body_text"].lower()
    assert "reject?token=" not in admin_email_record["body_text"].lower()
    print(f"[PASS] Notification email correctly routed to: {expected_admin}")
    print(f"[PASS] Subject: {admin_email_record['subject']}")
    print("[PASS] Security invariant verified: Email is notification-only with link to /admin/users")

    # Step 5: Verify Duplicate Pending Request Guard (409 Conflict)
    print("\n--- [5] Testing Duplicate Pending Request Guard ---")
    dup_resp = client.post(
        "/account/elevation-request",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"reason": "Another request while first is still pending"}
    )
    assert dup_resp.status_code == 409, f"Expected 409 Conflict, got {dup_resp.status_code}"
    print("[PASS] Duplicate pending request rejected with 409 Conflict")

    # Step 6: RBAC Guard - Non-admin cannot list or review requests
    print("\n--- [6] Testing RBAC Protection on /admin/elevation-requests ---")
    forbidden_resp = client.get(
        "/admin/elevation-requests",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert forbidden_resp.status_code == 403, f"Expected 403 Forbidden, got {forbidden_resp.status_code}"
    print("[PASS] Non-admin access to /admin/elevation-requests rejected with 403 Forbidden")

    # Step 7: Admin Lists Elevation Requests
    print("\n--- [7] Admin Lists Elevation Requests ---")
    list_resp = client.get(
        "/admin/elevation-requests?status=pending",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert list_resp.status_code == 200
    pending_list = list_resp.json()
    matching = [r for r in pending_list if r["id"] == request_id]
    assert len(matching) == 1
    print(f"[PASS] Admin listed {len(pending_list)} pending elevation request(s)")

    # Step 8: Admin Approves Elevation Request
    print("\n--- [8] Admin Approves Elevation Request ---")
    approve_resp = client.post(
        f"/admin/elevation-requests/{request_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"review_notes": "Verified institutional credentials with MoSPI Transport Wing."}
    )
    assert approve_resp.status_code == 200, f"Approval failed: {approve_resp.text}"
    approved_data = approve_resp.json()
    assert approved_data["request"]["status"] == "approved"
    assert approved_data["request"]["reviewed_by"] == settings.SEED_ADMIN_EMAIL
    print(f"[PASS] Elevation request #{request_id} approved by admin")

    # Verify user's role is now elevated in profile
    profile_resp = client.get("/account/profile", headers={"Authorization": f"Bearer {viewer_token}"})
    assert profile_resp.status_code == 200
    assert profile_resp.json()["role"] == "analyst"
    print("[PASS] User role in database elevated from 'viewer' to 'analyst'")

    # Step 9: Verify Applicant Confirmation Email Triggered
    print("\n--- [9] Verifying Applicant Approval Confirmation Email ---")
    approval_email_record = SENT_EMAILS_LOG[-1]
    assert approval_email_record["to_email"] == viewer_email
    assert "APPROVED" in approval_email_record["subject"]
    assert "Verified institutional credentials with MoSPI Transport Wing." in approval_email_record["body_text"]
    assert f"{settings.APP_BASE_URL}/login" in approval_email_record["body_text"]
    print(f"[PASS] Confirmation email dispatched to applicant ({viewer_email}) with login instructions")

    # Step 10: Test Rejection Flow on another user
    print("\n--- [10] Testing Rejection Flow on Another Viewer Account ---")
    viewer2_email = f"viewer2_{timestamp}@independent.org"
    reg2 = client.post("/auth/register", json={
        "email": viewer2_email,
        "password": "Viewer2Secure#2026!",
        "name": "Alex Mercer",
        "organization": "Public Research"
    })
    token2 = reg2.json()["access_token"]
    elev2 = client.post(
        "/account/elevation-request",
        headers={"Authorization": f"Bearer {token2}"},
        json={"reason": "Need analyst access to test features."}
    )
    req2_id = elev2.json()["request"]["id"]

    reject_resp = client.post(
        f"/admin/elevation-requests/{req2_id}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"review_notes": "Institutional affiliation cannot be verified."}
    )
    assert reject_resp.status_code == 200
    assert reject_resp.json()["request"]["status"] == "rejected"

    # Verify user role remains 'viewer'
    prof2 = client.get("/account/profile", headers={"Authorization": f"Bearer {token2}"})
    assert prof2.json()["role"] == "viewer"
    print("[PASS] Rejection handled cleanly. User role remains 'viewer'.")

    rejection_email = SENT_EMAILS_LOG[-1]
    assert rejection_email["to_email"] == viewer2_email
    assert "REJECTED" in rejection_email["subject"]
    print(f"[PASS] Rejection notification dispatched to {viewer2_email}")

    # Step 11: Fail-Graceful Verification
    print("\n--- [11] Verifying Fail-Graceful Behavior with Missing/Broken SMTP ---")
    # Simulate completely unconfigured SMTP
    original_host = settings.SMTP_HOST
    try:
        settings.SMTP_HOST = None
        # Send elevation request notification directly
        res_no_smtp = send_elevation_request_notification(
            requester_email="test.graceful@example.com",
            requester_name="Graceful Test",
            requester_org="Test Lab",
            reason="Testing fail-graceful behavior with no SMTP host configured"
        )
        assert res_no_smtp["sent"] is False
        assert res_no_smtp["reason"] == "SMTP_NOT_CONFIGURED"
        print("[PASS] Unconfigured SMTP handled gracefully without exceptions")

        # Simulate broken network / invalid SMTP server
        settings.SMTP_HOST = "127.0.0.1"
        settings.SMTP_PORT = 65432  # Closed dummy port
        res_broken_smtp = send_elevation_request_notification(
            requester_email="test.graceful2@example.com",
            requester_name="Graceful Test 2",
            requester_org="Test Lab",
            reason="Testing connection failure error handling"
        )
        assert res_broken_smtp["sent"] is False
        assert res_broken_smtp["error"] is not None
        print(f"[PASS] Connection failure logged and caught gracefully: {res_broken_smtp['error']}")

        # Simulate unconfigured ADMIN_NOTIFICATION_EMAIL
        original_admin = settings.ADMIN_NOTIFICATION_EMAIL
        try:
            settings.ADMIN_NOTIFICATION_EMAIL = None
            res_no_admin = send_elevation_request_notification(
                requester_email="test.graceful3@example.com",
                requester_name="Graceful Test 3",
                requester_org="Test Lab",
                reason="Testing fail-graceful behavior with no admin notification email configured"
            )
            assert res_no_admin["sent"] is False
            assert res_no_admin["reason"] == "ADMIN_EMAIL_NOT_CONFIGURED"
            print("[PASS] Missing ADMIN_NOTIFICATION_EMAIL handled gracefully without hardcoded fallback")
        finally:
            settings.ADMIN_NOTIFICATION_EMAIL = original_admin
    finally:
        settings.SMTP_HOST = original_host

    print("\n=========================================================")
    print("ALL ELEVATION & EMAIL NOTIFICATION TESTS PASSED (11/11)!")
    print("=========================================================")


if __name__ == "__main__":
    test_elevation_and_email()
