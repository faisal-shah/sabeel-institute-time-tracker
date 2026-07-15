// Vitest global setup for functions tests. Integration tests expect the Firebase
// emulators (see scripts/test-emulator.sh); unit tests run standalone.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-sabeel';
