"""
AeroCPI Configuration Module.
Implements ARCHITECTURE.md Section 2 (Tech stack) & User specifications.
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./aerocpi.db"
    
    # JWT Authentication (PyJWT)
    JWT_SECRET: str = "default-dev-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # Seed Analyst User (Explicit user specification: non-institutional domain, env-based password)
    SEED_ANALYST_EMAIL: str = "demo.analyst@aerocpi.local"
    SEED_ANALYST_PASSWORD: Optional[str] = None
    
    # Raw landing zone (ARCHITECTURE.md Section 1 & 3: Immutable raw layer)
    RAW_STORAGE_DIR: str = "./data/raw"
    
    # LLM Fallback (ARCHITECTURE.md Section 2: Gemini Flash)
    GEMINI_API_KEY: Optional[str] = None

    # SerpAPI Integration (Google Flights live fare collection)
    SERPAPI: Optional[str] = None
    SERPAPI_API_KEY: Optional[str] = None

    @property
    def serpapi_key(self) -> Optional[str]:
        return self.SERPAPI_API_KEY or self.SERPAPI

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
