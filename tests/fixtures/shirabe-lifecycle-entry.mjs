// LOCAL TEST ENTRY ONLY. Never configured as a deployment entry point.
import worker from '../../worker.js';
export default {
  async fetch(request, env) {
    const runtime = { ...env, PILOT_EMAIL: { async send(message) {
      await env.LEADS.prepare('INSERT INTO test_notifications(subject) VALUES(?)').bind(message.subject).run();
      return { messageId: crypto.randomUUID() };
    } } };
    const path = new URL(request.url).pathname;
    if (path === '/__test/receipts') {
      return Response.json({
        intakes: (await env.LEADS.prepare('SELECT id,language,status FROM shirabe_intakes').all()).results,
        notifications: (await env.LEADS.prepare('SELECT count(*) AS count FROM test_notifications').first()).count,
        outbox: (await env.LEADS.prepare('SELECT status FROM shirabe_notification_outbox').all()).results,
      });
    }
    return worker.fetch(request, runtime);
  },
};
