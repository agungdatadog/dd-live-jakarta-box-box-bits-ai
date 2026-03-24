/**
 * Custom promptfoo provider for the Pitwall Chat endpoint.
 *
 * Why a custom class provider instead of the built-in `https` provider?
 * When AI Guard is in blocking mode it returns HTTP 403. The built-in
 * `https` provider treats 4xx as a fatal "target unavailable" error and
 * aborts the entire scan after a few consecutive failures.
 *
 * This class uses Node's built-in fetch directly, so we control the
 * status-code handling. A 403 (AI Guard block) is returned to the grader
 * as a valid response string — the scan continues through all 160 tests.
 */

const DEFAULT_URL =
  'https://box-box-bits-ai-449012790678.asia-southeast1.run.app/api/pitwall';

class PitwallProvider {
  id() {
    return 'pitwall-chat';
  }

  async callApi(prompt) {
    const url = process.env.APP_URL
      ? `${process.env.APP_URL}/api/pitwall`
      : DEFAULT_URL;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          userId: 'redteam-scanner',
          username: 'RedTeam',
          sessionId: 'redteam-scan-001',
        }),
      });
    } catch (err) {
      return { output: `[network error] ${err.message}` };
    }

    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }

    // Return reply text or error reason (AI Guard block, Gemini error, etc.)
    // A string output here means promptfoo grades this as a valid response
    // instead of treating the 403 as an unrecoverable target failure.
    return {
      output: body.reply || body.error || `HTTP ${response.status}`,
    };
  }
}

module.exports = PitwallProvider;
