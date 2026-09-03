# AeroCPI Backend Dockerfile
# ARCHITECTURE.md Section 2 (Containerization)

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browser dependencies (for scrapers)
RUN playwright install-deps || true
RUN playwright install chromium || true

# Copy backend source code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Default command runs FastAPI via uvicorn
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
