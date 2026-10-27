const FORMAT = 'quoteflow-assets-v1';
const IMAGE_FIELDS = ['logoDataUrl', 'signatureDataUrl'];

function mapProfiles(workspace, transform) {
  return {
    ...workspace,
    businessProfile: transform(workspace.businessProfile),
    documents: workspace.documents.map(document => ({ ...document, business: transform(document.business) })),
  };
}

// A lossless response format, not a storage migration. Each historical image is
// transferred once, even when copied into hundreds of document snapshots.
export function packWorkspace(workspace) {
  const assets = [];
  const indexes = new Map();
  const packed = mapProfiles(workspace, profile => {
    if (!profile) return profile;
    const next = { ...profile };
    for (const field of IMAGE_FIELDS) {
      const value = profile[field];
      if (typeof value !== 'string' || !value.startsWith('data:image/') || value.length < 4096) continue;
      if (!indexes.has(value)) {
        indexes.set(value, assets.length);
        assets.push(value);
      }
      next[field] = { quoteFlowAsset: indexes.get(value) };
    }
    return next;
  });
  return { format: FORMAT, assets, workspace: packed };
}

export function unpackWorkspace(value) {
  // Older deployments and clients can continue using the ordinary JSON format.
  if (value?.format !== FORMAT) return value;
  if (!Array.isArray(value.assets) || !value.assets.every(asset => typeof asset === 'string' && asset.startsWith('data:image/')) ||
      !value.workspace?.businessProfile || !Array.isArray(value.workspace.documents)) {
    throw new Error('The workspace download is incomplete. Please retry recovery.');
  }
  return mapProfiles(value.workspace, profile => {
    if (!profile) return profile;
    const next = { ...profile };
    for (const field of IMAGE_FIELDS) {
      const reference = profile[field];
      if (reference == null || typeof reference === 'string') continue;
      const index = reference.quoteFlowAsset;
      if (!Number.isInteger(index) || index < 0 || index >= value.assets.length) {
        throw new Error('A saved document image is missing from the download. Please retry recovery.');
      }
      next[field] = value.assets[index];
    }
    return next;
  });
}
