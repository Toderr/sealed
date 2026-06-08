"use client";

// Installs the offline /api/* fetch interceptor as early as possible on the
// client when MOCK_DATA is on. Renders nothing.

import { installMockDataInterceptor } from "@/lib/mock-data";

// Install synchronously at module import (client only) so the interceptor is in
// place before any child component's effect fires a fetch.
installMockDataInterceptor();

export default function MockDataInstaller() {
  // Belt-and-suspenders: ensure install ran even if module eval was deferred.
  installMockDataInterceptor();
  return null;
}
