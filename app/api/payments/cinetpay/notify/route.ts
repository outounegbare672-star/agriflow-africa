import { NextResponse } from "next/server";
import { refreshCinetPayCheckout } from "@/lib/cinetpay";
import { getPrisma } from "@/lib/prisma";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (process.env.CINETPAY_MODE !== "sandbox" ||
    !process.env.CINETPAY_SANDBOX_API_KEY || !process.env.CINETPAY_SANDBOX_SITE_ID) {
    return NextResponse.json({ error: "CinetPay sandbox indisponible." }, { status: 503 });
  }

  let transactionId: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Notification invalide." }, { status: 400 });
    }
    if (isRecord(body)) {
      for (const key of ["cpm_trans_id", "transaction_id"]) {
        if (key in body && typeof body[key] === "string") {
          transactionId = body[key].trim();
          break;
        }
      }
    }
  } else {
    const formData = await request.formData();
    for (const key of ["cpm_trans_id", "transaction_id"]) {
      const value = formData.get(key);
      if (typeof value === "string" && value.trim()) {
        transactionId = value.trim();
        break;
      }
    }
  }
  if (!transactionId || transactionId.length > 80) {
    return NextResponse.json({ error: "Identifiant de transaction manquant." }, { status: 400 });
  }

  const checkout = await getPrisma().mobileMoneyCheckout.findUnique({
    where: { transactionId },
    select: { id: true },
  });
  if (!checkout) return NextResponse.json({ error: "Transaction inconnue." }, { status: 404 });

  try {
    const status = await refreshCinetPayCheckout(transactionId);
    return NextResponse.json({ received: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vérification CinetPay impossible.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
