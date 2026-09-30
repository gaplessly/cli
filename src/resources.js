// The eight read endpoints of the Gaplessly API, one command each.
// scripts/check-spec.js compares this map with the live OpenAPI document, so
// an endpoint added to the API without a command here fails CI.
export const RESOURCES = {
  organization: { path: '/api/v1/organization', list: false, summary: 'Your organization profile' },
  clients: { path: '/api/v1/clients', list: true, summary: 'Client directory' },
  services: { path: '/api/v1/services', list: true, summary: 'Services you offer (appointments)' },
  providers: { path: '/api/v1/providers', list: true, summary: 'Staff who take appointments' },
  appointments: { path: '/api/v1/appointments', list: true, range: true, summary: 'Appointments, filterable by start time' },
  tables: { path: '/api/v1/tables', list: true, summary: 'Tables (hospitality)' },
  'service-periods': { path: '/api/v1/service-periods', list: true, summary: 'Service periods such as lunch and dinner (hospitality)' },
  reservations: { path: '/api/v1/reservations', list: true, range: true, summary: 'Table reservations, filterable by start time' },
};
