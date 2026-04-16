"""
Centralized configuration: environment variables, logging, and constants.
"""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s: %(message)s",
)

logger = logging.getLogger("context-compiler")

# ── Environment ───────────────────────────────────────────────────────────────

GOOGLE_GEMINI_API_KEY: str = os.environ["GOOGLE_GEMINI_API_KEY"]
DATABASE_URL: str = os.environ["DATABASE_URL"]

# ── Scanner constants ─────────────────────────────────────────────────────────

CHUNK_MAX_LINES = 100  # Max lines per chunk
CHUNK_OVERLAP_LINES = 20
PROGRESS_EVERY = 10    # Call back every N files processed
SCAN_HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("SCAN_HEARTBEAT_INTERVAL_SECONDS", "25"))
SCAN_GIT_HISTORY_DEPTH = int(os.getenv("SCAN_GIT_HISTORY_DEPTH", "50"))
CURRENT_INDEX_FORMAT_VERSION = 2

SKIP_DIRS: set[str] = {
    ".git", "node_modules", "vendor", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".turbo", "coverage",
}

BINARY_EXTENSIONS: set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".woff", ".woff2", ".ttf", ".eot",
    ".mp4", ".mp3", ".wav", ".avi", ".mov",
    ".exe", ".dll", ".so", ".dylib", ".bin",
    ".lock",  # package-lock / yarn.lock are too noisy
}

LANGUAGE_MAP: dict[str, str] = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".cs": "csharp",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp",
    ".c": "c", ".h": "c",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml", ".yml": "yaml",
    ".sql": "sql",
    ".sh": "bash",
    ".html": "html",
    ".css": "css",
}

# ── Embedding model ───────────────────────────────────────────────────────────

EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
ANSWER_MODEL = os.getenv("GEMINI_ANSWER_MODEL", "gemini-2.5-flash")
ANSWER_MODEL_FALLBACKS = [
    model.strip()
    for model in os.getenv(
        "GEMINI_ANSWER_MODEL_FALLBACKS",
        "gemini-3-flash-preview,gemini-2.5-flash,gemini-3.1-flash-lite-preview,gemini-2.5-flash-lite",
    ).split(",")
    if model.strip()
]
