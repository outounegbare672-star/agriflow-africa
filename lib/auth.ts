import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "@/lib/prisma";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (process.env.NODE_ENV === "production" && !secret) {
    throw new Error("BETTER_AUTH_SECRET must be configured in production.");
  }
  if (process.env.NODE_ENV === "production" && !baseURL) {
    throw new Error("BETTER_AUTH_URL must be configured in production.");
  }
  if (process.env.NODE_ENV === "production" && secret && secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }

  return betterAuth({
    appName: "Agriflow Africa",
    baseURL: baseURL ?? "http://localhost:3000",
    ...(secret ? { secret } : {}),
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    trustedOrigins: [baseURL ?? "http://localhost:3000"],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;
let authInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (authInstance) {
    return authInstance;
  }

  authInstance = createAuth();
  return authInstance;
}
