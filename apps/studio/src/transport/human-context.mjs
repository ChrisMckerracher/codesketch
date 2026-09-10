export function checkHumanGeneration(body, session) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.source !== 'human') return;
  if (body.expectedDocGeneration !== session.controlGrant.docGeneration) {
    throw Object.assign(
      new Error('Human write requires a top-level expectedDocGeneration matching the current document generation'),
      { statusCode: 409 },
    );
  }
}
