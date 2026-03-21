import os
from dotenv import load_dotenv

load_dotenv()

# OpenAI (Whisper only)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Snowflake Cortex
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USER", "")
SNOWFLAKE_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD", "")
SNOWFLAKE_ROLE = os.getenv("SNOWFLAKE_ROLE", "")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE", "")
CORTEX_MODEL = os.getenv("CORTEX_MODEL", "mistral-large2")
