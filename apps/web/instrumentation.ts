// Runs once when a server instance starts: connects the Quality portal's results to Purchase and
// Production before any request is served.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerQualityHandlers } = await import('./src/quality-bridge');
    registerQualityHandlers();
  }
}
