// Runs once when a server instance starts: connects the Quality portal's results to Purchase and
// Production, and sets the subscription check, before any request is served.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerQualityHandlers } = await import('./src/quality-bridge');
    registerQualityHandlers();
    // Changes are refused once a company's subscription period has ended.
    const { registerSubscriptionGate } = await import('./src/billing/gate');
    registerSubscriptionGate();
  }
}
