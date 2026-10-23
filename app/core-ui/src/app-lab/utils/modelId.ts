// `id_decoded` is the plain id `app.yaml` holds; `id` is opaque and travels
// back on a path or in a brick request exactly as it arrived.
export function plainModelId(model: {
  id: string;
  id_decoded?: string;
}): string {
  return model.id_decoded || model.id;
}
