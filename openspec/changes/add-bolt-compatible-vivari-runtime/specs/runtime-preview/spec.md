# Runtime preview specification

The preview Service Worker SHALL be served same-origin with intentional scope. Preview readiness SHALL occur after a valid HTTP response, not merely after a port bind.

Attaching a preview SHALL be reversible. Teardown SHALL remove routes, detach bindings and ensure an old preview cannot serve a later runtime instance.
