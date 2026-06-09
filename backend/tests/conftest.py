"""Shared pytest fixtures. Adds the backend dir to sys.path so tests can
import mydata_schema/calculations/agents/state as top-level modules without
turning backend/ itself into a package."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# agents.py constructs OpenAI() at import-time, which requires a key. Tests
# mock out anything that would actually call the API, so a placeholder is fine.
os.environ.setdefault("OPENAI_API_KEY", "sk-test-placeholder-not-used")
