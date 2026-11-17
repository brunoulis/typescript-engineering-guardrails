/** This destructive fixture deliberately accepts only its dedicated local databases. */
export function assertLocalTestDatabase(value: string): void {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !['/guardrails_backend', '/rails_backend_test'].includes(url.pathname)
    || !url.username || !url.password || !url.port || url.search || url.hash) {
    throw new Error('Expected an explicit dedicated local test database URL');
  }
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} explicitly; see README.md`);
  return value;
}
