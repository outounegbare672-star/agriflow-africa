"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { dispatchSms } from "@/lib/sms";

export async function retrySmsNotification(data: FormData) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?next=%2Fnotifications");

  const cooperativeId = String(data.get("cooperativeId") ?? "").trim();
  const notificationId = String(data.get("notificationId") ?? "").trim();
  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_cooperativeId: { userId: session.user.id, cooperativeId } },
    select: { role: true },
  });
  if (!membership) redirect("/notifications?error=unauthorized");
  if (membership.role === "PRODUCER") redirect("/notifications?error=forbidden");

  const notification = await prisma.smsNotification.findFirst({
    where: { id: notificationId, cooperativeId },
    select: { id: true, status: true },
  });
  if (!notification) redirect(`/notifications?cooperative=${encodeURIComponent(cooperativeId)}&error=not-found`);

  if (notification.status === "FAILED") {
    await prisma.smsNotification.updateMany({
      where: { id: notification.id, cooperativeId, status: "FAILED" },
      data: { status: "PENDING", error: null },
    });
  }
  const result = await dispatchSms(notification.id);
  const outcome = result === "SENT" ? "sent" : result === "PENDING" ? "pending" : "failed";
  redirect(`/notifications?cooperative=${encodeURIComponent(cooperativeId)}&result=${outcome}`);
}
