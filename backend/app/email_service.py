"""
AeroCPI Transactional Email Service.
Implements lightweight, zero-dependency email dispatch using standard library `smtplib` and `email.message`.

Requirements:
- Send notification to ADMIN_NOTIFICATION_EMAIL when an elevation request is created.
- Subject + short body stating requester, organization, stated reason, and link to /admin/users.
- Notification-only: No approve/deny links or action tokens in the email.
- Optional: Send applicant confirmation email upon approval or rejection.
- Fail gracefully: If SMTP is unconfigured or encounters an error, log a warning and return cleanly without blocking in-app flows.
"""
import datetime as dt
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

from backend.app.config import settings

logger = logging.getLogger("aerocpi.email")

# In-memory audit log for sent/attempted emails (used for automated test verification and diagnostics)
SENT_EMAILS_LOG: List[Dict[str, Any]] = []


def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    html_content: Optional[str] = None
) -> Dict[str, Any]:
    """
    Core email dispatch function.
    Uses standard library smtplib with TLS.
    Fails gracefully if SMTP is not configured or network connection fails.
    """
    dispatch_record: Dict[str, Any] = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "to_email": to_email,
        "subject": subject,
        "body_text": body_text,
        "sent": False,
        "reason": None,
        "error": None
    }

    # Verify if SMTP is configured
    if not settings.SMTP_HOST:
        dispatch_record["reason"] = "SMTP_NOT_CONFIGURED"
        logger.info(
            "SMTP_HOST not set. Transactional email to %s with subject '%s' recorded in audit log without network transmission.",
            to_email,
            subject
        )
        SENT_EMAILS_LOG.append(dispatch_record)
        return dispatch_record

    from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "no-reply@aerocpi.local"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body_text)

    if html_content:
        msg.add_alternative(html_content, subtype="html")

    try:
        if settings.SMTP_USE_TLS:
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.starttls(context=context)
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)

        dispatch_record["sent"] = True
        logger.info("Successfully dispatched transactional email to %s (Subject: '%s')", to_email, subject)
    except Exception as e:
        dispatch_record["error"] = str(e)
        logger.warning("Failed to send transactional email to %s: %s", to_email, str(e))

    SENT_EMAILS_LOG.append(dispatch_record)
    return dispatch_record


def send_elevation_request_notification(
    requester_email: str,
    requester_name: Optional[str],
    requester_org: Optional[str],
    reason: str,
    created_at: Optional[dt.datetime] = None
) -> Dict[str, Any]:
    """
    Dispatches a notification email to the configured admin email (ADMIN_NOTIFICATION_EMAIL)
    when a user submits an analyst elevation request.
    Strictly notification-only: does NOT contain approve/deny links.
    """
    if not settings.ADMIN_NOTIFICATION_EMAIL:
        logger.warning(
            "ADMIN_NOTIFICATION_EMAIL is not configured in environment. Skipping elevation request notification."
        )
        dispatch_record: Dict[str, Any] = {
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "to_email": None,
            "subject": f"[AeroCPI] Analyst Elevation Request: {requester_name or 'Not Specified'}",
            "body_text": "ADMIN_NOTIFICATION_EMAIL not configured.",
            "sent": False,
            "reason": "ADMIN_EMAIL_NOT_CONFIGURED",
            "error": "ADMIN_NOTIFICATION_EMAIL environment variable is not configured."
        }
        SENT_EMAILS_LOG.append(dispatch_record)
        return dispatch_record

    admin_recipient = settings.ADMIN_NOTIFICATION_EMAIL
    name_display = requester_name or "Not Specified"
    org_display = requester_org or "Independent / Unspecified"
    time_display = (created_at or dt.datetime.now(dt.timezone.utc)).strftime("%Y-%m-%d %H:%M:%S UTC")
    admin_url = f"{settings.APP_BASE_URL}/admin/users"

    subject = f"[AeroCPI] Analyst Elevation Request: {name_display} ({org_display})"

    body_text = f"""AeroCPI — Institutional Access Notification

An elevation request to the ANALYST role has been submitted.

--- REQUEST DETAILS ---
Requester:    {name_display}
Email:        {requester_email}
Organization: {org_display}
Submitted At: {time_display}

--- STATED JUSTIFICATION ---
"{reason}"

--- ADMINISTRATIVE ACTION ---
To review, approve, or reject this elevation request, please sign in to the Administrative Management Console:
{admin_url}

SECURITY NOTICE:
This email is an informational alert only. Elevation requests cannot be approved or rejected via email. All access decisions must be made inside the authenticated AeroCPI Administrative Console.
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 24px; }}
    .card {{ background: #141414; border: 1px solid #2a2a2a; border-radius: 6px; max-width: 600px; margin: 0 auto; padding: 24px; }}
    .tag {{ display: inline-block; padding: 2px 8px; font-size: 11px; font-family: monospace; background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 4px; }}
    h2 {{ color: #ffffff; margin-top: 12px; font-size: 18px; }}
    .field {{ margin-bottom: 12px; font-size: 13px; }}
    .label {{ color: #888; text-transform: uppercase; font-size: 11px; font-family: monospace; }}
    .value {{ color: #fff; margin-top: 2px; font-weight: 500; }}
    .reason-box {{ background: #0a0a0a; border-left: 3px solid #eab308; padding: 12px; font-style: italic; color: #ddd; margin: 16px 0; font-size: 13px; }}
    .btn {{ display: inline-block; padding: 10px 18px; background: #eab308; color: #000; font-weight: bold; font-family: monospace; font-size: 12px; text-decoration: none; border-radius: 4px; margin-top: 8px; }}
    .footer {{ margin-top: 24px; font-size: 11px; color: #666; border-top: 1px solid #222; padding-top: 12px; }}
  </style>
</head>
<body>
  <div class="card">
    <span class="tag">ACCESS ELEVATION ALERT</span>
    <h2>Analyst Elevation Request</h2>
    <p style="color: #aaa; font-size: 13px;">A user has submitted a request for ANALYST role elevation in AeroCPI.</p>
    
    <div class="field">
      <div class="label">Requester</div>
      <div class="value">{name_display} &lt;{requester_email}&gt;</div>
    </div>
    <div class="field">
      <div class="label">Organization</div>
      <div class="value">{org_display}</div>
    </div>
    <div class="field">
      <div class="label">Submitted At</div>
      <div class="value">{time_display}</div>
    </div>

    <div class="field">
      <div class="label">Stated Justification</div>
      <div class="reason-box">"{reason}"</div>
    </div>

    <div style="margin-top: 20px;">
      <a href="{admin_url}" class="btn">REVIEW IN ADMIN CONSOLE &rarr;</a>
    </div>

    <div class="footer">
      <strong>Security Notice:</strong> Email is for notification purposes only. Deciding on elevation requests is strictly restricted to the authenticated administrative portal.
    </div>
  </div>
</body>
</html>
"""
    return send_email(admin_recipient, subject, body_text, html_content)


