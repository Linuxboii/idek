import asyncio
import os
from app.auth import hash_password
from app import db


async def main():
    email = os.environ.get("ADMIN_EMAIL", "admin@yourdomain.com")
    password = os.environ.get("ADMIN_PASSWORD", "changeme123")
    name = os.environ.get("ADMIN_NAME", "Admin")
    await db.init_pool()
    uid = await db.create_user(email, name, hash_password(password), "admin")
    print(f"Admin created: {uid}")
    print(f"Email: {email}")
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
