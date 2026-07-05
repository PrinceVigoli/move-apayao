/**
 * Minimal payment-provider abstraction for wallet top-ups.
 *
 * IMPORTANT: this ships with a stub implementation. The whole point of this
 * file is to make it impossible for a self-service top-up to credit the
 * wallet ledger directly (see routes/wallet.ts) — real money must flow
 * through a real provider (PayMongo, Xendit, GCash, a card processor, etc.)
 * before `fareWalletsTable.balance` is touched.
 *
 * To go live: implement `createCheckout` and `verifyWebhook` against your
 * chosen provider's SDK/API and swap out `StubPaymentProvider` below. Do not
 * remove the interface boundary — it's what keeps the webhook handler as
 * the only path that can credit a wallet.
 */

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface PaymentEvent {
  type: "payment.succeeded" | "payment.failed";
  referenceId: string;
}

export interface PaymentProvider {
  createCheckout(params: { amount: number; referenceId: string }): Promise<CheckoutSession>;
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean;
  parseEvent(rawBody: Buffer): PaymentEvent;
}

class StubPaymentProvider implements PaymentProvider {
  async createCheckout(): Promise<CheckoutSession> {
    throw new Error(
      "No payment provider configured. Wire up a real provider (PayMongo/Xendit/etc.) " +
        "in lib/payment-provider.ts before enabling self-service top-ups.",
    );
  }

  verifySignature(): boolean {
    return false;
  }

  parseEvent(): PaymentEvent {
    throw new Error("No payment provider configured.");
  }
}

let _provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!_provider) {
    _provider = new StubPaymentProvider();
  }
  return _provider;
}