def send_elevation_status_notification(
    recipient_email: str,
    recipient_name: Optional[str],
    status: str,
    review_notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Dispatches a confirmation notification to the applicant when their elevation request
    has been approved or rejected by an administrator.
    """
    name_display = recipient_name or "AeroCPI User"
    login_url = f"{settings.APP_BASE_URL}/login"
    is_approved = status.lower() == "approved"
    action_text = "APPROVED" if is_approved else "REJECTED"

    subject = f"[AeroCPI] Analyst Access Request: {action_text}"

    decision_msg = (
        "Your request for the ANALYST role has been approved by an administrator. "
        "You now have full access to daily price indices, raw fare downloads, and pipeline synchronization."
        if is_approved
        else "Your request for the ANALYST role has been reviewed and declined at this time."
    )

    notes_section = f"\nReviewer Notes:\n\"{review_notes}\"\n" if review_notes else ""

    body_text = f"""Hello {name_display},

This is an automated notification regarding your AeroCPI access elevation request.

Status: {action_text}

{decision_msg}
{notes_section}
To access your account and explore authorized services, please sign in at:
{login_url}

Best regards,
AeroCPI Administration Hub
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 24px; }}
    .card {{ background: #141414; border: 1px solid #2a2a2a; border-radius: 6px; max-width: 550px; margin: 0 auto; padding: 24px; }}
    .tag {{ display: inline-block; padding: 2px 8px; font-size: 11px; font-family: monospace; background: {'rgba(34, 197, 94, 0.15)' if is_approved else 'rgba(239, 68, 68, 0.15)'}; color: {'#22c55e' if is_approved else '#ef4444'}; border: 1px solid {'rgba(34, 197, 94, 0.3)' if is_approved else 'rgba(239, 68, 68, 0.3)'}; border-radius: 4px; }}
    h2 {{ color: #ffffff; margin-top: 12px; font-size: 18px; }}
    .notes {{ background: #0a0a0a; border-left: 3px solid #666; padding: 10px; color: #ccc; margin: 14px 0; font-size: 13px; font-style: italic; }}
    .btn {{ display: inline-block; padding: 10px 18px; background: #eab308; color: #000; font-weight: bold; font-family: monospace; font-size: 12px; text-decoration: none; border-radius: 4px; margin-top: 12px; }}
    .footer {{ margin-top: 24px; font-size: 11px; color: #666; border-top: 1px solid #222; padding-top: 12px; }}
  </style>
</head>
<body>
  <div class="card">
    <span class="tag">REQUEST {action_text}</span>
    <h2>Analyst Access Request: {action_text}</h2>
    <p style="color: #bbb; font-size: 13px; line-height: 1.5;">{decision_msg}</p>
    {f'<div class="notes"><strong>Reviewer Notes:</strong> "{review_notes}"</div>' if review_notes else ''}
    <div>
      <a href="{login_url}" class="btn">SIGN IN TO AEROCPI &rarr;</a>
    </div>
    <div class="footer">
      AeroCPI Automated Notifications &bull; This is an informational notification.
    </div>
  </div>
</body>
</html>
"""
    return send_email(recipient_email, subject, body_text, html_content)
