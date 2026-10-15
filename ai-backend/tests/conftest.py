import os
import sys
from pathlib import Path

# Modules read configuration at import time, so set safe test values first.
os.environ.setdefault("GOOGLE_GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/test")
os.environ.setdefault("AI_BACKEND_SECRET", "test-secret-test-secret-test-secret-123")
os.environ.setdefault("APP_BASE_URL", "https://app.example.com")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
