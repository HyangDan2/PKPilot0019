/** Builds the JSON/Base64 form of a session off the main thread. */

import { serializeProject } from '../audio/project';
import type { ProjectState } from '../audio/types';

interface SerializeRequest {
  project: ProjectState;
}

self.onmessage = (event: MessageEvent<SerializeRequest>) => {
  const project = event.data?.project;
  if (!project) {
    self.postMessage({ ok: false, json: null });
    return;
  }
  try {
    const json = JSON.stringify(serializeProject(project));
    self.postMessage({ ok: true, json });
  } catch {
    self.postMessage({ ok: false, json: null });
  }
};
