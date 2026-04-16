import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  backend_url: process.env.BACKEND_URL ?? "http://localhost:3000",
  frontend_url: process.env.FRONTEND_URL,
  node_env: process.env.NODE_ENV?.trim(),
  port: process.env.PORT,
  database_url:
    process.env.DATABASE_URL ?? "mongodb://localhost:27017/nupem_db",
  bcrypt_salt_rounds: 10,
  jwt_secret: process.env.JWT_SECRET,
  jwt_expire: "7d",
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_refresh_expire: "365d",
  send_otp_interval: 300,
  otp_lifetime: 300,
  smtp_host: process.env.SMTP_HOST,
  smtp_port: process.env.SMTP_PORT,
  smtp_email: process.env.SMTP_EMAIL,
  smtp_email_username: process.env.SMTP_EMAIL_USERNAME,
  smtp_email_password: process.env.SMTP_EMAIL_PASSWORD,
};
