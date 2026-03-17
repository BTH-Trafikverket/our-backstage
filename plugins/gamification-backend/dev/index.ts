import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';

// Minimal standalone development backend for the gamification plugin.
// The plugin is mounted under /api/gamification with mocked auth/httpAuth and
// a tiny in-memory catalog. Useful for quick local route checks, for example:
//
//   curl http://localhost:7007/api/gamification/xp?subjectRef=user:default/alice \
//     -H 'Authorization: Bearer mock-service-token'

const backend = createBackend();

backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

backend.add(
  catalogServiceMock.factory({
    entities: [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'sample',
          title: 'Sample Component',
        },
        spec: {
          type: 'service',
        },
      },
    ],
  }),
);

backend.add(import('../src'));

backend.start();
