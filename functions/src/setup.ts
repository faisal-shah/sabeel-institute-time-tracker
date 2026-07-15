import { setGlobalOptions } from 'firebase-functions/v2';

// Imported for its side effect before any function is defined. us-central1 pairs with
// the nam5 (US multi-region) Firestore location.
// invoker: 'public' makes every callable reachable at the Cloud Run layer (auth is still
// enforced in-code via the require* helpers). Without it, gen-2 callables 403 before the
// code runs and need a manual console grant.
setGlobalOptions({ region: 'us-central1', maxInstances: 10, invoker: 'public' });
