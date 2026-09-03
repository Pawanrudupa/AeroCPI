"""
AeroCPI Raw Data Landing Zone Storage.
Implements:
- ARCHITECTURE.md Section 1 (Raw data immutability & audit trail)
- ARCHITECTURE.md Section 2 (Raw landing zone)
- User Requirement: explicit source_type ("live" | "seeded")
"""
import os
import json
import hashlib
import datetime as dt
from pathlib import Path
from typing import Any, Union
from sqlmodel import Session
from backend.app.config import settings
from backend.app.models import RawSnapshot


def get_landing_zone_dir() -> Path:
    """Ensure and return the raw data landing zone directory."""
    path = Path(settings.RAW_STORAGE_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_raw_snapshot(
    session: Session,
    source: str,
    route: str,
    window: str,
    payload: Union[dict, list, str],
    source_type: str = "live",
    status: str = "success",
    flight_count: int = 0
) -> RawSnapshot:
    """
    Save an immutable raw snapshot to disk/landing zone and record it in the database.
    Computes a cryptographic SHA-256 hash for tamper-proof audit trail.
    """
    landing_dir = get_landing_zone_dir()
    
    if isinstance(payload, (dict, list)):
        content_str = json.dumps(payload, indent=2, sort_keys=True)
        file_ext = "json"
    else:
        content_str = str(payload)
        file_ext = "html" if "<html" in content_str.lower() else "txt"
        
    content_bytes = content_str.encode("utf-8")
    content_hash = hashlib.sha256(content_bytes).hexdigest()
    
    # Immutable filename convention: {source_type}_{source}_{route}_{window}_{timestamp}_{short_hash}.{ext}
    timestamp_str = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
    clean_route = route.replace("/", "-")
    filename = f"{source_type}_{source}_{clean_route}_{window}_{timestamp_str}_{content_hash[:8]}.{file_ext}"
    relative_path = os.path.join(settings.RAW_STORAGE_DIR, filename)
    absolute_path = landing_dir / filename
    
    # Write once, never overwrite (immutable)
    if not absolute_path.exists():
        with open(absolute_path, "w", encoding="utf-8") as f:
            f.write(content_str)
            
    snapshot = RawSnapshot(
        source=source.lower(),
        source_type=source_type,
        route=route.upper(),
        window=window.upper(),
        storage_path=str(relative_path).replace("\\", "/"),
        content_hash=content_hash,
        flight_count=flight_count,
        status=status
    )
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return snapshot


def load_raw_snapshot_content(snapshot: RawSnapshot) -> str:
    """Read the immutable raw snapshot content from storage."""
    file_path = Path(snapshot.storage_path)
    if not file_path.exists():
        # Attempt fallback to relative from landing directory
        file_path = get_landing_zone_dir() / Path(snapshot.storage_path).name
        
    if not file_path.exists():
        raise FileNotFoundError(f"Raw snapshot file not found: {snapshot.storage_path}")
        
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Verify hash integrity
    actual_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    if actual_hash != snapshot.content_hash:
        raise ValueError(f"Snapshot integrity violation! Expected {snapshot.content_hash}, got {actual_hash}")
        
    return content
