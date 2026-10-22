"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import type { CooperativeRole } from "@/generated/prisma/enums";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isInvitableRole(role: string): role is Exclude<CooperativeRole, "OWNER"> {
  return role === "MANAGER" || role === "AGENT" || role === "PRODUCER";
}

async function getCurrentUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function createInvitation(data: FormData): Promise<{ url?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Votre session a expiré. Reconnectez-vous." };

  const cooperativeId = String(data.get("cooperativeId") ?? "").trim();
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const roleValue = String(data.get("role") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Saisissez une adresse e-mail valide." };
  }
  if (!isInvitableRole(roleValue)) {
    return { error: "Le rôle sélectionné n'est pas valide." };
  }
  const role = roleValue;

  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_cooperativeId: { userId: user.id, cooperativeId } },
    select: { role: true },
  });
  if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
    return { error: "Vous n'avez pas les droits pour inviter des membres." };
  }
  if (membership.role === "MANAGER" && role === "MANAGER") {
    return { error: "Seul le propriétaire peut inviter un autre gestionnaire." };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { memberships: { where: { cooperativeId }, select: { id: true } } },
  });
  if (existingUser?.memberships.length) {
    return { error: "Cette personne est déjà membre de la coopérative." };
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.invitation.deleteMany({
      where: { cooperativeId, email, acceptedAt: null },
    });
    await tx.invitation.create({
      data: {
        email,
        role,
        tokenHash: hashToken(token),
        cooperativeId,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  });

  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const invitationURL = new URL("/invitation", baseURL);
  invitationURL.searchParams.set("token", token);
  return { url: invitationURL.toString() };
}

export async function acceptInvitation(data: FormData): Promise<void> {
  const user = await getCurrentUser();
  const token = String(data.get("token") ?? "");
  if (!user) {
    redirect(`/connexion?next=${encodeURIComponent(`/invitation?token=${encodeURIComponent(token)}`)}`);
  }
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) redirect("/invitation?error=invalid");

  const prisma = getPrisma();
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, role: true, cooperativeId: true, expiresAt: true, acceptedAt: true },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    redirect("/invitation?error=expired");
  }
  if (invitation.email !== user.email.toLowerCase()) {
    redirect("/invitation?error=email-mismatch");
  }

  const accepted = await prisma.$transaction(async (tx) => {
    const accepted = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (!accepted.count) return false;
    await tx.membership.upsert({
      where: {
        userId_cooperativeId: { userId: user.id, cooperativeId: invitation.cooperativeId },
      },
      update: {},
      create: {
        userId: user.id,
        cooperativeId: invitation.cooperativeId,
        role: invitation.role,
      },
    });
    return true;
  });
  if (!accepted) redirect("/invitation?error=expired");

  redirect(`/dashboard?cooperative=${encodeURIComponent(invitation.cooperativeId)}`);
}
