const { onRequest } = require('firebase-functions/v2/https');

// the Express app is loaded lazily: importing it runs the env validation in
// backend/src/lib/env.ts, and the secrets below only exist as environment
// variables inside the deployed function, not during local deploy analysis
let app;

exports.api = onRequest(
  {
    region: 'us-central1',
    maxInstances: 3,
    // RESEND_API_KEY is intentionally not a secret: signup emails can't work
    // until the hardcoded from-address in backend/src/utils/sendmail.ts points
    // to a domain verified in your own Resend account. A placeholder in
    // functions/.env satisfies the env validation; see docs/firebase-deployment.md
    secrets: ['SECRET', 'DATABASE_URL', 'DEEPL_API_KEY'],
  },
  (req, res) => {
    if (!app) {
      // eslint-disable-next-line global-require
      app = require('./build/backend/src/app').default;
    }
    return app(req, res);
  }
);
