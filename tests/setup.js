import '@testing-library/jest-dom'

// Dummy Supabase env so modules that construct the service-role client at import
// time (e.g. api/lib/refresh.js) can load in tests. No network calls are made.
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key'
