// Local negative-control prerequisite, NOT a live-provider campaign.
// Expectations are explicit API-contract outcomes, not the product's own score.
import { it, expect, vi } from 'vitest';
import worker from '../worker.js';
import { shirabeScenarios } from './fixtures/shirabe-adversarial-scenarios.js';

const cases = [
  ['consent-string', { consent: 'true' }, 400],
  ['consent-false', { consent: false }, 400],
  ['loss-without-basis', { claimed_loss_amount: 10000000, loss_basis: 'unknown' }, 400],
  ['missing-owner', { name: '' }, 400],
  ['missing-company', { company: '' }, 400],
  ['unusable-email', { email: 'invalid' }, 400],
  ['missing-outcome', { desired_outcome: '' }, 400],
  ['unsupported-schema', { schema: 'unknown/v99' }, 400],
  ['unsupported-mode', { mode: 'autonomous' }, 400],
  ['expired-intake', { started_at: 1 }, 400],
  ['oversized-intake', { problem: 'x'.repeat(33000) }, 413],
  ['unsupported-sensitivity', { sensitivity: 'classified' }, 400],
];

for (const language of ['en', 'es']) {
  for (let repetition = 1; repetition <= 3; repetition++) {
    for (const [name, patch, status] of cases) {
      it(`acceptance72/${language}/${name}/${repetition}: rejects before persistence or email`, async () => {
        const seed = shirabeScenarios.find(s => s.language === language && s.complexity === 5);
        const prepare = vi.fn(() => { throw new Error('unexpected persistence'); });
        const batch = vi.fn(() => { throw new Error('unexpected persistence'); });
        const send = vi.fn(() => { throw new Error('unexpected email'); });
        const response = await worker.fetch(new Request('https://shikigamitechnologies.com/api/shirabe-intake', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'https://shikigamitechnologies.com' },
          body: JSON.stringify({ ...seed.payload, started_at: Date.now() - 6000, ...patch }),
        }), { LEADS: { prepare, batch }, PILOT_EMAIL: { send } });
        expect(response.status).toBe(status);
        expect(prepare).not.toHaveBeenCalled();
        expect(batch).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
      });
    }
  }
}
