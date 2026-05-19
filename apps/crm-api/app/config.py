from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    WA_PHONE_NUMBER_ID: str
    WA_ACCESS_TOKEN: str
    WA_VERIFY_TOKEN: str
    WA_BUSINESS_ACCOUNT_ID: str = ""

    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TRANSCRIBE_MODEL: str = "whisper-1"
    OPENAI_MAX_TOKENS: int = 300

    DATABASE_URL: str

    GCAL_CALENDAR_ID: str = ""
    GCAL_SERVICE_ACCOUNT_FILE: str = ""
    GCAL_DELEGATED_USER: str = ""

    LOG_LEVEL: str = "INFO"
    TIMEZONE_OFFSET: str = "+05:30"

    ADMIN_TOKEN: str = "change-me"

    # CRM / Auth
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480   # 8 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    BUSINESS_NAME: str = "Business"


settings = Settings()
