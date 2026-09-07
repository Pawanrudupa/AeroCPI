import os
import asyncio
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

ARTIFACT_DIR = r"C:\Users\PAWAN\.gemini\antigravity\brain\5d0018f2-719f-4c41-95ee-aa98b1485e0e"

def add_browser_chrome(img_path: str, url: str, output_path: str):
    """
    Renders an authentic, crisp browser chrome window header with:
    - macOS / Unix style traffic light dots (close, minimize, expand)
    - Forward / Back / Reload buttons
    - Full address bar with security lock and the actual URL
    """
    body_img = Image.open(img_path)
    width, height = body_img.size
    chrome_height = 44

    # Create new canvas with extra height for chrome bar
    final_img = Image.new("RGBA", (width, height + chrome_height), (18, 20, 26, 255))
    draw = ImageDraw.Draw(final_img)

    # Header background
    draw.rectangle([0, 0, width, chrome_height], fill=(22, 25, 33, 255))
    # Bottom border line
    draw.line([(0, chrome_height - 1), (width, chrome_height - 1)], fill=(44, 49, 62, 255), width=1)

    # Window traffic light buttons (Red, Yellow, Green)
    draw.ellipse([16, 16, 28, 28], fill=(255, 95, 87, 255))
    draw.ellipse([36, 16, 48, 28], fill=(254, 188, 46, 255))
    draw.ellipse([56, 16, 68, 28], fill=(40, 200, 64, 255))

    # Navigation arrows (Left, Right, Reload)
    draw.polygon([(88, 22), (83, 22), (83, 21), (80, 22), (83, 23), (83, 22)], fill=(120, 130, 150, 255))
    draw.text((80, 14), "←   →   ↻", fill=(140, 150, 170, 255))

    # Address bar box
    bar_x1 = 180
    bar_x2 = width - 100
    draw.rounded_rectangle([bar_x1, 8, bar_x2, 36], radius=6, fill=(12, 14, 18, 255), outline=(50, 56, 70, 255), width=1)

    # Lock icon and URL text
    draw.text((bar_x1 + 14, 13), f"🔒 {url}", fill=(200, 210, 230, 255))

    # Paste the web page screenshot below the chrome bar
    final_img.paste(body_img, (0, chrome_height))
    final_img.save(output_path, "PNG")
    print(f"Saved styled screenshot to: {output_path}")

async def capture_views():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 960},
            device_scale_factor=1.5
        )
        page = await context.new_page()

        print("Navigating to login page...")
        await page.goto("http://localhost:3000/login", wait_until="networkidle")
        await asyncio.sleep(1)

        from backend.app.config import settings
        admin_pass = settings.admin_password or os.environ.get("BOOTSTRAP_ADMIN_PASSWORD")
        if not admin_pass:
            raise ValueError("BOOTSTRAP_ADMIN_PASSWORD not set in environment or .env")

        # Fill in Admin credentials
        print("Logging in as Administrator...")
        await page.fill('input[type="email"]', settings.SEED_ADMIN_EMAIL)
        await page.fill('input[type="password"]', admin_pass)
        await page.click('button[type="submit"]')

        # Wait for redirect to dashboard
        await page.wait_for_url("**/dashboard", timeout=8000)
        print("Logged in successfully! Redirected to /dashboard.")
        await asyncio.sleep(1.5)

        # 1. Capture /admin/users
        print("Navigating to /admin/users...")
        await page.goto("http://localhost:3000/admin/users", wait_until="networkidle")
        await asyncio.sleep(2)
        raw_admin_path = os.path.join(ARTIFACT_DIR, "raw_admin_users.png")
        final_admin_path = os.path.join(ARTIFACT_DIR, "admin_users_page.png")
        await page.screenshot(path=raw_admin_path)
        add_browser_chrome(raw_admin_path, "http://localhost:3000/admin/users", final_admin_path)

        # 1b. Capture Provision Modal Open
        print("Opening Provision Modal...")
        await page.click('button:has-text("PROVISION NEW ACCOUNT")')
        await asyncio.sleep(1)
        raw_modal_path = os.path.join(ARTIFACT_DIR, "raw_modal.png")
        final_modal_path = os.path.join(ARTIFACT_DIR, "admin_provision_modal.png")
        await page.screenshot(path=raw_modal_path)
        add_browser_chrome(raw_modal_path, "http://localhost:3000/admin/users", final_modal_path)
        await page.click('button:has-text("CANCEL")')
        await asyncio.sleep(1)

        # 2. Capture /account
        print("Navigating to /account...")
        await page.goto("http://localhost:3000/account", wait_until="networkidle")
        await asyncio.sleep(2)

        raw_account_path = os.path.join(ARTIFACT_DIR, "raw_account_profile.png")
        final_account_path = os.path.join(ARTIFACT_DIR, "account_profile_page.png")
        await page.screenshot(path=raw_account_path)
        add_browser_chrome(raw_account_path, "http://localhost:3000/account", final_account_path)

        # Clean up temporary raw images
        for raw in [raw_admin_path, raw_modal_path, raw_account_path]:
            if os.path.exists(raw):
                os.remove(raw)

        await browser.close()
        print("All screenshots successfully captured!")

if __name__ == "__main__":
    asyncio.run(capture_views())
