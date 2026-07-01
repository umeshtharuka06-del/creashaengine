import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-insecure-secret-change-me"
);

export const SESSION_COOKIE = "royal1_session";
const ISSUER = "royal1";

export interface SessionPayload {
  sub: string; // user id
  email: string;
  username: string;
  isAdmin: boolean;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      username: String(payload.username),
      isAdmin: Boolean(payload.isAdmin),
    };
  } catch {
    return null;
  }
}
